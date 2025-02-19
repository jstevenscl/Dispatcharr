from rest_framework import serializers
from .models import Stream, Channel, ChannelGroup

#
# Stream
#
class StreamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Stream
        fields = [
            'id',
            'name',
            'url',
            'custom_url',
            'm3u_account',  # Uncomment if using M3U fields
            'logo_url',
            'tvg_id',
            'local_file',
            'current_viewers',
            'is_transcoded',
            'ffmpeg_preset',
            'updated_at',
            'group_name',
        ]


#
# Channel Group
#
class ChannelGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelGroup
        fields = ['id', 'name']


#
# Channel
#
class ChannelSerializer(serializers.ModelSerializer):
    # Show nested group data, or ID
    channel_group = ChannelGroupSerializer(read_only=True)
    channel_group_id = serializers.PrimaryKeyRelatedField(
        queryset=ChannelGroup.objects.all(),
        source="channel_group",
        write_only=True,
        required=False
    )

    # Possibly show streams inline, or just by ID
    # streams = StreamSerializer(many=True, read_only=True)

    class Meta:
        model = Channel
        fields = [
            'id',
            'channel_number',
            'channel_name',
            'logo_url',
            'logo_file',
            'channel_group',
            'channel_group_id',
            'tvg_id',
            'tvg_name',
            'streams'
        ]
