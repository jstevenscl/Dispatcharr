from django.db.models.signals import post_save, post_delete, pre_save
from django.dispatch import receiver
from .models import EPGSource
from .tasks import refresh_epg_data
from django_celery_beat.models import PeriodicTask, IntervalSchedule
import json

@receiver(post_save, sender=EPGSource)
def trigger_refresh_on_new_epg_source(sender, instance, created, **kwargs):
    # Trigger refresh only if the source is newly created and active
    if created and instance.is_active:
        refresh_epg_data.delay(instance.id)

@receiver(post_save, sender=EPGSource)
def create_or_update_refresh_task(sender, instance, **kwargs):
    """
    Create or update a Celery Beat periodic task when an EPGSource is created/updated.
    """
    task_name = f"epg_source-refresh-{instance.id}"
    interval, _ = IntervalSchedule.objects.get_or_create(
        every=int(instance.refresh_interval),
        period=IntervalSchedule.HOURS
    )

    task, created = PeriodicTask.objects.get_or_create(name=task_name, defaults={
        "interval": interval,
        "task": "apps.epg.tasks.refresh_epg_data",
        "kwargs": json.dumps({"source_id": instance.id}),
        "enabled": instance.refresh_interval != 0,
    })

    update_fields = []
    if created:
        task.interval = interval

    if task.interval != interval:
        task.interval = interval
        update_fields.append("interval")
    if task.enabled != (instance.refresh_interval != 0):
        task.enabled = instance.refresh_interval != 0
        update_fields.append("enabled")

    if update_fields:
        task.save(update_fields=update_fields)

    if instance.refresh_task != task:
        instance.refresh_task = task
        instance.save(update_fields=update_fields)

@receiver(post_delete, sender=EPGSource)
def delete_refresh_task(sender, instance, **kwargs):
    """
    Delete the associated Celery Beat periodic task when a Channel is deleted.
    """
    if instance.refresh_task:
        instance.refresh_task.delete()

@receiver(pre_save, sender=EPGSource)
def update_status_on_active_change(sender, instance, **kwargs):
    """
    When an EPGSource's is_active field changes, update the status accordingly.
    """
    if instance.pk:  # Only for existing records, not new ones
        try:
            # Get the current record from the database
            old_instance = EPGSource.objects.get(pk=instance.pk)

            # If is_active changed, update the status
            if old_instance.is_active != instance.is_active:
                if instance.is_active:
                    # When activating, set status to idle
                    instance.status = 'idle'
                else:
                    # When deactivating, set status to disabled
                    instance.status = 'disabled'
        except EPGSource.DoesNotExist:
            # New record, will use default status
            pass
