from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.shortcuts import get_object_or_404
import django_filters
import logging
from apps.accounts.permissions import (
    Authenticated,
    permission_classes_by_action,
)
from .models import (
    Series, VODCategory, Movie, Episode,
    M3USeriesRelation, M3UMovieRelation, M3UEpisodeRelation
)
from .serializers import (
    MovieSerializer,
    EpisodeSerializer,
    SeriesSerializer,
    VODCategorySerializer,
    M3UMovieRelationSerializer,
    M3USeriesRelationSerializer,
    M3UEpisodeRelationSerializer
)
from .tasks import refresh_series_episodes
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


class MovieFilter(django_filters.FilterSet):
    name = django_filters.CharFilter(lookup_expr="icontains")
    m3u_account = django_filters.NumberFilter(field_name="m3u_relations__m3u_account__id")
    year = django_filters.NumberFilter()
    year_gte = django_filters.NumberFilter(field_name="year", lookup_expr="gte")
    year_lte = django_filters.NumberFilter(field_name="year", lookup_expr="lte")

    class Meta:
        model = Movie
        fields = ['name', 'm3u_account', 'year']


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
        # Only return movies that have active M3U relations
        return Movie.objects.filter(
            m3u_relations__m3u_account__is_active=True
        ).distinct().select_related('logo').prefetch_related('m3u_relations__m3u_account')

    @action(detail=True, methods=['get'], url_path='providers')
    def get_providers(self, request, pk=None):
        """Get all providers (M3U accounts) that have this movie"""
        movie = self.get_object()
        relations = M3UMovieRelation.objects.filter(
            movie=movie,
            m3u_account__is_active=True
        ).select_related('m3u_account', 'category')

        serializer = M3UMovieRelationSerializer(relations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='provider-info')
    def provider_info(self, request, pk=None):
        """Get detailed movie information from the original provider"""
        movie = self.get_object()

        # Get the first active relation
        relation = M3UMovieRelation.objects.filter(
            movie=movie,
            m3u_account__is_active=True
        ).select_related('m3u_account').first()

        if not relation:
            return Response(
                {'error': 'No active M3U account associated with this movie'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if detailed data has been fetched
        custom_props = relation.custom_properties or {}
        detailed_fetched = custom_props.get('detailed_fetched', False)

        # If detailed data hasn't been fetched, fetch it now
        if not detailed_fetched:
            try:
                from core.xtream_codes import Client as XtreamCodesClient

                with XtreamCodesClient(
                    server_url=relation.m3u_account.server_url,
                    username=relation.m3u_account.username,
                    password=relation.m3u_account.password,
                    user_agent=relation.m3u_account.get_user_agent().user_agent
                ) as client:
                    # Get detailed VOD info from provider
                    vod_info = client.get_vod_info(relation.stream_id)

                    if vod_info and 'info' in vod_info:
                        # Update movie with detailed info
                        info = vod_info.get('info', {})
                        movie_data = vod_info.get('movie_data', {})

                        movie.description = info.get('plot', movie.description)
                        movie.rating = info.get('rating', movie.rating)
                        movie.genre = info.get('genre', movie.genre)
                        movie.duration = self._convert_duration_to_minutes(info.get('duration_secs'))
                        if info.get('releasedate'):
                            movie.year = self._extract_year(info.get('releasedate'))
                        movie.save()

                        # Update relation with detailed data
                        custom_props['detailed_info'] = info
                        custom_props['movie_data'] = movie_data
                        custom_props['detailed_fetched'] = True
                        relation.custom_properties = custom_props
                        relation.save()

            except Exception as e:
                logger.error(f"Error fetching detailed VOD info for movie {pk}: {str(e)}")
                # Continue with available data

        try:
            from core.xtream_codes import Client as XtreamCodesClient

            # Create XtreamCodes client for final response (minimal call)
            with XtreamCodesClient(
                server_url=relation.m3u_account.server_url,
                username=relation.m3u_account.username,
                password=relation.m3u_account.password,
                user_agent=relation.m3u_account.get_user_agent().user_agent
            ) as client:

                # Use cached detailed data if available
                custom_props = relation.custom_properties or {}
                info = custom_props.get('detailed_info', {})
                movie_data = custom_props.get('movie_data', {})

                # If no cached data, use basic data
                if not info:
                    basic_data = custom_props.get('basic_data', {})
                    info = {
                        'name': movie.name,
                        'plot': movie.description,
                        'rating': movie.rating,
                        'genre': movie.genre,
                    }
                    movie_data = {
                        'container_extension': basic_data.get('container_extension', 'mp4'),
                        'added': basic_data.get('added', ''),
                    }

                # Build response with available data
                response_data = {
                    'id': movie.id,
                    'stream_id': relation.stream_id,
                    'name': info.get('name', movie.name),
                    'o_name': info.get('o_name', ''),
                    'description': info.get('description', info.get('plot', movie.description)),
                    'plot': info.get('plot', info.get('description', movie.description)),
                    'year': movie.year or self._extract_year(info.get('releasedate', '')),
                    'release_date': info.get('release_date', ''),
                    'releasedate': info.get('releasedate', ''),
                    'genre': info.get('genre', movie.genre),
                    'director': info.get('director', ''),
                    'actors': info.get('actors', info.get('cast', '')),
                    'cast': info.get('cast', info.get('actors', '')),
                    'country': info.get('country', ''),
                    'rating': info.get('rating', movie.rating or 0),
                    'tmdb_id': info.get('tmdb_id', movie.tmdb_id or ''),
                    'youtube_trailer': info.get('youtube_trailer', ''),
                    'duration': movie.duration or self._convert_duration_to_minutes(info.get('duration_secs', 0)),
                    'duration_secs': info.get('duration_secs', (movie.duration or 0) * 60),
                    'episode_run_time': info.get('episode_run_time', 0),
                    'age': info.get('age', ''),
                    'backdrop_path': info.get('backdrop_path', []),
                    'cover': info.get('cover_big', ''),
                    'cover_big': info.get('cover_big', ''),
                    'movie_image': info.get('movie_image', ''),
                    'bitrate': info.get('bitrate', 0),
                    'video': info.get('video', {}),
                    'audio': info.get('audio', {}),
                    # Include movie_data fields
                    'container_extension': movie_data.get('container_extension', 'mp4'),
                    'direct_source': movie_data.get('direct_source', ''),
                    'category_id': movie_data.get('category_id', ''),
                    'added': movie_data.get('added', ''),
                    # Include M3U account info
                    'm3u_account': {
                        'id': relation.m3u_account.id,
                        'name': relation.m3u_account.name,
                        'account_type': relation.m3u_account.account_type
                    }
                }

                return Response(response_data)

        except Exception as e:
            logger.error(f"Error in provider info for movie {pk}: {str(e)}")
            return Response(
                {'error': f'Failed to fetch information from provider: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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
        # Only return series that have active M3U relations
        return Series.objects.filter(
            m3u_relations__m3u_account__is_active=True
        ).distinct().select_related('logo').prefetch_related('episodes', 'm3u_relations__m3u_account')

    @action(detail=True, methods=['get'], url_path='providers')
    def get_providers(self, request, pk=None):
        """Get all providers (M3U accounts) that have this series"""
        series = self.get_object()
        relations = M3USeriesRelation.objects.filter(
            series=series,
            m3u_account__is_active=True
        ).select_related('m3u_account', 'category')

        serializer = M3USeriesRelationSerializer(relations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='episodes')
    def get_episodes(self, request, pk=None):
        """Get episodes for this series with provider information"""
        series = self.get_object()
        episodes = Episode.objects.filter(series=series).prefetch_related(
            'm3u_relations__m3u_account'
        ).order_by('season_number', 'episode_number')

        episodes_data = []
        for episode in episodes:
            episode_serializer = EpisodeSerializer(episode)
            episode_data = episode_serializer.data

            # Add provider information
            relations = M3UEpisodeRelation.objects.filter(
                episode=episode,
                m3u_account__is_active=True
            ).select_related('m3u_account')

            episode_data['providers'] = M3UEpisodeRelationSerializer(relations, many=True).data
            episodes_data.append(episode_data)

        return Response(episodes_data)

    @action(detail=True, methods=['get'], url_path='provider-info')
    def series_info(self, request, pk=None):
        """Get detailed series information, refreshing from provider if needed"""
        logger.debug(f"SeriesViewSet.series_info called for series ID: {pk}")
        series = self.get_object()
        logger.debug(f"Retrieved series: {series.name} (ID: {series.id})")

        # Get the first active relation
        relation = M3USeriesRelation.objects.filter(
            series=series,
            m3u_account__is_active=True
        ).select_related('m3u_account').first()

        if not relation:
            return Response(
                {'error': 'No active M3U account associated with this series'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Check if we should refresh data (optional force refresh parameter)
            force_refresh = request.query_params.get('force_refresh', 'false').lower() == 'true'
            refresh_interval_hours = int(request.query_params.get("refresh_interval", 24))  # Default to 24 hours

            now = timezone.now()
            last_refreshed = relation.last_episode_refresh

            # Check if detailed data has been fetched
            custom_props = relation.custom_properties or {}
            episodes_fetched = custom_props.get('episodes_fetched', False)
            detailed_fetched = custom_props.get('detailed_fetched', False)

            # Force refresh if episodes have never been fetched or if forced
            if not episodes_fetched or not detailed_fetched or force_refresh:
                force_refresh = True
                logger.debug(f"Series {series.id} needs detailed/episode refresh, forcing refresh")
            elif last_refreshed and (now - last_refreshed) > timedelta(hours=refresh_interval_hours):
                force_refresh = True
                logger.debug(f"Series {series.id} refresh interval exceeded, forcing refresh")

            if force_refresh:
                logger.debug(f"Refreshing series {series.id} data from provider")
                # Use existing refresh logic with external_series_id
                from .tasks import refresh_series_episodes
                account = relation.m3u_account
                if account and account.is_active:
                    refresh_series_episodes(account, series, relation.external_series_id)
                    series.refresh_from_db()  # Reload from database after refresh
                    relation.refresh_from_db()  # Reload relation too

            # Return the database data (which should now be fresh)
            custom_props = relation.custom_properties or {}
            response_data = {
                'id': series.id,
                'series_id': relation.external_series_id,
                'name': series.name,
                'description': series.description,
                'year': series.year,
                'genre': series.genre,
                'rating': series.rating,
                'tmdb_id': series.tmdb_id,
                'imdb_id': series.imdb_id,
                'category_id': relation.category.id if relation.category else None,
                'category_name': relation.category.name if relation.category else None,
                'cover': {
                    'id': series.logo.id,
                    'url': series.logo.url,
                    'name': series.logo.name,
                } if series.logo else None,
                'last_refreshed': series.updated_at,
                'custom_properties': custom_props,
                'm3u_account': {
                    'id': relation.m3u_account.id,
                    'name': relation.m3u_account.name,
                    'account_type': relation.m3u_account.account_type
                },
                'episodes_fetched': custom_props.get('episodes_fetched', False),
                'detailed_fetched': custom_props.get('detailed_fetched', False)
            }

            # Always include episodes for series info if they've been fetched
            include_episodes = request.query_params.get('include_episodes', 'true').lower() == 'true'
            if include_episodes and custom_props.get('episodes_fetched', False):
                logger.debug(f"Including episodes for series {series.id}")
                episodes_by_season = {}
                for episode in series.episodes.all().order_by('season_number', 'episode_number'):
                    season_key = str(episode.season_number or 0)
                    if season_key not in episodes_by_season:
                        episodes_by_season[season_key] = []

                    # Get episode relation for additional data
                    episode_relation = M3UEpisodeRelation.objects.filter(
                        episode=episode,
                        m3u_account=relation.m3u_account
                    ).first()

                    episode_data = {
                        'id': episode.id,
                        'uuid': episode.uuid,
                        'name': episode.name,
                        'title': episode.name,
                        'episode_number': episode.episode_number,
                        'season_number': episode.season_number,
                        'description': episode.description,
                        'release_date': episode.release_date,
                        'plot': episode.description,
                        'duration': episode.duration,
                        'rating': episode.rating,
                        'movie_image': episode_relation.custom_properties.get('info', {}).get('movie_image') if episode_relation and episode_relation.custom_properties else None,
                        'container_extension': episode_relation.container_extension if episode_relation else 'mp4',
                        'type': 'episode',
                        'series': {
                            'id': series.id,
                            'name': series.name
                        }
                    }
                    episodes_by_season[season_key].append(episode_data)

                response_data['episodes'] = episodes_by_season
                logger.debug(f"Added {len(episodes_by_season)} seasons of episodes to response")
            elif include_episodes:
                # Episodes not yet fetched, include empty episodes list
                response_data['episodes'] = {}

            logger.debug(f"Returning series info response for series {series.id}")
            return Response(response_data)

        except Exception as e:
            logger.error(f"Error fetching series info for series {pk}: {str(e)}")
            return Response(
                {'error': f'Failed to fetch series information: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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
