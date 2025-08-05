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
from .models import Series, VODCategory, VODConnection, Movie, Episode
from .serializers import (
    MovieSerializer,
    EpisodeSerializer,
    SeriesSerializer,
    VODCategorySerializer,
    VODConnectionSerializer
)
from core.xtream_codes import Client as XtreamCodesClient
from .tasks import refresh_series_episodes
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)


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

    def _extract_year(self, date_string):
        """Extract year from date string"""
        if not date_string:
            return None
        try:
            return int(date_string.split('-')[0])
        except (ValueError, IndexError):
            return None

    def _convert_duration_to_minutes(self, duration_secs):
        """Convert duration from seconds to minutes"""
        if not duration_secs:
            return 0
        try:
            return int(duration_secs) // 60
        except (ValueError, TypeError):
            return 0

    @action(detail=True, methods=['get'], url_path='provider-info')
    def provider_info(self, request, pk=None):
        """Get detailed movie information from the original provider"""
        logger.debug(f"MovieViewSet.provider_info called for movie ID: {pk}")
        movie = self.get_object()
        logger.debug(f"Retrieved movie: {movie.name} (ID: {movie.id})")

        if not movie.m3u_account:
            return Response(
                {'error': 'No M3U account associated with this movie'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Create XtreamCodes client
            with XtreamCodesClient(
                server_url=movie.m3u_account.server_url,
                username=movie.m3u_account.username,
                password=movie.m3u_account.password,
                user_agent=movie.m3u_account.user_agent
            ) as client:
                # Get detailed VOD info from provider
                logger.debug(f"Fetching VOD info for movie {movie.id} with stream ID {movie.stream_id} from provider")
                vod_info = client.get_vod_info(movie.stream_id)

                if not vod_info or 'info' not in vod_info:
                    return Response(
                        {'error': 'No information available from provider'},
                        status=status.HTTP_404_NOT_FOUND
                    )

                # Extract and format the info
                info = vod_info.get('info', {})
                movie_data = vod_info.get('movie_data', {})

                # Build response with all available fields
                response_data = {
                    'id': movie.id,
                    'stream_id': movie.stream_id,
                    'name': info.get('name', movie.name),
                    'o_name': info.get('o_name', ''),
                    'description': info.get('description', info.get('plot', '')),
                    'plot': info.get('plot', info.get('description', '')),
                    'year': self._extract_year(info.get('releasedate', '')),
                    'release_date': info.get('releasedate', ''),
                    'releasedate': info.get('releasedate', ''),
                    'genre': info.get('genre', ''),
                    'director': info.get('director', ''),
                    'actors': info.get('actors', info.get('cast', '')),
                    'cast': info.get('cast', info.get('actors', '')),
                    'country': info.get('country', ''),
                    'rating': info.get('rating', 0),
                    'tmdb_id': info.get('tmdb_id', ''),
                    'youtube_trailer': info.get('youtube_trailer', ''),
                    'duration': self._convert_duration_to_minutes(info.get('duration_secs', 0)),
                    'duration_secs': info.get('duration_secs', 0),
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
                }

                return Response(response_data)

        except Exception as e:
            logger.error(f"Error fetching VOD info from provider for movie {pk}: {str(e)}")
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
        return Series.objects.select_related(
            'category', 'logo', 'm3u_account'
        ).prefetch_related('episodes').filter(m3u_account__is_active=True)

    @action(detail=True, methods=['get'], url_path='provider-info')
    def series_info(self, request, pk=None):
        """Get detailed series information, refreshing from provider if needed"""
        logger.debug(f"SeriesViewSet.series_info called for series ID: {pk}")
        series = self.get_object()
        logger.debug(f"Retrieved series: {series.name} (ID: {series.id})")

        if not series.m3u_account:
            return Response(
                {'error': 'No M3U account associated with this series'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Check if we should refresh data (optional force refresh parameter)
            force_refresh = request.query_params.get('force_refresh', 'false').lower() == 'true'
            refresh_interval_hours = int(request.query_params.get("refresh_interval", 24))  # Default to 24 hours

            now = timezone.now()
            last_refreshed = series.last_episode_refresh

            # Force refresh if episodes have never been populated (last_episode_refresh is null)
            if last_refreshed is None:
                force_refresh = True
                logger.debug(f"Series {series.id} has never been refreshed, forcing refresh")
            else:
                logger.debug(f"Series {series.id} last refreshed at {last_refreshed}, now is {now}")

            if force_refresh or (last_refreshed and (now - last_refreshed) > timedelta(hours=refresh_interval_hours)):
                logger.debug(f"Refreshing series {series.id} data from provider")
                # Use existing refresh logic
                from .tasks import refresh_series_episodes
                account = series.m3u_account
                if account and account.is_active:
                    refresh_series_episodes(account, series, series.series_id)
                    series.refresh_from_db()  # Reload from database after refresh

            # Return the database data (which should now be fresh)
            response_data = {
                'id': series.id,
                'series_id': series.series_id,
                'name': series.name,
                'description': series.description,
                'year': series.year,
                'genre': series.genre,
                'rating': series.rating,
                'tmdb_id': series.tmdb_id,
                'imdb_id': series.imdb_id,
                'category_id': series.category.id if series.category else None,
                'category_name': series.category.name if series.category else None,
                'cover': series.logo.url if series.logo else None,
                'last_refreshed': series.updated_at,
                'custom_properties': series.custom_properties or {},
                'm3u_account': {
                    'id': series.m3u_account.id,
                    'name': series.m3u_account.name,
                    'account_type': series.m3u_account.account_type
                } if series.m3u_account else None,
            }

            # Always include episodes for series info
            include_episodes = request.query_params.get('include_episodes', 'true').lower() == 'true'
            if include_episodes:
                logger.debug(f"Including episodes for series {series.id}")
                episodes_by_season = {}
                for episode in series.episodes.all().order_by('season_number', 'episode_number'):
                    season_key = str(episode.season_number or 0)
                    if season_key not in episodes_by_season:
                        episodes_by_season[season_key] = []

                    episode_data = {
                        'id': episode.id,
                        'uuid': episode.uuid,
                        'name': episode.name,
                        'title': episode.name,
                        'episode_number': episode.episode_number,
                        'season_number': episode.season_number,
                        'description': episode.description,
                        'plot': episode.description,
                        'duration': episode.duration,
                        'duration_secs': episode.duration * 60 if episode.duration else None,
                        'rating': episode.rating,
                        'container_extension': episode.container_extension,
                        'type': 'episode',
                        'series': {
                            'id': series.id,
                            'name': series.name
                        }
                    }
                    episodes_by_season[season_key].append(episode_data)

                response_data['episodes'] = episodes_by_season
                logger.debug(f"Added {len(episodes_by_season)} seasons of episodes to response")

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
