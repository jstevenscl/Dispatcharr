from rest_framework import serializers
from .models import EPGSource, EPGData, ProgramData
from apps.channels.models import Channel

class EPGSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = EPGSource
        fields = ['id', 'name', 'source_type', 'url', 'api_key', 'is_active']

class ProgramDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgramData
        fields = ['id', 'start_time', 'end_time', 'title', 'sub_title', 'description', 'tvg_id']

class EPGDataSerializer(serializers.ModelSerializer):
    programs = ProgramDataSerializer(many=True, read_only=True)
    channel = serializers.SerializerMethodField()

    def get_channel(self, obj):
        return {"id": obj.channel.id, "name": obj.channel.channel_name} if obj.channel else None

    class Meta:
        model = EPGData
        fields = ['id', 'channel', 'channel_name', 'programs']
