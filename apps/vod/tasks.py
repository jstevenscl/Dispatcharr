from celery import shared_task
from django.utils import timezone
from django.db import transaction
from apps.m3u.models import M3UAccount
from core.xtream_codes import Client as XtreamCodesClient
from .models import (
    VODCategory, Series, Movie, Episode,
    M3USeriesRelation, M3UMovieRelation, M3UEpisodeRelation
)
from apps.channels.models import Logo
import logging
import json

logger = logging.getLogger(__name__)


@shared_task
def refresh_vod_content(account_id):
    """Refresh VOD content for an M3U account"""
    try:
        account = M3UAccount.objects.get(id=account_id, is_active=True)

        if account.account_type != M3UAccount.Types.XC:
            logger.warning(f"VOD refresh called for non-XC account {account_id}")
            return "VOD refresh only available for XtreamCodes accounts"

        logger.info(f"Starting VOD refresh for account {account.name}")

        with XtreamCodesClient(
            account.server_url,
            account.username,
            account.password,
            account.get_user_agent().user_agent
        ) as client:

            # Refresh movies
            refresh_movies(client, account)

            # Refresh series
            refresh_series(client, account)

        logger.info(f"VOD refresh completed for account {account.name}")
        return f"VOD refresh completed for account {account.name}"

    except Exception as e:
        logger.error(f"Error refreshing VOD for account {account_id}: {str(e)}")
        return f"VOD refresh failed: {str(e)}"


def refresh_movies(client, account):
    """Refresh movie content - only basic list, no detailed calls"""
    logger.info(f"Refreshing movies for account {account.name}")

    # Get movie categories
    categories = client.get_vod_categories()

    for category_data in categories:
        category_name = category_data.get('category_name', 'Unknown')
        category_id = category_data.get('category_id')

        # Get or create category
        category, created = VODCategory.objects.get_or_create(
            name=category_name,
            category_type='movie',
            defaults={'name': category_name}
        )

        # Get movies in this category - only basic list
        movies = client.get_vod_streams(category_id)

        for movie_data in movies:
            process_movie_basic(client, account, movie_data, category)


def refresh_series(client, account):
    """Refresh series content - only basic list, no detailed calls"""
    logger.info(f"Refreshing series for account {account.name}")

    # Get series categories
    categories = client.get_series_categories()

    for category_data in categories:
        category_name = category_data.get('category_name', 'Unknown')
        category_id = category_data.get('category_id')

        # Get or create category
        category, created = VODCategory.objects.get_or_create(
            name=category_name,
            category_type='series',
            defaults={'name': category_name}
        )

        # Get series in this category - only basic list
        series_list = client.get_series(category_id)

        for series_data in series_list:
            process_series_basic(client, account, series_data, category)


def process_movie_basic(client, account, movie_data, category):
    """Process a single movie - basic info only, no detailed API call"""
    try:
        stream_id = movie_data.get('stream_id')
        name = movie_data.get('name', 'Unknown')

        # Extract all available metadata from the basic data
        year = extract_year(movie_data.get('added', ''))  # Use added date as fallback
        if not year and movie_data.get('year'):
            year = extract_year(str(movie_data.get('year')))

        # Extract TMDB and IMDB IDs if available in basic data
        tmdb_id = movie_data.get('tmdb_id') or movie_data.get('tmdb')
        imdb_id = movie_data.get('imdb_id') or movie_data.get('imdb')

        # Extract additional metadata that might be available in basic data
        description = movie_data.get('description') or movie_data.get('plot') or ''
        rating = movie_data.get('rating') or movie_data.get('vote_average') or ''
        genre = movie_data.get('genre') or movie_data.get('category_name') or ''
        duration_minutes = None

        # Try to extract duration from various possible fields
        if movie_data.get('duration_secs'):
            duration_minutes = convert_duration_to_minutes(movie_data.get('duration_secs'))
        elif movie_data.get('duration'):
            # Handle duration that might be in different formats
            duration_str = str(movie_data.get('duration'))
            if duration_str.isdigit():
                duration_minutes = int(duration_str)  # Assume minutes if just a number
            else:
                # Try to parse time format like "01:30:00"
                try:
                    time_parts = duration_str.split(':')
                    if len(time_parts) == 3:
                        hours, minutes, seconds = map(int, time_parts)
                        duration_minutes = (hours * 60) + minutes
                    elif len(time_parts) == 2:
                        minutes, seconds = map(int, time_parts)
                        duration_minutes = minutes
                except (ValueError, AttributeError):
                    pass

        # Build info dict with all extracted data
        info = {
            'plot': description,
            'rating': rating,
            'genre': genre,
            'duration_secs': movie_data.get('duration_secs'),
        }

        # Use find_or_create_movie to handle duplicates properly
        movie = find_or_create_movie(
            name=name,
            year=year,
            tmdb_id=tmdb_id,
            imdb_id=imdb_id,
            info=info
        )

        # Handle logo from basic data if available
        if movie_data.get('stream_icon'):
            logo, _ = Logo.objects.get_or_create(
                url=movie_data['stream_icon'],
                defaults={'name': name}
            )
            if not movie.logo:
                movie.logo = logo
                movie.save(update_fields=['logo'])

        # Create or update relation
        stream_url = client.get_vod_stream_url(stream_id)

        relation, created = M3UMovieRelation.objects.update_or_create(
            m3u_account=account,
            stream_id=str(stream_id),
            defaults={
                'movie': movie,
                'category': category,
                'url': stream_url,
                'container_extension': movie_data.get('container_extension', 'mp4'),
                'custom_properties': {
                    'basic_data': movie_data,
                    'detailed_fetched': False  # Flag to indicate detailed data not fetched
                }
            }
        )

        if created:
            logger.debug(f"Created new movie relation: {name}")
        else:
            logger.debug(f"Updated movie relation: {name}")

    except Exception as e:
        logger.error(f"Error processing movie {movie_data.get('name', 'Unknown')}: {str(e)}")


def process_series_basic(client, account, series_data, category):
    """Process a single series - basic info only, no detailed API call"""
    try:
        series_id = series_data.get('series_id')
        name = series_data.get('name', 'Unknown')

        # Extract all available metadata from the basic data
        year = extract_year(series_data.get('releaseDate', ''))  # Use releaseDate from API
        if not year and series_data.get('release_date'):
            year = extract_year(series_data.get('release_date'))

        # Extract TMDB and IMDB IDs if available in basic data
        tmdb_id = series_data.get('tmdb') or series_data.get('tmdb_id')
        imdb_id = series_data.get('imdb') or series_data.get('imdb_id')

        # Extract additional metadata that matches the actual API response
        description = series_data.get('plot') or series_data.get('description') or series_data.get('overview') or ''
        rating = series_data.get('rating') or series_data.get('vote_average') or ''
        genre = series_data.get('genre') or ''

        # Build info dict with all extracted data
        info = {
            'plot': description,
            'rating': rating,
            'genre': genre,
        }

        # Use find_or_create_series to handle duplicates properly
        series = find_or_create_series(
            name=name,
            year=year,
            tmdb_id=tmdb_id,
            imdb_id=imdb_id,
            info=info
        )

        # Handle logo from basic data if available
        if series_data.get('cover'):
            logo, _ = Logo.objects.get_or_create(
                url=series_data['cover'],
                defaults={'name': name}
            )
            if not series.logo:
                series.logo = logo
                series.save(update_fields=['logo'])

        # Create or update series relation
        series_relation, created = M3USeriesRelation.objects.update_or_create(
            m3u_account=account,
            external_series_id=str(series_id),
            defaults={
                'series': series,
                'category': category,
                'custom_properties': {
                    'basic_data': series_data,
                    'detailed_fetched': False,  # Flag to indicate detailed data not fetched
                    'episodes_fetched': False   # Flag to indicate episodes not fetched
                },
                'last_episode_refresh': None  # Set to None since we haven't fetched episodes
            }
        )

        if created:
            logger.debug(f"Created new series relation: {name}")
        else:
            logger.debug(f"Updated series relation: {name}")

    except Exception as e:
        logger.error(f"Error processing series {series_data.get('name', 'Unknown')}: {str(e)}")


# Remove the detailed processing functions since they're no longer used during refresh
# process_movie and process_series are now only called on-demand

def refresh_series_episodes(account, series, external_series_id, episodes_data=None):
    """Refresh episodes for a series - only called on-demand"""
    try:
        if not episodes_data:
            # Fetch detailed series info including episodes
            with XtreamCodesClient(
                account.server_url,
                account.username,
                account.password,
                account.get_user_agent().user_agent
            ) as client:
                series_info = client.get_series_info(external_series_id)
                if series_info:
                    # Update series with detailed info
                    info = series_info.get('info', {})
                    if info:
                        series.description = info.get('plot', series.description)
                        series.rating = info.get('rating', series.rating)
                        series.genre = info.get('genre', series.genre)
                        if info.get('releasedate'):
                            series.year = extract_year(info.get('releasedate'))
                        series.save()

                    episodes_data = series_info.get('episodes', {})
                else:
                    episodes_data = {}

        # Clear existing episodes for this account to handle deletions
        Episode.objects.filter(
            series=series,
            m3u_relations__m3u_account=account
        ).delete()

        for season_num, season_episodes in episodes_data.items():
            for episode_data in season_episodes:
                process_episode(account, series, episode_data, int(season_num))

        # Update the series relation to mark episodes as fetched
        series_relation = M3USeriesRelation.objects.filter(
            series=series,
            m3u_account=account
        ).first()

        if series_relation:
            custom_props = series_relation.custom_properties or {}
            custom_props['episodes_fetched'] = True
            custom_props['detailed_fetched'] = True
            series_relation.custom_properties = custom_props
            series_relation.last_episode_refresh = timezone.now()
            series_relation.save()

    except Exception as e:
        logger.error(f"Error refreshing episodes for series {series.name}: {str(e)}")


def find_or_create_movie(name, year, tmdb_id, imdb_id, info):
    """Find existing movie or create new one based on metadata"""
    # Try to find by TMDB ID first
    if tmdb_id:
        movie = Movie.objects.filter(tmdb_id=tmdb_id).first()
        if movie:
            # Update with any new info we have
            updated = False
            if info.get('plot') and not movie.description:
                movie.description = info.get('plot')
                updated = True
            if info.get('rating') and not movie.rating:
                movie.rating = info.get('rating')
                updated = True
            if info.get('genre') and not movie.genre:
                movie.genre = info.get('genre')
                updated = True
            if not movie.year and year:
                movie.year = year
                updated = True
            duration = convert_duration_to_minutes(info.get('duration_secs'))
            if duration and not movie.duration:
                movie.duration = duration
                updated = True
            if updated:
                movie.save()
            return movie

    # Try to find by IMDB ID
    if imdb_id:
        movie = Movie.objects.filter(imdb_id=imdb_id).first()
        if movie:
            # Update with any new info we have
            updated = False
            if info.get('plot') and not movie.description:
                movie.description = info.get('plot')
                updated = True
            if info.get('rating') and not movie.rating:
                movie.rating = info.get('rating')
                updated = True
            if info.get('genre') and not movie.genre:
                movie.genre = info.get('genre')
                updated = True
            if not movie.year and year:
                movie.year = year
                updated = True
            duration = convert_duration_to_minutes(info.get('duration_secs'))
            if duration and not movie.duration:
                movie.duration = duration
                updated = True
            if updated:
                movie.save()
            return movie

    # Try to find by name and year - use first() to handle multiple matches
    if year:
        movie = Movie.objects.filter(name=name, year=year).first()
        if movie:
            return movie

    # Try to find by name only if no year provided
    movie = Movie.objects.filter(name=name).first()
    if movie:
        return movie

    # Create new movie with all available data
    return Movie.objects.create(
        name=name,
        year=year,
        tmdb_id=tmdb_id,
        imdb_id=imdb_id,
        description=info.get('plot', ''),
        rating=info.get('rating', ''),
        genre=info.get('genre', ''),
        duration=convert_duration_to_minutes(info.get('duration_secs'))
    )


def find_or_create_series(name, year, tmdb_id, imdb_id, info):
    """Find existing series or create new one based on metadata"""
    # Try to find by TMDB ID first
    if tmdb_id:
        series = Series.objects.filter(tmdb_id=tmdb_id).first()
        if series:
            # Update with any new info we have
            updated = False
            if info.get('plot') and not series.description:
                series.description = info.get('plot')
                updated = True
            if info.get('rating') and not series.rating:
                series.rating = info.get('rating')
                updated = True
            if info.get('genre') and not series.genre:
                series.genre = info.get('genre')
                updated = True
            if not series.year and year:
                series.year = year
                updated = True
            if updated:
                series.save()
            return series

    # Try to find by IMDB ID
    if imdb_id:
        series = Series.objects.filter(imdb_id=imdb_id).first()
        if series:
            # Update with any new info we have
            updated = False
            if info.get('plot') and not series.description:
                series.description = info.get('plot')
                updated = True
            if info.get('rating') and not series.rating:
                series.rating = info.get('rating')
                updated = True
            if info.get('genre') and not series.genre:
                series.genre = info.get('genre')
                updated = True
            if not series.year and year:
                series.year = year
                updated = True
            if updated:
                series.save()
            return series

    # Try to find by name and year - use first() to handle multiple matches
    if year:
        series = Series.objects.filter(name=name, year=year).first()
        if series:
            return series

    # Try to find by name only if no year provided
    series = Series.objects.filter(name=name).first()
    if series:
        return series

    # Create new series with all available data
    return Series.objects.create(
        name=name,
        year=year,
        tmdb_id=tmdb_id,
        imdb_id=imdb_id,
        description=info.get('plot', ''),
        rating=info.get('rating', ''),
        genre=info.get('genre', '')
    )


def extract_year(date_string):
    """Extract year from date string"""
    if not date_string:
        return None
    try:
        return int(date_string.split('-')[0])
    except (ValueError, IndexError):
        return None


def convert_duration_to_minutes(duration_secs):
    """Convert duration from seconds to minutes"""
    if not duration_secs:
        return None
    try:
        return int(duration_secs) // 60
    except (ValueError, TypeError):
        return None


@shared_task
def cleanup_orphaned_vod_content():
    """Clean up VOD content that has no M3U relations"""
    # Clean up movies with no relations
    orphaned_movies = Movie.objects.filter(m3u_relations__isnull=True)
    movie_count = orphaned_movies.count()
    orphaned_movies.delete()

    # Clean up series with no relations
    orphaned_series = Series.objects.filter(m3u_relations__isnull=True)
    series_count = orphaned_series.count()
    orphaned_series.delete()

    # Episodes will be cleaned up via CASCADE when series are deleted

    logger.info(f"Cleaned up {movie_count} orphaned movies and {series_count} orphaned series")
    return f"Cleaned up {movie_count} movies and {series_count} series"