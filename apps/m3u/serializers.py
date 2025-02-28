from rest_framework import serializers
from .models import M3UAccount, M3UFilter, ServerGroup, M3UAccountProfile
from core.models import UserAgent

class M3UFilterSerializer(serializers.ModelSerializer):
    """Serializer for M3U Filters"""

    class Meta:
        model = M3UFilter
        fields = ['id', 'filter_type', 'regex_pattern', 'exclude']

from rest_framework import serializers
from .models import M3UAccountProfile

class M3UAccountProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = M3UAccountProfile
        fields = ['id', 'name', 'max_streams', 'search_pattern', 'replace_pattern']
        read_only_fields = ['id']

    def create(self, validated_data):
        # Get the account from the context and assign it directly
        m3u_account = self.context['m3u_account']
        return M3UAccountProfile.objects.create(m3u_account=m3u_account, **validated_data)


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
