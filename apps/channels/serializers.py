from rest_framework import serializers
from .models import Stream, Channel, ChannelGroup, ChannelStream, ChannelGroupM3UAccount, Logo, ChannelProfile, ChannelProfileMembership, Recording
from apps.epg.serializers import EPGDataSerializer
from core.models import StreamProfile
from apps.epg.models import EPGData
from django.urls import reverse
from rest_framework import serializers
from django.utils import timezone

class LogoSerializer(serializers.ModelSerializer):
    cache_url = serializers.SerializerMethodField()

    class Meta:
        model = Logo
        fields = ['id', 'name', 'url', 'cache_url']

    def get_cache_url(self, obj):
        # return f"/api/channels/logos/{obj.id}/cache/"
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(reverse('api:channels:logo-cache', args=[obj.id]))
        return reverse('api:channels:logo-cache', args=[obj.id])

#
# Stream
#
class StreamSerializer(serializers.ModelSerializer):
    stream_profile_id = serializers.PrimaryKeyRelatedField(
        queryset=StreamProfile.objects.all(),
        source='stream_profile',
        allow_null=True,
        required=False
    )
    read_only_fields = ['is_custom', 'm3u_account', 'stream_hash']

    class Meta:
        model = Stream
        fields = [
            'id',
            'name',
            'url',
            'm3u_account',  # Uncomment if using M3U fields
            'logo_url',
            'tvg_id',
            'local_file',
            'current_viewers',
            'updated_at',
            'stream_profile_id',
            'is_custom',
            'channel_group',
            'stream_hash',
        ]

    def get_fields(self):
        fields = super().get_fields()

        # Unable to edit specific properties if this stream was created from an M3U account
        if self.instance and getattr(self.instance, 'm3u_account', None) and not self.instance.is_custom:
            fields['id'].read_only = True
            fields['name'].read_only = True
            fields['url'].read_only = True
            fields['m3u_account'].read_only = True
            fields['tvg_id'].read_only = True
            fields['channel_group'].read_only = True


        return fields


#
# Channel Group
#
class ChannelGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelGroup
        fields = ['id', 'name']

class ChannelProfileSerializer(serializers.ModelSerializer):
    channels = serializers.SerializerMethodField()

    class Meta:
        model = ChannelProfile
        fields = ['id', 'name', 'channels']

    def get_channels(self, obj):
        memberships = ChannelProfileMembership.objects.filter(channel_profile=obj)
        return [
            {
                'id': membership.channel.id,
                'enabled': membership.enabled
            }
            for membership in memberships
        ]

class ChannelProfileMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChannelProfileMembership
        fields = ['channel', 'enabled']

class ChanneProfilelMembershipUpdateSerializer(serializers.Serializer):
    channel_id = serializers.IntegerField()  # Ensure channel_id is an integer
    enabled = serializers.BooleanField()

class BulkChannelProfileMembershipSerializer(serializers.Serializer):
    channels = serializers.ListField(
        child=ChanneProfilelMembershipUpdateSerializer(),  # Use the nested serializer
        allow_empty=False
    )

    def validate_channels(self, value):
        if not value:
            raise serializers.ValidationError("At least one channel must be provided.")
        return value

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
    epg_data = EPGDataSerializer(read_only=True)
    epg_data_id = serializers.PrimaryKeyRelatedField(
        queryset=EPGData.objects.all(),
        source="epg_data",
        write_only=True,
        required=False,
        allow_null=True,
    )

    stream_profile_id = serializers.PrimaryKeyRelatedField(
        queryset=StreamProfile.objects.all(),
        source='stream_profile',
        allow_null=True,
        required=False,
    )

    streams = serializers.SerializerMethodField()
    stream_ids = serializers.PrimaryKeyRelatedField(
        queryset=Stream.objects.all(), many=True, write_only=True, required=False
    )

    logo = LogoSerializer(read_only=True)
    logo_id = serializers.PrimaryKeyRelatedField(
        queryset=Logo.objects.all(),
        source='logo',
        allow_null=True,
        required=False,
        write_only=True,
    )

    class Meta:
        model = Channel
        fields = [
            'id',
            'channel_number',
            'name',
            'channel_group',
            'channel_group_id',
            'tvg_id',
            'epg_data',
            'epg_data_id',
            'streams',
            'stream_ids',
            'stream_profile_id',
            'uuid',
            'logo',
            'logo_id',
        ]

    def get_streams(self, obj):
        """Retrieve ordered stream objects for GET requests."""
        ordered_streams = obj.streams.all().order_by('channelstream__order')
        return StreamSerializer(ordered_streams, many=True).data

    def get_logo(self, obj):
        return LogoSerializer(obj.logo).data

    # def get_stream_ids(self, obj):
    #     """Retrieve ordered stream IDs for GET requests."""
    #     return list(obj.streams.all().order_by('channelstream__order').values_list('id', flat=True))

    def create(self, validated_data):
        stream_ids = validated_data.pop('streams', [])
        channel = Channel.objects.create(**validated_data)

        # Add streams in the specified order
        for index, stream_id in enumerate(stream_ids):
            ChannelStream.objects.create(channel=channel, stream_id=stream_id, order=index)

        return channel

    def update(self, instance, validated_data):
        streams = validated_data.pop('stream_ids', None)

        # Update the actual Channel fields
        instance.channel_number = validated_data.get('channel_number', instance.channel_number)
        instance.name = validated_data.get('name', instance.name)
        instance.tvg_id = validated_data.get('tvg_id', instance.tvg_id)
        instance.epg_data = validated_data.get('epg_data', None)

        # If serializer allows changing channel_group or stream_profile:
        if 'channel_group' in validated_data:
            instance.channel_group = validated_data['channel_group']
        if 'stream_profile' in validated_data:
            instance.stream_profile = validated_data['stream_profile']
        if 'logo' in validated_data:
            instance.logo = validated_data['logo']

        instance.save()

        # Handle the many-to-many 'streams'
        if streams is not None:
            # Clear existing relationships
            instance.channelstream_set.all().delete()
            # Add new streams in order
            for index, stream in enumerate(streams):
                print(f'Setting stream {stream.id} to index {index}')
                ChannelStream.objects.create(channel=instance, stream_id=stream.id, order=index)

        return instance

class ChannelGroupM3UAccountSerializer(serializers.ModelSerializer):
    enabled = serializers.BooleanField()

    class Meta:
        model = ChannelGroupM3UAccount
        fields = ['id', 'channel_group', 'enabled']

    # Optionally, if you only need the id of the ChannelGroup, you can customize it like this:
    # channel_group = serializers.PrimaryKeyRelatedField(queryset=ChannelGroup.objects.all())


class RecordingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Recording
        fields = '__all__'
        read_only_fields = ['task_id']

    def validate(self, data):
        start_time = data.get('start_time')
        end_time = data.get('end_time')

        now = timezone.now()  # timezone-aware current time

        if end_time < now:
            raise serializers.ValidationError("End time must be in the future.")

        if start_time < now:
            # Optional: Adjust start_time if it's in the past but end_time is in the future
            data['start_time'] = now  # or: timezone.now() + timedelta(seconds=1)
        if end_time <= data['start_time']:
            raise serializers.ValidationError("End time must be after start time.")

        return data
