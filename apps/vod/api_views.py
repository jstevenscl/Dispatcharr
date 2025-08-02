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
from .models import VOD, Series, VODCategory, VODConnection
from .serializers import (
    VODSerializer,
    SeriesSerializer,
    VODCategorySerializer,
    VODConnectionSerializer
)


class VODFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr="icontains")
    type = django_filters.ChoiceFilter(choices=VOD.TYPE_CHOICES)
    category = django_filters.CharFilter(field_name="category__name", lookup_expr="icontains")
    series = django_filters.NumberFilter(field_name="series__id")
    m3u_account = django_filters.NumberFilter(field_name="m3u_account__id")
    year = django_filters.NumberFilter()
    year_gte = django_filters.NumberFilter(field_name="year", lookup_expr="gte")
    year_lte = django_filters.NumberFilter(field_name="year", lookup_expr="lte")

    class Meta:
        model = VOD
        fields = ['name', 'type', 'category', 'series', 'm3u_account', 'year']


class VODViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for VOD content (Movies and Episodes)"""
    queryset = VOD.objects.all()
    serializer_class = VODSerializer

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = VODFilter
    search_fields = ['name', 'description', 'genre']
    ordering_fields = ['name', 'year', 'created_at', 'season_number', 'episode_number']
    ordering = ['name']

    def get_permissions(self):
        try:
            return [perm() for perm in permission_classes_by_action[self.action]]
        except KeyError:
            return [Authenticated()]

    def get_queryset(self):
        return VOD.objects.select_related(
            'series', 'category', 'logo', 'm3u_account'
        ).filter(m3u_account__is_active=True)

    @action(detail=False, methods=['get'])
    def movies(self, request):
        """Get only movie content"""
        movies = self.get_queryset().filter(type='movie')
        movies = self.filter_queryset(movies)

        page = self.paginate_queryset(movies)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(movies, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def episodes(self, request):
        """Get only episode content"""
        episodes = self.get_queryset().filter(type='episode')
        episodes = self.filter_queryset(episodes)

        page = self.paginate_queryset(episodes)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(episodes, many=True)
        return Response(serializer.data)


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
            serializer = VODSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = VODSerializer(episodes, many=True)
        return Response(serializer.data)


class VODCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for VOD Categories"""
    queryset = VODCategory.objects.all()
    serializer_class = VODCategorySerializer

    filter_backends = [SearchFilter, OrderingFilter]
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
        return VODConnection.objects.select_related('vod', 'm3u_profile')
