from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from .models import Channel, Stream

@receiver(m2m_changed, sender=Channel.streams.through)
def update_channel_tvg_id(sender, instance, action, reverse, model, pk_set, **kwargs):
    # When streams are added to a channel...
    if action == "post_add":
        # If the channel does not already have a tvg-id...
        if not instance.tvg_id:
            # Look for any of the newly added streams that have a nonempty tvg_id.
            streams_with_tvg = model.objects.filter(pk__in=pk_set).exclude(tvg_id__exact='')
            if streams_with_tvg.exists():
                # Update the channel's tvg_id with the first found tvg_id.
                instance.tvg_id = streams_with_tvg.first().tvg_id
                instance.save(update_fields=['tvg_id'])
