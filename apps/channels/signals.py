# apps/channels/signals.py

from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from .models import Channel, Stream

@receiver(m2m_changed, sender=Channel.streams.through)
def update_channel_tvg_id_and_logo(sender, instance, action, reverse, model, pk_set, **kwargs):
    """
    Whenever streams are added to a channel:
      1) If the channel doesn't have a tvg_id, fill it from the first newly-added stream that has one.
      2) If the channel doesn't have a logo_url, fill it from the first newly-added stream that has one.
         This way if an M3U or EPG entry carried a logo, newly created channels automatically get that logo.
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

        # --- 2) Populate channel.logo_url if empty ---
        if not instance.logo_url:
            # Look for newly added streams that have a nonempty logo_url
            streams_with_logo = model.objects.filter(pk__in=pk_set).exclude(logo_url__exact='')
            if streams_with_logo.exists():
                instance.logo_url = streams_with_logo.first().logo_url
                instance.save(update_fields=['logo_url'])
