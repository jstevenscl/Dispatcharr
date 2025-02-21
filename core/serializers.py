# core/serializers.py

from rest_framework import serializers
from .models import UserAgent, StreamProfile, CoreSettings

class UserAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAgent
        fields = ['id', 'user_agent_name', 'user_agent', 'description', 'is_active', 'created_at', 'updated_at']

class StreamProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StreamProfile
        fields = ['id', 'profile_name', 'command', 'parameters', 'is_active', 'user_agent']

class CoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoreSettings
        fields = '__all__'
