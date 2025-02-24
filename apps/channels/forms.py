from django import forms
from .models import Stream, Channel, ChannelGroup

#
# ChannelGroup Form
#
class ChannelGroupForm(forms.ModelForm):
    class Meta:
        model = ChannelGroup
        fields = ['name']


#
# Channel Form
#
class ChannelForm(forms.ModelForm):
    channel_group = forms.ModelChoiceField(
        queryset=ChannelGroup.objects.all(),
        required=False,
        label="Channel Group",
        empty_label="--- No group ---"
    )

    class Meta:
        model = Channel
        fields = [
            'channel_number',
            'channel_name',
            'channel_group',
        ]


#
# Example: Stream Form (optional if you want a ModelForm for Streams)
#
class StreamForm(forms.ModelForm):
    class Meta:
        model = Stream
        fields = [
            'name',
            'url',
            'custom_url',
            'logo_url',
            'tvg_id',
            'local_file',
            'is_transcoded',
            'group_name',
        ]
