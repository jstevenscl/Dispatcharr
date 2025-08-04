import logging
import requests
import json
import re
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from .models import Series, VODCategory, VODConnection, Movie, Episode
from apps.m3u.models import M3UAccount
from apps.channels.models import Logo
from core.xtream_codes import Client as XtreamCodesClient

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def refresh_vod_content(self, account_id):
    """Refresh VOD content from XtreamCodes API"""
    try:
        account = M3UAccount.objects.get(id=account_id)
        if account.account_type != M3UAccount.Types.XC:
            logger.warning(f"Account {account_id} is not XtreamCodes type")
            return

        # Get movies and series
        refresh_movies(account)
        refresh_series(account)

        logger.info(f"Successfully refreshed VOD content for account {account_id}")

    except M3UAccount.DoesNotExist:
        logger.error(f"M3U Account {account_id} not found")
    except Exception as e:
        logger.error(f"Error refreshing VOD content for account {account_id}: {e}")


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


def refresh_movies(account):
    """Refresh movie content"""
    try:
        # Get movie categories
        categories_url = f"{account.server_url}/player_api.php"
        params = {
            'username': account.username,
            'password': account.password,
            'action': 'get_vod_categories'
        }

        response = requests.get(categories_url, params=params, timeout=30)
        response.raise_for_status()
        categories_data = response.json()

        # Create a mapping of category_id to category name for lookup
        category_id_to_name = {}
        for cat_data in categories_data:
            category_id_to_name[cat_data.get('category_id')] = cat_data['category_name']

            # Create/update categories
            VODCategory.objects.get_or_create(
                name=cat_data['category_name'],
                m3u_account=account,
                category_type='movie',
                defaults={
                    'name': cat_data['category_name'],
                    'category_type': 'movie'
                }
            )

        # Get movies
        movies_url = f"{account.server_url}/player_api.php"
        params['action'] = 'get_vod_streams'

        response = requests.get(movies_url, params=params, timeout=30)
        response.raise_for_status()
        movies_data = response.json()

        for movie_data in movies_data:
            try:
                # Get category
                category = None
                category_id = movie_data.get('category_id')

                if category_id:
                    # First try to get category name from our mapping
                    category_name = category_id_to_name.get(category_id)
                    if not category_name:
                        # Fallback to category_name from movie data
                        category_name = movie_data.get('category_name', '')

                    if category_name:
                        try:
                            category = VODCategory.objects.filter(
                                name=category_name,
                                m3u_account=account,
                                category_type='movie'
                            ).first()
                        except Exception as e:
                            logger.warning(f"Error finding category for movie {movie_data.get('name', 'Unknown')}: {e}")
                            category = None

                # Create/update movie
                stream_url = f"{account.server_url}/movie/{account.username}/{account.password}/{movie_data['stream_id']}.{movie_data.get('container_extension', 'mp4')}"

                # Extract year from title if not provided in API
                year = extract_year_from_data(movie_data, 'name')

                movie_data_dict = {
                    'name': movie_data['name'],
                    'url': stream_url,
                    'category': category,
                    'year': year,
                    'rating': movie_data.get('rating'),
                    'genre': movie_data.get('genre'),
                    'duration': movie_data.get('duration_secs', 0) // 60 if movie_data.get('duration_secs') else None,
                    'container_extension': movie_data.get('container_extension'),
                    'tmdb_id': movie_data.get('tmdb_id'),
                    'imdb_id': movie_data.get('imdb_id'),
                    'custom_properties': movie_data if movie_data else None
                }

                # Use new Movie model
                movie, created = Movie.objects.update_or_create(
                    stream_id=movie_data['stream_id'],
                    m3u_account=account,
                    defaults=movie_data_dict
                )

                # Handle logo
                if movie_data.get('stream_icon'):
                    logo, _ = Logo.objects.get_or_create(
                        url=movie_data['stream_icon'],
                        defaults={'name': movie_data['name']}
                    )
                    movie.logo = logo
                    movie.save()

            except Exception as e:
                logger.error(f"Error processing movie {movie_data.get('name', 'Unknown')}: {e}")
                continue

    except Exception as e:
        logger.error(f"Error refreshing movies for account {account.id}: {e}")


def refresh_series(account):
    """Refresh series and episodes content"""
    try:
        # Get series categories
        categories_url = f"{account.server_url}/player_api.php"
        params = {
            'username': account.username,
            'password': account.password,
            'action': 'get_series_categories'
        }

        response = requests.get(categories_url, params=params, timeout=30)
        response.raise_for_status()
        categories_data = response.json()

        # Create a mapping of category_id to category name for lookup
        category_id_to_name = {}
        for cat_data in categories_data:
            category_id_to_name[cat_data.get('category_id')] = cat_data['category_name']

            # Create/update series categories
            VODCategory.objects.get_or_create(
                name=cat_data['category_name'],
                m3u_account=account,
                category_type='series',
                defaults={
                    'name': cat_data['category_name'],
                    'category_type': 'series'
                }
            )

        # Get series list
        series_url = f"{account.server_url}/player_api.php"
        params['action'] = 'get_series'

        response = requests.get(series_url, params=params, timeout=30)
        response.raise_for_status()
        series_data = response.json()

        for series_item in series_data:
            try:
                # Get category
                category = None
                category_id = series_item.get('category_id')

                if category_id:
                    # First try to get category name from our mapping
                    category_name = category_id_to_name.get(category_id)
                    if not category_name:
                        # Fallback to category_name from series data
                        category_name = series_item.get('category_name', '')

                    if category_name:
                        try:
                            category = VODCategory.objects.filter(
                                name=category_name,
                                m3u_account=account,
                                category_type='series'
                            ).first()
                        except Exception as e:
                            logger.warning(f"Error finding category for series {series_item.get('name', 'Unknown')}: {e}")
                            category = None

                # Create/update series
                # Extract year from series data
                year = extract_year_from_data(series_item, 'name')

                series_data_dict = {
                    'name': series_item['name'],
                    'description': series_item.get('plot'),
                    'year': year,
                    'rating': series_item.get('rating'),
                    'genre': series_item.get('genre'),
                    'category': category,
                    'tmdb_id': series_item.get('tmdb_id'),
                    'imdb_id': series_item.get('imdb_id'),
                    'custom_properties': series_item if series_item else None
                }

                series, created = Series.objects.update_or_create(
                    series_id=series_item['series_id'],
                    m3u_account=account,
                    defaults=series_data_dict
                )

                # Handle series logo
                if series_item.get('cover'):
                    logo, _ = Logo.objects.get_or_create(
                        url=series_item['cover'],
                        defaults={'name': series_item['name']}
                    )
                    series.logo = logo
                    series.save()

                # Get series episodes
                refresh_series_episodes(account, series, series_item['series_id'])

            except Exception as e:
                logger.error(f"Error processing series {series_item.get('name', 'Unknown')}: {e}")
                continue

    except Exception as e:
        logger.error(f"Error refreshing series for account {account.id}: {e}")


def refresh_series_episodes(account, series, series_id):
    """Refresh episodes for a specific series"""
    try:
        episodes_url = f"{account.server_url}/player_api.php"
        params = {
            'username': account.username,
            'password': account.password,
            'action': 'get_series_info',
            'series_id': series_id
        }

        response = requests.get(episodes_url, params=params, timeout=30)
        response.raise_for_status()
        series_info = response.json()

        # Process episodes by season
        if 'episodes' in series_info:
            for season_num, episodes in series_info['episodes'].items():
                for episode_data in episodes:
                    try:
                        # Build episode stream URL
                        stream_url = f"{account.server_url}/series/{account.username}/{account.password}/{episode_data['id']}.{episode_data.get('container_extension', 'mp4')}"

                        episode_dict = {
                            'name': episode_data.get('title', f"Episode {episode_data.get('episode_num', '')}"),
                            'series': series,
                            'season_number': int(season_num) if season_num.isdigit() else None,
                            'episode_number': episode_data.get('episode_num'),
                            'url': stream_url,
                            'description': episode_data.get('plot'),
                            'year': episode_data.get('air_date', '').split('-')[0] if episode_data.get('air_date') else None,
                            'rating': episode_data.get('rating'),
                            'duration': episode_data.get('duration_secs', 0) // 60 if episode_data.get('duration_secs') else None,
                            'container_extension': episode_data.get('container_extension'),
                            'tmdb_id': episode_data.get('tmdb_id'),
                            'imdb_id': episode_data.get('imdb_id'),
                            'custom_properties': episode_data if episode_data else None
                        }

                        # Use new Episode model
                        episode, created = Episode.objects.update_or_create(
                            stream_id=episode_data['id'],
                            m3u_account=account,
                            defaults=episode_dict
                        )

                    except Exception as e:
                        logger.error(f"Error processing episode {episode_data.get('title', 'Unknown')}: {e}")
                        continue

    except Exception as e:
        logger.error(f"Error refreshing episodes for series {series_id}: {e}")

@shared_task
def cleanup_inactive_vod_connections():
    """Clean up inactive VOD connections"""
    cutoff_time = timezone.now() - timedelta(minutes=30)
    inactive_connections = VODConnection.objects.filter(last_activity__lt=cutoff_time)

    count = inactive_connections.count()
    if count > 0:
        inactive_connections.delete()
        logger.info(f"Cleaned up {count} inactive VOD connections")

    return count