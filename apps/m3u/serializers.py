from rest_framework import serializers
from .models import M3UAccount, M3UFilter, ServerGroup, M3UAccountProfile
from core.models import UserAgent

class M3UFilterSerializer(serializers.ModelSerializer):
    """Serializer for M3U Filters"""

    class Meta:
        model = M3UFilter
        fields = ['id', 'filter_type', 'regex_pattern', 'exclude']

class M3UAccountProfileSerializer(serializers.ModelSerializer):
    """Serializer for M3U Account Profiles"""

    class Meta:
        model = M3UAccountProfile
        fields = ['id', 'name', 'm3u_account_id', 'search_pattern', 'replace_pattern']

class M3UAccountSerializer(serializers.ModelSerializer):
    """Serializer for M3U Account"""
    filters = M3UFilterSerializer(many=True, read_only=True)
    # Include user_agent as a mandatory field using its primary key.
    user_agent = serializers.PrimaryKeyRelatedField(
        queryset=UserAgent.objects.all(),
        required=True
    )
    profiles = M3UAccountProfileSerializer(many=True, read_only=True)

    class Meta:
        model = M3UAccount
        fields = [
            'id', 'name', 'server_url', 'uploaded_file', 'server_group',
            'max_streams', 'is_active', 'created_at', 'updated_at', 'filters', 'user_agent', 'profiles'
        ]

class ServerGroupSerializer(serializers.ModelSerializer):
    """Serializer for Server Group"""

    class Meta:
        model = ServerGroup
        fields = ['id', 'name']
