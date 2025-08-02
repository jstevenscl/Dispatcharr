from rest_framework import serializers
from .models import Series, VODCategory, VODConnection, Movie, Episode
from apps.channels.serializers import LogoSerializer
from apps.m3u.serializers import M3UAccountSerializer


class VODCategorySerializer(serializers.ModelSerializer):
    category_type_display = serializers.CharField(source='get_category_type_display', read_only=True)

    class Meta:
        model = VODCategory
        fields = '__all__'


class SeriesSerializer(serializers.ModelSerializer):
    logo = LogoSerializer(read_only=True)
    category = VODCategorySerializer(read_only=True)
    m3u_account = M3UAccountSerializer(read_only=True)
    episode_count = serializers.SerializerMethodField()

    class Meta:
        model = Series
        fields = '__all__'

    def get_episode_count(self, obj):
        return obj.episodes.count()


class MovieSerializer(serializers.ModelSerializer):
    logo = LogoSerializer(read_only=True)
    category = VODCategorySerializer(read_only=True)
    m3u_account = M3UAccountSerializer(read_only=True)
    stream_url = serializers.SerializerMethodField()

    class Meta:
        model = Movie
        fields = '__all__'

    def get_stream_url(self, obj):
        return obj.get_stream_url()


class EpisodeSerializer(serializers.ModelSerializer):
    logo = LogoSerializer(read_only=True)
    series = SeriesSerializer(read_only=True)
    m3u_account = M3UAccountSerializer(read_only=True)
    stream_url = serializers.SerializerMethodField()

    class Meta:
        model = Episode
        fields = '__all__'

    def get_stream_url(self, obj):
        return obj.get_stream_url()


class VODConnectionSerializer(serializers.ModelSerializer):
    content_name = serializers.SerializerMethodField()

    class Meta:
        model = VODConnection
        fields = '__all__'

    def get_content_name(self, obj):
        if obj.content_object:
            return getattr(obj.content_object, 'name', 'Unknown')
        return 'Unknown'
