from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import EPGSource
from .tasks import refresh_epg_data

@receiver(post_save, sender=EPGSource)
def trigger_refresh_on_new_epg_source(sender, instance, created, **kwargs):
    # Trigger refresh only if the source is newly created and active
    if created and instance.is_active:
        refresh_epg_data.delay()
