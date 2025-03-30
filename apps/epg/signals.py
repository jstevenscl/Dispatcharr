from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import EPGSource
from .tasks import refresh_epg_data
from django_celery_beat.models import PeriodicTask, IntervalSchedule
import json

@receiver(post_save, sender=EPGSource)
def trigger_refresh_on_new_epg_source(sender, instance, created, **kwargs):
    # Trigger refresh only if the source is newly created and active
    if created and instance.is_active:
        refresh_epg_data.delay()

@receiver(post_save, sender=EPGSource)
def create_or_update_refresh_task(sender, instance, **kwargs):
    """
    Create or update a Celery Beat periodic task when an EPGSource is created/updated.
    """
    task_name = f"epg_source-refresh-{instance.id}"

    interval, _ = IntervalSchedule.objects.get_or_create(
        every=24,
        period=IntervalSchedule.HOURS
    )

    if not instance.refresh_task:
        refresh_task = PeriodicTask.objects.create(
            name=task_name,
            interval=interval,
            task="apps.epg.tasks.refresh_epg_data",
            kwargs=json.dumps({"source_id": instance.id}),
            enabled=instance.refresh_interval != 0,
        )
        EPGSource.objects.filter(id=instance.id).update(refresh_task=refresh_task)
    else:
        task = instance.refresh_task
        updated_fields = []

        if task.enabled != (instance.refresh_interval != 0):
            task.enabled = instance.refresh_interval != 0
            updated_fields.append("enabled")

        if task.interval != interval:
            task.interval = interval
            updated_fields.append("interval")

        if updated_fields:
            task.save(update_fields=updated_fields)

@receiver(post_delete, sender=EPGSource)
def delete_refresh_task(sender, instance, **kwargs):
    """
    Delete the associated Celery Beat periodic task when a Channel is deleted.
    """
    if instance.refresh_task:
        instance.refresh_task.interval.delete()
        instance.refresh_task.delete()
