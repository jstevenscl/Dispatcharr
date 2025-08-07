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
import re

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
        year = extract_year_from_data(movie_data, 'name')

        # Extract TMDB and IMDB IDs if available in basic data
        tmdb_id = movie_data.get('tmdb_id') or movie_data.get('tmdb')
        imdb_id = movie_data.get('imdb_id') or movie_data.get('imdb')

        # Extract additional metadata that might be available in basic data
        description = movie_data.get('description') or movie_data.get('plot') or ''
        rating = movie_data.get('rating') or movie_data.get('vote_average') or ''
        genre = movie_data.get('genre') or movie_data.get('category_name') or ''

        # Extract trailer
        trailer = movie_data.get('trailer') or movie_data.get('youtube_trailer') or ''

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
            'trailer': trailer,
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

        # Extract trailer
        trailer = series_data.get('trailer') or series_data.get('youtube_trailer') or ''

        # Build info dict with all extracted data
        info = {
            'plot': description,
            'rating': rating,
            'genre': genre,
            'trailer': trailer,
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


def process_episode(account, series, episode_data, season_number):
    """Process a single episode"""
    try:
        episode_id = episode_data.get('id')
        episode_name = episode_data.get('title', 'Unknown Episode')
        episode_number = episode_data.get('episode_num', 0)

        # Extract metadata
        description = ''
        info = episode_data.get('info', {})
        if info:
            description = info.get('plot') or info.get('overview', '')

        rating = episode_data.get('rating', '')
        release_date = extract_year_from_data(episode_data.get('info'))

        # Create or update episode
        episode, created = Episode.objects.update_or_create(
            series=series,
            season_number=season_number,
            episode_number=episode_number,
            defaults={
                'name': episode_name,
                'description': description,
                'rating': rating,
                'release_date': release_date,
            }
        )

        # Create stream URL
        with XtreamCodesClient(
            account.server_url,
            account.username,
            account.password,
            account.get_user_agent().user_agent
        ) as client:
            stream_url = client.get_episode_stream_url(episode_id)

        # Create or update episode relation
        relation, created = M3UEpisodeRelation.objects.update_or_create(
            m3u_account=account,
            episode=episode,
            defaults={
                'stream_id': str(episode_id),
                'url': stream_url,
                'container_extension': episode_data.get('container_extension', 'mp4'),
                'custom_properties': {
                    'info': episode_data,
                    'season_number': season_number
                }
            }
        )

        if created:
            logger.debug(f"Created new episode: {episode_name} S{season_number}E{episode_number}")
        else:
            logger.debug(f"Updated episode: {episode_name} S{season_number}E{episode_number}")

    except Exception as e:
        logger.error(f"Error processing episode {episode_data.get('title', 'Unknown')}: {str(e)}")


def find_or_create_movie(name, year, tmdb_id, imdb_id, info):
    """Find existing movie or create new one based on metadata"""
    movie = None

    # Try to find by TMDB ID first
    if tmdb_id:
        movie = Movie.objects.filter(tmdb_id=tmdb_id).first()

    # Try to find by IMDB ID if not found by TMDB
    if not movie and imdb_id:
        movie = Movie.objects.filter(imdb_id=imdb_id).first()

    # Try to find by name and year if not found by IDs
    if not movie and year:
        movie = Movie.objects.filter(name=name, year=year).first()

    # Try to find by name only if still not found
    if not movie:
        movie = Movie.objects.filter(name=name).first()

    # If we found an existing movie, update it
    if movie:
        updated = False
        if info.get('plot') and info.get('plot') != movie.description:
            movie.description = info.get('plot')
            updated = True
        if info.get('rating') and info.get('rating') != movie.rating:
            movie.rating = info.get('rating')
            updated = True
        if info.get('genre') and info.get('genre') != movie.genre:
            movie.genre = info.get('genre')
            updated = True
        if year and year != movie.year:
            movie.year = year
            updated = True
        if tmdb_id and tmdb_id != movie.tmdb_id:
            movie.tmdb_id = tmdb_id
            updated = True
        if imdb_id and imdb_id != movie.imdb_id:
            movie.imdb_id = imdb_id
            updated = True

        duration = convert_duration_to_minutes(info.get('duration_secs'))
        if duration and duration != movie.duration:
            movie.duration = duration
            updated = True

        # Update custom_properties with trailer and other metadata
        custom_props = movie.custom_properties or {}
        custom_props_updated = False
        if info.get('trailer') and info.get('trailer') != custom_props.get('trailer'):
            custom_props['trailer'] = info.get('trailer')
            custom_props_updated = True
        if info.get('youtube_trailer') and info.get('youtube_trailer') != custom_props.get('youtube_trailer'):
            custom_props['youtube_trailer'] = info.get('youtube_trailer')
            custom_props_updated = True

        if custom_props_updated:
            movie.custom_properties = custom_props
            updated = True

        if updated:
            movie.save()
        return movie

    # Create new movie if not found
    custom_props = {}
    if info.get('trailer'):
        custom_props['trailer'] = info.get('trailer')
    if info.get('youtube_trailer'):
        custom_props['youtube_trailer'] = info.get('youtube_trailer')

    return Movie.objects.create(
        name=name,
        year=year,
        tmdb_id=tmdb_id,
        imdb_id=imdb_id,
        description=info.get('plot', ''),
        rating=info.get('rating', ''),
        genre=info.get('genre', ''),
        duration=convert_duration_to_minutes(info.get('duration_secs')),
        custom_properties=custom_props if custom_props else None
    )


def find_or_create_series(name, year, tmdb_id, imdb_id, info):
    """Find existing series or create new one based on metadata"""
    series = None

    # Try to find by TMDB ID first
    if tmdb_id:
        series = Series.objects.filter(tmdb_id=tmdb_id).first()

    # Try to find by IMDB ID if not found by TMDB
    if not series and imdb_id:
        series = Series.objects.filter(imdb_id=imdb_id).first()

    # Try to find by name and year if not found by IDs
    if not series and year:
        series = Series.objects.filter(name=name, year=year).first()

    # Try to find by name only if still not found
    if not series:
        series = Series.objects.filter(name=name).first()

    # If we found an existing series, update it
    if series:
        updated = False
        if info.get('plot') and info.get('plot') != series.description:
            series.description = info.get('plot')
            updated = True
        if info.get('rating') and info.get('rating') != series.rating:
            series.rating = info.get('rating')
            updated = True
        if info.get('genre') and info.get('genre') != series.genre:
            series.genre = info.get('genre')
            updated = True
        if year and year != series.year:
            series.year = year
            updated = True
        if tmdb_id and tmdb_id != series.tmdb_id:
            series.tmdb_id = tmdb_id
            updated = True
        if imdb_id and imdb_id != series.imdb_id:
            series.imdb_id = imdb_id
            updated = True

        # Update custom_properties with trailer and other metadata
        custom_props = series.custom_properties or {}
        custom_props_updated = False
        if info.get('trailer') and info.get('trailer') != custom_props.get('trailer'):
            custom_props['trailer'] = info.get('trailer')
            custom_props_updated = True
        if info.get('youtube_trailer') and info.get('youtube_trailer') != custom_props.get('youtube_trailer'):
            custom_props['youtube_trailer'] = info.get('youtube_trailer')
            custom_props_updated = True

        if custom_props_updated:
            series.custom_properties = custom_props
            updated = True

        if updated:
            series.save()
        return series

    # Create new series if not found
    custom_props = {}
    if info.get('trailer'):
        custom_props['trailer'] = info.get('trailer')
    if info.get('youtube_trailer'):
        custom_props['youtube_trailer'] = info.get('youtube_trailer')

    return Series.objects.create(
        name=name,
        year=year,
        tmdb_id=tmdb_id,
        imdb_id=imdb_id,
        description=info.get('plot', ''),
        rating=info.get('rating', ''),
        genre=info.get('genre', ''),
        custom_properties=custom_props if custom_props else None
    )


def extract_year(date_string):
    """Extract year from date string"""
    if not date_string:
        return None
    try:
        return int(date_string.split('-')[0])
    except (ValueError, IndexError):
        return None

def extract_year_from_title(title):
    """Extract year from movie title if present"""
    if not title:
        return None

    # Pattern for (YYYY) format
    pattern1 = r'\((\d{4})\)'
    # Pattern for - YYYY format
    pattern2 = r'\s-\s(\d{4})'
    # Pattern for YYYY at the end
    pattern3 = r'\s(\d{4})$'

    for pattern in [pattern1, pattern2, pattern3]:
        match = re.search(pattern, title)
        if match:
            year = int(match.group(1))
            # Validate year is reasonable (between 1900 and current year + 5)
            if 1900 <= year <= 2030:
                return year

    return None


def extract_year_from_data(data, title_key='name'):
    """Extract year from various data sources with fallback options"""
    try:
        # First try the year field
        year = data.get('year')
        if year and str(year).strip() and str(year).strip() != '':
            try:
                year_int = int(year)
                if 1900 <= year_int <= 2030:
                    return year_int
            except (ValueError, TypeError):
                pass

        # Try releaseDate or release_date fields
        for date_field in ['releaseDate', 'release_date']:
            date_value = data.get(date_field)
            if date_value and isinstance(date_value, str) and date_value.strip():
                # Extract year from date format like "2011-09-19"
                try:
                    year_str = date_value.split('-')[0].strip()
                    if year_str:
                        year = int(year_str)
                        if 1900 <= year <= 2030:
                            return year
                except (ValueError, IndexError):
                    continue

        # Finally try extracting from title
        title = data.get(title_key, '')
        if title and title.strip():
            return extract_year_from_title(title)

    except Exception:
        # Don't fail processing if year extraction fails
        pass

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