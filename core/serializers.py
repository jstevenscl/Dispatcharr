# core/serializers.py

from rest_framework import serializers
from .models import UserAgent, StreamProfile, CoreSettings

class UserAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAgent
        fields = ['id', 'name', 'user_agent', 'description', 'is_active', 'created_at', 'updated_at']

class StreamProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StreamProfile
        fields = ['id', 'name', 'command', 'parameters', 'is_active', 'user_agent', 'locked']

class CoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoreSettings
        fields = '__all__'
