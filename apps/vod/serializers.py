from rest_framework import serializers
from .models import (
    Series, VODCategory, Movie, Episode,
    M3USeriesRelation, M3UMovieRelation, M3UEpisodeRelation
)
from apps.channels.serializers import LogoSerializer
from apps.m3u.serializers import M3UAccountSerializer


class VODCategorySerializer(serializers.ModelSerializer):
    category_type_display = serializers.CharField(source='get_category_type_display', read_only=True)

    class Meta:
        model = VODCategory
        fields = '__all__'


class SeriesSerializer(serializers.ModelSerializer):
    logo = LogoSerializer(read_only=True)
    episode_count = serializers.SerializerMethodField()

    class Meta:
        model = Series
        fields = '__all__'

    def get_episode_count(self, obj):
        return obj.episodes.count()


class MovieSerializer(serializers.ModelSerializer):
    logo = LogoSerializer(read_only=True)

    class Meta:
        model = Movie
        fields = '__all__'


class EpisodeSerializer(serializers.ModelSerializer):
    series = SeriesSerializer(read_only=True)

    class Meta:
        model = Episode
        fields = '__all__'


class M3USeriesRelationSerializer(serializers.ModelSerializer):
    series = SeriesSerializer(read_only=True)
    category = VODCategorySerializer(read_only=True)
    m3u_account = M3UAccountSerializer(read_only=True)

    class Meta:
        model = M3USeriesRelation
        fields = '__all__'


class M3UMovieRelationSerializer(serializers.ModelSerializer):
    movie = MovieSerializer(read_only=True)
    category = VODCategorySerializer(read_only=True)
    m3u_account = M3UAccountSerializer(read_only=True)

    class Meta:
        model = M3UMovieRelation
        fields = '__all__'


class M3UEpisodeRelationSerializer(serializers.ModelSerializer):
    episode = EpisodeSerializer(read_only=True)
    m3u_account = M3UAccountSerializer(read_only=True)

    class Meta:
        model = M3UEpisodeRelation
        fields = '__all__'


class EnhancedSeriesSerializer(serializers.ModelSerializer):
    """Enhanced serializer for series with provider information"""
    logo = LogoSerializer(read_only=True)
    providers = M3USeriesRelationSerializer(source='m3u_relations', many=True, read_only=True)
    episode_count = serializers.SerializerMethodField()

    class Meta:
        model = Series
        fields = '__all__'

    def get_episode_count(self, obj):
        return obj.episodes.count()

