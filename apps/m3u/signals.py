# apps/m3u/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import M3UAccount
from .tasks import refresh_single_m3u_account, refresh_m3u_groups
from django_celery_beat.models import PeriodicTask, IntervalSchedule
import json

@receiver(post_save, sender=M3UAccount)
def refresh_account_on_save(sender, instance, created, **kwargs):
    """
    When an M3UAccount is saved (created or updated),
    call a Celery task that fetches & parses that single account
    if it is active or newly created.
    """
    if created and instance.account_type != M3UAccount.Types.XC:
        refresh_m3u_groups.delay(instance.id)

@receiver(post_save, sender=M3UAccount)
def create_or_update_refresh_task(sender, instance, **kwargs):
    """
    Create or update a Celery Beat periodic task when an M3UAccount is created/updated.
    """
    task_name = f"m3u_account-refresh-{instance.id}"

    interval, _ = IntervalSchedule.objects.get_or_create(
        every=int(instance.refresh_interval),
        period=IntervalSchedule.HOURS
    )

    # First check if the task already exists to avoid validation errors
    try:
        task = PeriodicTask.objects.get(name=task_name)
        # Task exists, just update it
        updated_fields = []

        if task.enabled != (instance.refresh_interval != 0):
            task.enabled = instance.refresh_interval != 0
            updated_fields.append("enabled")

        if task.interval != interval:
            task.interval = interval
            updated_fields.append("interval")

        if updated_fields:
            task.save(update_fields=updated_fields)

        # Ensure instance has the task
        if instance.refresh_task_id != task.id:
            M3UAccount.objects.filter(id=instance.id).update(refresh_task=task)

    except PeriodicTask.DoesNotExist:
        # Create new task if it doesn't exist
        refresh_task = PeriodicTask.objects.create(
            name=task_name,
            interval=interval,
            task="apps.m3u.tasks.refresh_single_m3u_account",
            kwargs=json.dumps({"account_id": instance.id}),
            enabled=instance.refresh_interval != 0,
        )
        M3UAccount.objects.filter(id=instance.id).update(refresh_task=refresh_task)

@receiver(post_delete, sender=M3UAccount)
def delete_refresh_task(sender, instance, **kwargs):
    """
    Delete the associated Celery Beat periodic task when a Channel is deleted.
    """
    if instance.refresh_task:
        instance.refresh_task.interval.delete()
        instance.refresh_task.delete()
