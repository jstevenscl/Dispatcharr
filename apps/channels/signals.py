# apps/channels/signals.py

from django.db.models.signals import m2m_changed, pre_save, post_save, post_delete
from django.dispatch import receiver
from django.utils.timezone import now
from celery.result import AsyncResult
from .models import Channel, Stream, ChannelProfile, ChannelProfileMembership, Recording
from apps.m3u.models import M3UAccount
from apps.epg.tasks import parse_programs_for_tvg_id
import logging, requests, time
from .tasks import run_recording

logger = logging.getLogger(__name__)

@receiver(m2m_changed, sender=Channel.streams.through)
def update_channel_tvg_id_and_logo(sender, instance, action, reverse, model, pk_set, **kwargs):
    """
    Whenever streams are added to a channel:
      1) If the channel doesn't have a tvg_id, fill it from the first newly-added stream that has one.
    """
    # We only care about post_add, i.e. once the new streams are fully associated
    if action == "post_add":
        # --- 1) Populate channel.tvg_id if empty ---
        if not instance.tvg_id:
            # Look for newly added streams that have a nonempty tvg_id
            streams_with_tvg = model.objects.filter(pk__in=pk_set).exclude(tvg_id__exact='')
            if streams_with_tvg.exists():
                instance.tvg_id = streams_with_tvg.first().tvg_id
                instance.save(update_fields=['tvg_id'])

@receiver(pre_save, sender=Stream)
def set_default_m3u_account(sender, instance, **kwargs):
    """
    This function will be triggered before saving a Stream instance.
    It sets the default m3u_account if not provided.
    """
    if not instance.m3u_account:
        instance.is_custom = True
        default_account = M3UAccount.get_custom_account()

        if default_account:
            instance.m3u_account = default_account
        else:
            raise ValueError("No default M3UAccount found.")

@receiver(post_save, sender=Channel)
def refresh_epg_programs(sender, instance, created, **kwargs):
    if instance.epg_data:
        parse_programs_for_tvg_id.delay(instance.epg_data.id)

@receiver(post_save, sender=Channel)
def add_new_channel_to_groups(sender, instance, created, **kwargs):
    if created:
        profiles = ChannelProfile.objects.all()
        ChannelProfileMembership.objects.bulk_create([
            ChannelProfileMembership(channel_profile=profile, channel=instance)
            for profile in profiles
        ])

@receiver(post_save, sender=ChannelProfile)
def create_profile_memberships(sender, instance, created, **kwargs):
    if created:
        channels = Channel.objects.all()
        ChannelProfileMembership.objects.bulk_create([
            ChannelProfileMembership(channel_profile=instance, channel=channel)
            for channel in channels
        ])

def schedule_recording_task(instance):
    eta = instance.start_time
    task = run_recording.apply_async(
        args=[instance.channel_id, str(instance.start_time), str(instance.end_time)],
        eta=eta
    )
    return task.id

def revoke_task(task_id):
    if task_id:
        AsyncResult(task_id).revoke()

@receiver(pre_save, sender=Recording)
def revoke_old_task_on_update(sender, instance, **kwargs):
    if not instance.pk:
        return  # New instance
    try:
        old = Recording.objects.get(pk=instance.pk)
        if old.task_id and (
            old.start_time != instance.start_time or
            old.end_time != instance.end_time or
            old.channel_id != instance.channel_id
        ):
            revoke_task(old.task_id)
            instance.task_id = None
    except Recording.DoesNotExist:
        pass

@receiver(post_save, sender=Recording)
def schedule_task_on_save(sender, instance, created, **kwargs):
    if not instance.task_id and instance.start_time > now():
        task_id = schedule_recording_task(instance)
        instance.task_id = task_id
        instance.save(update_fields=['task_id'])

@receiver(post_delete, sender=Recording)
def revoke_task_on_delete(sender, instance, **kwargs):
    revoke_task(instance.task_id)
