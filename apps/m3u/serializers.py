from rest_framework import serializers
from .models import M3UAccount, M3UFilter, ServerGroup, M3UAccountProfile
from core.models import UserAgent
from apps.channels.models import ChannelGroup, ChannelGroupM3UAccount
from apps.channels.serializers import ChannelGroupM3UAccountSerializer, ChannelGroupSerializer
import logging

logger = logging.getLogger(__name__)

class M3UFilterSerializer(serializers.ModelSerializer):
    """Serializer for M3U Filters"""
    channel_groups = ChannelGroupM3UAccountSerializer(source='m3u_account', many=True)

    class Meta:
        model = M3UFilter
        fields = ['id', 'filter_type', 'regex_pattern', 'exclude', 'channel_groups']

from rest_framework import serializers
from .models import M3UAccountProfile

class M3UAccountProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = M3UAccountProfile
        fields = ['id', 'name', 'max_streams', 'is_active', 'is_default', 'current_viewers', 'search_pattern', 'replace_pattern']
        read_only_fields = ['id']

    def create(self, validated_data):
        m3u_account = self.context.get('m3u_account')

        # Use the m3u_account when creating the profile
        validated_data['m3u_account_id'] = m3u_account.id

        return super().create(validated_data)


class M3UAccountSerializer(serializers.ModelSerializer):
    """Serializer for M3U Account"""
    filters = M3UFilterSerializer(many=True, read_only=True)
    # Include user_agent as a mandatory field using its primary key.
    user_agent = serializers.PrimaryKeyRelatedField(
        queryset=UserAgent.objects.all(),
        required=True
    )
    profiles = M3UAccountProfileSerializer(many=True, read_only=True)
    read_only_fields = ['locked']
    # channel_groups = serializers.SerializerMethodField()
    channel_groups = ChannelGroupM3UAccountSerializer(source='channel_group.all', many=True, required=False)


    class Meta:
        model = M3UAccount
        fields = [
            'id', 'name', 'server_url', 'uploaded_file', 'server_group',
            'max_streams', 'is_active', 'created_at', 'updated_at', 'filters', 'user_agent', 'profiles', 'locked',
            'channel_groups', 'refresh_interval'
        ]

class ServerGroupSerializer(serializers.ModelSerializer):
    """Serializer for Server Group"""

    class Meta:
        model = ServerGroup
        fields = ['id', 'name']
