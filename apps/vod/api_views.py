from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
import django_filters
from apps.accounts.permissions import (
    Authenticated,
    permission_classes_by_action,
)
from .models import Series, VODCategory, VODConnection, Movie, Episode
from .serializers import (
    MovieSerializer,
    EpisodeSerializer,
    SeriesSerializer,
    VODCategorySerializer,
    VODConnectionSerializer
)


class MovieFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr="icontains")
    category = django_filters.CharFilter(field_name="category__name", lookup_expr="icontains")
    m3u_account = django_filters.NumberFilter(field_name="m3u_account__id")
    year = django_filters.NumberFilter()
    year_gte = django_filters.NumberFilter(field_name="year", lookup_expr="gte")
    year_lte = django_filters.NumberFilter(field_name="year", lookup_expr="lte")

    class Meta:
        model = Movie
        fields = ['name', 'category', 'm3u_account', 'year']


class MovieViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Movie content"""
    queryset = Movie.objects.all()
    serializer_class = MovieSerializer

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = MovieFilter
    search_fields = ['name', 'description', 'genre']
    ordering_fields = ['name', 'year', 'created_at']
    ordering = ['name']

    def get_permissions(self):
        try:
            return [perm() for perm in permission_classes_by_action[self.action]]
        except KeyError:
            return [Authenticated()]

    def get_queryset(self):
        return Movie.objects.select_related(
            'category', 'logo', 'm3u_account'
        ).filter(m3u_account__is_active=True)


class EpisodeFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr="icontains")
    series = django_filters.NumberFilter(field_name="series__id")
    m3u_account = django_filters.NumberFilter(field_name="m3u_account__id")
    season_number = django_filters.NumberFilter()
    episode_number = django_filters.NumberFilter()

    class Meta:
        model = Episode
        fields = ['name', 'series', 'm3u_account', 'season_number', 'episode_number']


class EpisodeViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Episode content"""
    queryset = Episode.objects.all()
    serializer_class = EpisodeSerializer

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = EpisodeFilter
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'season_number', 'episode_number', 'created_at']
    ordering = ['series__name', 'season_number', 'episode_number']

    def get_permissions(self):
        try:
            return [perm() for perm in permission_classes_by_action[self.action]]
        except KeyError:
            return [Authenticated()]

    def get_queryset(self):
        return Episode.objects.select_related(
            'series', 'm3u_account'
        ).filter(m3u_account__is_active=True)


class SeriesViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for Series management"""
    queryset = Series.objects.all()
    serializer_class = SeriesSerializer

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    search_fields = ['name', 'description', 'genre']
    ordering_fields = ['name', 'year', 'created_at']
    ordering = ['name']

    def get_permissions(self):
        try:
            return [perm() for perm in permission_classes_by_action[self.action]]
        except KeyError:
            return [Authenticated()]

    def get_queryset(self):
        return Series.objects.select_related(
            'category', 'logo', 'm3u_account'
        ).prefetch_related('episodes').filter(m3u_account__is_active=True)

    @action(detail=True, methods=['get'])
    def episodes(self, request, pk=None):
        """Get episodes for a specific series"""
        series = self.get_object()
        episodes = series.episodes.all().order_by('season_number', 'episode_number')

        page = self.paginate_queryset(episodes)
        if page is not None:
            serializer = EpisodeSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = EpisodeSerializer(episodes, many=True)
        return Response(serializer.data)


class VODCategoryFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr="icontains")
    category_type = django_filters.ChoiceFilter(choices=VODCategory.CATEGORY_TYPE_CHOICES)
    m3u_account = django_filters.NumberFilter(field_name="m3u_account__id")

    class Meta:
        model = VODCategory
        fields = ['name', 'category_type', 'm3u_account']


class VODCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for VOD Categories"""
    queryset = VODCategory.objects.all()
    serializer_class = VODCategorySerializer

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = VODCategoryFilter
    search_fields = ['name']
    ordering = ['name']

    def get_permissions(self):
        try:
            return [perm() for perm in permission_classes_by_action[self.action]]
        except KeyError:
            return [Authenticated()]


class VODConnectionViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for monitoring VOD connections"""
    queryset = VODConnection.objects.all()
    serializer_class = VODConnectionSerializer

    filter_backends = [DjangoFilterBackend, OrderingFilter]
    ordering = ['-connected_at']

    def get_permissions(self):
        try:
            return [perm() for perm in permission_classes_by_action[self.action]]
        except KeyError:
            return [Authenticated()]

    def get_queryset(self):
        return VODConnection.objects.select_related('m3u_profile')
