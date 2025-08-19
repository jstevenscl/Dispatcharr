from celery import shared_task
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from apps.m3u.models import M3UAccount
from core.xtream_codes import Client as XtreamCodesClient
from .models import (
    VODCategory, Series, Movie, Episode,
    M3USeriesRelation, M3UMovieRelation, M3UEpisodeRelation
)
from apps.channels.models import Logo
from datetime import datetime
import logging
import json
import re

logger = logging.getLogger(__name__)


@shared_task
def refresh_vod_content(account_id):
    """Refresh VOD content for an M3U account with batch processing for improved performance"""
    try:
        account = M3UAccount.objects.get(id=account_id, is_active=True)

        if account.account_type != M3UAccount.Types.XC:
            logger.warning(f"VOD refresh called for non-XC account {account_id}")
            return "VOD refresh only available for XtreamCodes accounts"

        logger.info(f"Starting batch VOD refresh for account {account.name}")
        start_time = timezone.now()

        with XtreamCodesClient(
            account.server_url,
            account.username,
            account.password,
            account.get_user_agent().user_agent
        ) as client:

            # Refresh movies with batch processing
            refresh_movies(client, account)

            # Refresh series with batch processing
            refresh_series(client, account)

        end_time = timezone.now()
        duration = (end_time - start_time).total_seconds()

        logger.info(f"Batch VOD refresh completed for account {account.name} in {duration:.2f} seconds")
        return f"Batch VOD refresh completed for account {account.name} in {duration:.2f} seconds"

    except Exception as e:
        logger.error(f"Error refreshing VOD for account {account_id}: {str(e)}")
        return f"VOD refresh failed: {str(e)}"


def refresh_movies(client, account):
    """Refresh movie content using simple batch processing like M3U"""
    logger.info(f"Refreshing movies for account {account.name}")

    # Get movie categories and pre-create them in batch
    categories = client.get_vod_categories()
    category_map = batch_create_categories(categories, 'movie')

    # Collect all movie data first
    all_movies_data = []
    for category_data in categories:
        category_id = category_data.get('category_id')
        category_name = category_data.get('category_name', 'Unknown')
        category = category_map.get(category_name)

        # Get movies in this category - only basic list
        movies = client.get_vod_streams(category_id)

        for movie_data in movies:
            # Store category ID instead of object to avoid JSON serialization issues
            movie_data['_category_id'] = category.id if category else None
            movie_data['_category_name'] = category_name
            all_movies_data.append(movie_data)

    # Process movies in chunks using the simple approach
    chunk_size = 1000
    total_movies = len(all_movies_data)

    for i in range(0, total_movies, chunk_size):
        chunk = all_movies_data[i:i + chunk_size]
        chunk_num = (i // chunk_size) + 1
        total_chunks = (total_movies + chunk_size - 1) // chunk_size

        logger.info(f"Processing movie chunk {chunk_num}/{total_chunks} ({len(chunk)} movies)")
        process_movie_batch(account, chunk, category_map)

    logger.info(f"Completed processing all {total_movies} movies in {total_chunks} chunks")


def refresh_series(client, account):
    """Refresh series content using simple batch processing like M3U"""
    logger.info(f"Refreshing series for account {account.name}")

    # Get series categories and pre-create them in batch
    categories = client.get_series_categories()
    category_map = batch_create_categories(categories, 'series')

    # Collect all series data first
    all_series_data = []
    for category_data in categories:
        category_id = category_data.get('category_id')
        category_name = category_data.get('category_name', 'Unknown')
        category = category_map.get(category_name)

        # Get series in this category - only basic list
        series_list = client.get_series(category_id)

        for series_data in series_list:
            # Store category ID instead of object to avoid JSON serialization issues
            series_data['_category_id'] = category.id if category else None
            series_data['_category_name'] = category_name
            all_series_data.append(series_data)

    # Process series in chunks using the simple approach
    chunk_size = 1000
    total_series = len(all_series_data)

    for i in range(0, total_series, chunk_size):
        chunk = all_series_data[i:i + chunk_size]
        chunk_num = (i // chunk_size) + 1
        total_chunks = (total_series + chunk_size - 1) // chunk_size

        logger.info(f"Processing series chunk {chunk_num}/{total_chunks} ({len(chunk)} series)")
        process_series_batch(account, chunk, category_map)

    logger.info(f"Completed processing all {total_series} series in {total_chunks} chunks")


# Batch processing functions for improved efficiency

def batch_create_categories(categories_data, category_type):
    """Create categories in batch and return a mapping"""
    category_names = [cat.get('category_name', 'Unknown') for cat in categories_data]

    # Get existing categories
    existing_categories = {
        cat.name: cat for cat in VODCategory.objects.filter(
            name__in=category_names,
            category_type=category_type
        )
    }

    # Create missing categories in batch
    new_categories = []
    for name in category_names:
        if name not in existing_categories:
            new_categories.append(VODCategory(name=name, category_type=category_type))

    if new_categories:
        VODCategory.objects.bulk_create(new_categories, ignore_conflicts=True)
        # Fetch the newly created categories
        newly_created = {
            cat.name: cat for cat in VODCategory.objects.filter(
                name__in=[cat.name for cat in new_categories],
                category_type=category_type
            )
        }
        existing_categories.update(newly_created)

    return existing_categories


@shared_task
def process_movie_batch(account, batch, category_map):
    """Process a batch of movies using simple bulk operations like M3U processing"""
    logger.info(f"Processing movie batch of {len(batch)} movies for account {account.name}")

    movies_to_create = []
    movies_to_update = []
    relations_to_create = []
    relations_to_update = []
    movie_keys = {}  # For deduplication like M3U stream_hashes

    # Process each movie in the batch
    for movie_data in batch:
        try:
            stream_id = str(movie_data.get('stream_id'))
            name = movie_data.get('name', 'Unknown')
            category_id = movie_data.get('_category_id')
            category = VODCategory.objects.get(id=category_id) if category_id else None

            # Extract metadata
            year = extract_year_from_data(movie_data, 'name')
            tmdb_id = movie_data.get('tmdb_id') or movie_data.get('tmdb')
            imdb_id = movie_data.get('imdb_id') or movie_data.get('imdb')

            # Clean empty string IDs
            if tmdb_id == '':
                tmdb_id = None
            if imdb_id == '':
                imdb_id = None

            # Create a unique key for this movie (priority: TMDB > IMDB > name+year)
            if tmdb_id:
                movie_key = f"tmdb_{tmdb_id}"
            elif imdb_id:
                movie_key = f"imdb_{imdb_id}"
            else:
                movie_key = f"name_{name}_{year or 'None'}"

            # Skip duplicates in this batch
            if movie_key in movie_keys:
                continue

            # Prepare movie properties
            description = movie_data.get('description') or movie_data.get('plot') or ''
            rating = movie_data.get('rating') or movie_data.get('vote_average') or ''
            genre = movie_data.get('genre') or movie_data.get('category_name') or ''
            duration_secs = extract_duration_from_data(movie_data)
            trailer = movie_data.get('trailer') or movie_data.get('youtube_trailer') or ''
            logo_url = movie_data.get('stream_icon') or ''

            movie_props = {
                'name': name,
                'year': year,
                'tmdb_id': tmdb_id,
                'imdb_id': imdb_id,
                'description': description,
                'rating': rating,
                'genre': genre,
                'duration_secs': duration_secs,
                'custom_properties': {'trailer': trailer} if trailer else None,
            }

            movie_keys[movie_key] = {
                'props': movie_props,
                'stream_id': stream_id,
                'category': category,
                'movie_data': movie_data,
                'logo_url': logo_url  # Keep logo URL for later processing
            }

        except Exception as e:
            logger.error(f"Error preparing movie {movie_data.get('name', 'Unknown')}: {str(e)}")

    # Collect all logo URLs and create logos in batch
    logo_urls = set()
    logo_url_to_name = {}  # Map logo URLs to movie names
    for data in movie_keys.values():
        logo_url = data.get('logo_url')
        if logo_url and len(logo_url) <= 500:  # Ignore overly long URLs (likely embedded image data)
            logo_urls.add(logo_url)
            # Map this logo URL to the movie name (use first occurrence if multiple movies share same logo)
            if logo_url not in logo_url_to_name:
                movie_name = data['props'].get('name', 'Unknown Movie')
                logo_url_to_name[logo_url] = movie_name

    # Get existing logos
    existing_logos = {
        logo.url: logo for logo in Logo.objects.filter(url__in=logo_urls)
    } if logo_urls else {}

    # Create missing logos
    logos_to_create = []
    for logo_url in logo_urls:
        if logo_url not in existing_logos:
            movie_name = logo_url_to_name.get(logo_url, 'Unknown Movie')
            logos_to_create.append(Logo(url=logo_url, name=movie_name))

    if logos_to_create:
        try:
            Logo.objects.bulk_create(logos_to_create, ignore_conflicts=True)
            # Refresh existing_logos with newly created ones
            new_logo_urls = [logo.url for logo in logos_to_create]
            newly_created = {
                logo.url: logo for logo in Logo.objects.filter(url__in=new_logo_urls)
            }
            existing_logos.update(newly_created)
            logger.info(f"Created {len(newly_created)} new logos for movies")
        except Exception as e:
            logger.warning(f"Failed to create logos: {e}")

    # Get existing movies based on our keys
    existing_movies = {}

    # Query by TMDB IDs
    tmdb_keys = [k for k in movie_keys.keys() if k.startswith('tmdb_')]
    tmdb_ids = [k.replace('tmdb_', '') for k in tmdb_keys]
    if tmdb_ids:
        for movie in Movie.objects.filter(tmdb_id__in=tmdb_ids):
            existing_movies[f"tmdb_{movie.tmdb_id}"] = movie

    # Query by IMDB IDs
    imdb_keys = [k for k in movie_keys.keys() if k.startswith('imdb_')]
    imdb_ids = [k.replace('imdb_', '') for k in imdb_keys]
    if imdb_ids:
        for movie in Movie.objects.filter(imdb_id__in=imdb_ids):
            existing_movies[f"imdb_{movie.imdb_id}"] = movie

    # Query by name+year for movies without external IDs
    name_year_keys = [k for k in movie_keys.keys() if k.startswith('name_')]
    if name_year_keys:
        for movie in Movie.objects.filter(tmdb_id__isnull=True, imdb_id__isnull=True):
            key = f"name_{movie.name}_{movie.year or 'None'}"
            if key in name_year_keys:
                existing_movies[key] = movie

    # Get existing relations
    stream_ids = [data['stream_id'] for data in movie_keys.values()]
    existing_relations = {
        rel.stream_id: rel for rel in M3UMovieRelation.objects.filter(
            m3u_account=account,
            stream_id__in=stream_ids
        ).select_related('movie')
    }

    # Process each movie
    for movie_key, data in movie_keys.items():
        movie_props = data['props']
        stream_id = data['stream_id']
        category = data['category']
        movie_data = data['movie_data']
        logo_url = data.get('logo_url')

        if movie_key in existing_movies:
            # Update existing movie
            movie = existing_movies[movie_key]
            updated = False

            for field, value in movie_props.items():
                if field == 'custom_properties':
                    if value != movie.custom_properties:
                        movie.custom_properties = value
                        updated = True
                elif getattr(movie, field) != value:
                    setattr(movie, field, value)
                    updated = True

            # Handle logo assignment for existing movies
            if logo_url and len(logo_url) <= 500 and logo_url in existing_logos:
                new_logo = existing_logos[logo_url]
                if movie.logo != new_logo:
                    movie.logo = new_logo
                    updated = True
            elif (not logo_url or len(logo_url) > 500) and movie.logo:
                # Clear logo if no logo URL provided or URL is too long
                movie.logo = None
                updated = True

            if updated:
                movies_to_update.append(movie)
        else:
            # Create new movie
            movie = Movie(**movie_props)

            # Assign logo if available
            if logo_url and len(logo_url) <= 500 and logo_url in existing_logos:
                movie.logo = existing_logos[logo_url]

            movies_to_create.append(movie)

        # Handle relation
        if stream_id in existing_relations:
            # Update existing relation
            relation = existing_relations[stream_id]
            relation.movie = movie
            relation.category = category
            relation.container_extension = movie_data.get('container_extension', 'mp4')
            relation.custom_properties = {
                'basic_data': movie_data,
                'detailed_fetched': False
            }
            relations_to_update.append(relation)
        else:
            # Create new relation
            relation = M3UMovieRelation(
                m3u_account=account,
                movie=movie,
                category=category,
                stream_id=stream_id,
                url='',  # Will be set later if needed
                container_extension=movie_data.get('container_extension', 'mp4'),
                custom_properties={
                    'basic_data': movie_data,
                    'detailed_fetched': False
                }
            )
            relations_to_create.append(relation)

    # Execute batch operations
    logger.info(f"Executing batch operations: {len(movies_to_create)} movies to create, {len(movies_to_update)} to update")

    try:
        with transaction.atomic():
            # First, create new movies and get their IDs
            created_movies = {}
            if movies_to_create:
                Movie.objects.bulk_create(movies_to_create, ignore_conflicts=True)

                # Get the newly created movies with their IDs
                # We need to re-fetch them to get the primary keys
                for movie in movies_to_create:
                    # Find the movie by its unique identifiers
                    if movie.tmdb_id:
                        db_movie = Movie.objects.filter(tmdb_id=movie.tmdb_id).first()
                    elif movie.imdb_id:
                        db_movie = Movie.objects.filter(imdb_id=movie.imdb_id).first()
                    else:
                        db_movie = Movie.objects.filter(
                            name=movie.name,
                            year=movie.year,
                            tmdb_id__isnull=True,
                            imdb_id__isnull=True
                        ).first()

                    if db_movie:
                        created_movies[id(movie)] = db_movie

            # Update existing movies
            if movies_to_update:
                Movie.objects.bulk_update(movies_to_update, [
                    'description', 'rating', 'genre', 'year', 'tmdb_id', 'imdb_id',
                    'duration_secs', 'custom_properties', 'logo'
                ])

            # Update relations to reference the correct movie objects
            for relation in relations_to_create:
                if id(relation.movie) in created_movies:
                    relation.movie = created_movies[id(relation.movie)]

            # Handle relations
            if relations_to_create:
                M3UMovieRelation.objects.bulk_create(relations_to_create, ignore_conflicts=True)

            if relations_to_update:
                M3UMovieRelation.objects.bulk_update(relations_to_update, [
                    'movie', 'category', 'url', 'container_extension', 'custom_properties'
                ])

        logger.info("Movie batch processing completed successfully!")
        return f"Movie batch processed: {len(movies_to_create)} created, {len(movies_to_update)} updated"

    except Exception as e:
        logger.error(f"Movie batch processing failed: {str(e)}")
        return f"Movie batch processing failed: {str(e)}"


@shared_task
def process_series_batch(account, batch, category_map):
    """Process a batch of series using simple bulk operations like M3U processing"""
    logger.info(f"Processing series batch of {len(batch)} series for account {account.name}")

    series_to_create = []
    series_to_update = []
    relations_to_create = []
    relations_to_update = []
    series_keys = {}  # For deduplication like M3U stream_hashes

    # Process each series in the batch
    for series_data in batch:
        try:
            series_id = str(series_data.get('series_id'))
            name = series_data.get('name', 'Unknown')
            category_id = series_data.get('_category_id')
            category = VODCategory.objects.get(id=category_id) if category_id else None

            # Extract metadata
            year = extract_year(series_data.get('releaseDate', ''))
            if not year and series_data.get('release_date'):
                year = extract_year(series_data.get('release_date'))

            tmdb_id = series_data.get('tmdb') or series_data.get('tmdb_id')
            imdb_id = series_data.get('imdb') or series_data.get('imdb_id')

            # Clean empty string IDs
            if tmdb_id == '':
                tmdb_id = None
            if imdb_id == '':
                imdb_id = None

            # Create a unique key for this series (priority: TMDB > IMDB > name+year)
            if tmdb_id:
                series_key = f"tmdb_{tmdb_id}"
            elif imdb_id:
                series_key = f"imdb_{imdb_id}"
            else:
                series_key = f"name_{name}_{year or 'None'}"

            # Skip duplicates in this batch
            if series_key in series_keys:
                continue

            # Prepare series properties
            description = series_data.get('plot', '')
            rating = series_data.get('rating', '')
            genre = series_data.get('genre', '')
            logo_url = series_data.get('cover') or ''

            series_props = {
                'name': name,
                'year': year,
                'tmdb_id': tmdb_id,
                'imdb_id': imdb_id,
                'description': description,
                'rating': rating,
                'genre': genre,
            }

            series_keys[series_key] = {
                'props': series_props,
                'series_id': series_id,
                'category': category,
                'series_data': series_data,
                'logo_url': logo_url  # Keep logo URL for later processing
            }

        except Exception as e:
            logger.error(f"Error preparing series {series_data.get('name', 'Unknown')}: {str(e)}")

    # Collect all logo URLs and create logos in batch
    logo_urls = set()
    logo_url_to_name = {}  # Map logo URLs to series names
    for data in series_keys.values():
        logo_url = data.get('logo_url')
        if logo_url and len(logo_url) <= 500:  # Ignore overly long URLs (likely embedded image data)
            logo_urls.add(logo_url)
            # Map this logo URL to the series name (use first occurrence if multiple series share same logo)
            if logo_url not in logo_url_to_name:
                series_name = data['props'].get('name', 'Unknown Series')
                logo_url_to_name[logo_url] = series_name

    # Get existing logos
    existing_logos = {
        logo.url: logo for logo in Logo.objects.filter(url__in=logo_urls)
    } if logo_urls else {}

    # Create missing logos
    logos_to_create = []
    for logo_url in logo_urls:
        if logo_url not in existing_logos:
            series_name = logo_url_to_name.get(logo_url, 'Unknown Series')
            logos_to_create.append(Logo(url=logo_url, name=series_name))

    if logos_to_create:
        try:
            Logo.objects.bulk_create(logos_to_create, ignore_conflicts=True)
            # Refresh existing_logos with newly created ones
            new_logo_urls = [logo.url for logo in logos_to_create]
            newly_created = {
                logo.url: logo for logo in Logo.objects.filter(url__in=new_logo_urls)
            }
            existing_logos.update(newly_created)
            logger.info(f"Created {len(newly_created)} new logos for series")
        except Exception as e:
            logger.warning(f"Failed to create logos: {e}")

    # Get existing series based on our keys - same pattern as movies
    existing_series = {}

    # Query by TMDB IDs
    tmdb_keys = [k for k in series_keys.keys() if k.startswith('tmdb_')]
    tmdb_ids = [k.replace('tmdb_', '') for k in tmdb_keys]
    if tmdb_ids:
        for series in Series.objects.filter(tmdb_id__in=tmdb_ids):
            existing_series[f"tmdb_{series.tmdb_id}"] = series

    # Query by IMDB IDs
    imdb_keys = [k for k in series_keys.keys() if k.startswith('imdb_')]
    imdb_ids = [k.replace('imdb_', '') for k in imdb_keys]
    if imdb_ids:
        for series in Series.objects.filter(imdb_id__in=imdb_ids):
            existing_series[f"imdb_{series.imdb_id}"] = series

    # Query by name+year for series without external IDs
    name_year_keys = [k for k in series_keys.keys() if k.startswith('name_')]
    if name_year_keys:
        for series in Series.objects.filter(tmdb_id__isnull=True, imdb_id__isnull=True):
            key = f"name_{series.name}_{series.year or 'None'}"
            if key in name_year_keys:
                existing_series[key] = series

    # Get existing relations
    series_ids = [data['series_id'] for data in series_keys.values()]
    existing_relations = {
        rel.external_series_id: rel for rel in M3USeriesRelation.objects.filter(
            m3u_account=account,
            external_series_id__in=series_ids
        ).select_related('series')
    }

    # Process each series
    for series_key, data in series_keys.items():
        series_props = data['props']
        series_id = data['series_id']
        category = data['category']
        series_data = data['series_data']
        logo_url = data.get('logo_url')

        if series_key in existing_series:
            # Update existing series
            series = existing_series[series_key]
            updated = False

            for field, value in series_props.items():
                if getattr(series, field) != value:
                    setattr(series, field, value)
                    updated = True

            # Handle logo assignment for existing series
            if logo_url and len(logo_url) <= 500 and logo_url in existing_logos:
                new_logo = existing_logos[logo_url]
                if series.logo != new_logo:
                    series.logo = new_logo
                    updated = True
            elif (not logo_url or len(logo_url) > 500) and series.logo:
                # Clear logo if no logo URL provided or URL is too long
                series.logo = None
                updated = True

            if updated:
                series_to_update.append(series)
        else:
            # Create new series
            series = Series(**series_props)

            # Assign logo if available
            if logo_url and len(logo_url) <= 500 and logo_url in existing_logos:
                series.logo = existing_logos[logo_url]

            series_to_create.append(series)

        # Handle relation
        if series_id in existing_relations:
            # Update existing relation
            relation = existing_relations[series_id]
            relation.series = series
            relation.category = category
            relation.custom_properties = {
                'basic_data': series_data,
                'detailed_fetched': False,
                'episodes_fetched': False
            }
            relations_to_update.append(relation)
        else:
            # Create new relation
            relation = M3USeriesRelation(
                m3u_account=account,
                series=series,
                category=category,
                external_series_id=series_id,
                custom_properties={
                    'basic_data': series_data,
                    'detailed_fetched': False,
                    'episodes_fetched': False
                }
            )
            relations_to_create.append(relation)

    # Execute batch operations
    logger.info(f"Executing batch operations: {len(series_to_create)} series to create, {len(series_to_update)} to update")

    try:
        with transaction.atomic():
            # First, create new series and get their IDs
            created_series = {}
            if series_to_create:
                Series.objects.bulk_create(series_to_create, ignore_conflicts=True)

                # Get the newly created series with their IDs
                # We need to re-fetch them to get the primary keys
                for series in series_to_create:
                    # Find the series by its unique identifiers
                    if series.tmdb_id:
                        db_series = Series.objects.filter(tmdb_id=series.tmdb_id).first()
                    elif series.imdb_id:
                        db_series = Series.objects.filter(imdb_id=series.imdb_id).first()
                    else:
                        db_series = Series.objects.filter(
                            name=series.name,
                            year=series.year,
                            tmdb_id__isnull=True,
                            imdb_id__isnull=True
                        ).first()

                    if db_series:
                        created_series[id(series)] = db_series

            # Update existing series
            if series_to_update:
                Series.objects.bulk_update(series_to_update, [
                    'description', 'rating', 'genre', 'year', 'tmdb_id', 'imdb_id', 'logo'
                ])

            # Update relations to reference the correct series objects
            for relation in relations_to_create:
                if id(relation.series) in created_series:
                    relation.series = created_series[id(relation.series)]

            # Handle relations
            if relations_to_create:
                M3USeriesRelation.objects.bulk_create(relations_to_create, ignore_conflicts=True)

            if relations_to_update:
                M3USeriesRelation.objects.bulk_update(relations_to_update, [
                    'series', 'category', 'custom_properties'
                ])

        logger.info("Series batch processing completed successfully!")
        return f"Series batch processed: {len(series_to_create)} created, {len(series_to_update)} updated"

    except Exception as e:
        logger.error(f"Series batch processing failed: {str(e)}")
        return f"Series batch processing failed: {str(e)}"


# Helper functions for year and date extraction

def extract_duration_from_data(movie_data):
    """Extract duration in seconds from movie data"""
    duration_secs = None

    # Try to extract duration from various possible fields
    if movie_data.get('duration_secs'):
        duration_secs = int(movie_data.get('duration_secs'))
    elif movie_data.get('duration'):
        # Handle duration that might be in different formats
        duration_str = str(movie_data.get('duration'))
        if duration_str.isdigit():
            duration_secs = int(duration_str) * 60  # Assume minutes if just a number
        else:
            # Try to parse time format like "01:30:00"
            try:
                time_parts = duration_str.split(':')
                if len(time_parts) == 3:
                    hours, minutes, seconds = map(int, time_parts)
                    duration_secs = (hours * 3600) + (minutes * 60) + seconds
                elif len(time_parts) == 2:
                    minutes, seconds = map(int, time_parts)
                    duration_secs = minutes * 60 + seconds
            except (ValueError, AttributeError):
                pass

    return duration_secs


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


def extract_date_from_data(data):
    """Extract date from various data sources with fallback options"""
    try:
        for date_field in ['air_date', 'releasedate', 'release_date']:
            date_value = data.get(date_field)
            if date_value and isinstance(date_value, str) and date_value.strip():
                parsed = parse_date(date_value)
                if parsed:
                    return parsed
    except Exception:
        # Don't fail processing if date extraction fails
        pass
    return None


def parse_date(date_string):
    """Parse date string into a datetime object"""
    if not date_string:
        return None
    try:
        # Try to parse ISO format first
        return datetime.fromisoformat(date_string)
    except ValueError:
        # Fallback to parsing with strptime for common formats
        try:
            return datetime.strptime(date_string, '%Y-%m-%d')
        except ValueError:
            return None  # Return None if parsing fails


# Episode processing and other advanced features

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
                        series.year = extract_year_from_data(info)
                        series.save()

                    episodes_data = series_info.get('episodes', {})
                else:
                    episodes_data = {}

        # Clear existing episodes for this account to handle deletions
        Episode.objects.filter(
            series=series,
            m3u_relations__m3u_account=account
        ).delete()

        # Process all episodes in batch
        batch_process_episodes(account, series, episodes_data)

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


def batch_process_episodes(account, series, episodes_data):
    """Process episodes in batches for better performance"""
    if not episodes_data:
        return

    # Flatten episodes data
    all_episodes_data = []
    for season_num, season_episodes in episodes_data.items():
        for episode_data in season_episodes:
            episode_data['_season_number'] = int(season_num)
            all_episodes_data.append(episode_data)

    if not all_episodes_data:
        return

    logger.info(f"Batch processing {len(all_episodes_data)} episodes for series {series.name}")

    # Extract episode identifiers
    episode_keys = []
    episode_ids = []
    for episode_data in all_episodes_data:
        season_num = episode_data['_season_number']
        episode_num = episode_data.get('episode_num', 0)
        episode_keys.append((series.id, season_num, episode_num))
        episode_ids.append(str(episode_data.get('id')))

    # Pre-fetch existing episodes
    existing_episodes = {}
    for episode in Episode.objects.filter(series=series):
        key = (episode.series_id, episode.season_number, episode.episode_number)
        existing_episodes[key] = episode

    # Pre-fetch existing episode relations
    existing_relations = {
        rel.stream_id: rel for rel in M3UEpisodeRelation.objects.filter(
            m3u_account=account,
            stream_id__in=episode_ids
        ).select_related('episode')
    }

    # Prepare batch operations
    episodes_to_create = []
    episodes_to_update = []
    relations_to_create = []
    relations_to_update = []

    for episode_data in all_episodes_data:
        try:
            episode_id = str(episode_data.get('id'))
            episode_name = episode_data.get('title', 'Unknown Episode')
            season_number = episode_data['_season_number']
            episode_number = episode_data.get('episode_num', 0)
            info = episode_data.get('info', {})

            # Extract episode metadata
            description = info.get('plot') or info.get('overview', '') if info else ''
            rating = info.get('rating', '') if info else ''
            air_date = extract_date_from_data(info) if info else None
            duration_secs = info.get('duration_secs') if info else None
            tmdb_id = info.get('tmdb_id') if info else None
            imdb_id = info.get('imdb_id') if info else None

            # Prepare custom properties
            custom_props = {}
            if info:
                if info.get('crew'):
                    custom_props['crew'] = info.get('crew')
                if info.get('movie_image'):
                    custom_props['movie_image'] = info.get('movie_image')
                if info.get('backdrop_path'):
                    custom_props['backdrop_path'] = info.get('backdrop_path')

            # Find existing episode
            episode_key = (series.id, season_number, episode_number)
            episode = existing_episodes.get(episode_key)

            if episode:
                # Update existing episode
                updated = False
                if episode_name != episode.name:
                    episode.name = episode_name
                    updated = True
                if description != episode.description:
                    episode.description = description
                    updated = True
                if rating != episode.rating:
                    episode.rating = rating
                    updated = True
                if air_date != episode.air_date:
                    episode.air_date = air_date
                    updated = True
                if duration_secs != episode.duration_secs:
                    episode.duration_secs = duration_secs
                    updated = True
                if tmdb_id != episode.tmdb_id:
                    episode.tmdb_id = tmdb_id
                    updated = True
                if imdb_id != episode.imdb_id:
                    episode.imdb_id = imdb_id
                    updated = True
                if custom_props != episode.custom_properties:
                    episode.custom_properties = custom_props if custom_props else None
                    updated = True

                if updated:
                    episodes_to_update.append(episode)
            else:
                # Create new episode
                episode = Episode(
                    series=series,
                    name=episode_name,
                    description=description,
                    air_date=air_date,
                    rating=rating,
                    duration_secs=duration_secs,
                    season_number=season_number,
                    episode_number=episode_number,
                    tmdb_id=tmdb_id,
                    imdb_id=imdb_id,
                    custom_properties=custom_props if custom_props else None
                )
                episodes_to_create.append(episode)

            # Handle episode relation
            if episode_id in existing_relations:
                # Update existing relation
                relation = existing_relations[episode_id]
                relation.episode = episode
                relation.container_extension = episode_data.get('container_extension', 'mp4')
                relation.custom_properties = {
                    'info': episode_data,
                    'season_number': season_number
                }
                relations_to_update.append(relation)
            else:
                # Create new relation
                relation = M3UEpisodeRelation(
                    m3u_account=account,
                    episode=episode,
                    stream_id=episode_id,
                    container_extension=episode_data.get('container_extension', 'mp4'),
                    custom_properties={
                        'info': episode_data,
                        'season_number': season_number
                    }
                )
                relations_to_create.append(relation)

        except Exception as e:
            logger.error(f"Error preparing episode {episode_data.get('title', 'Unknown')}: {str(e)}")

    # Execute batch operations
    with transaction.atomic():
        # Create new episodes
        if episodes_to_create:
            Episode.objects.bulk_create(episodes_to_create)

        # Update existing episodes
        if episodes_to_update:
            Episode.objects.bulk_update(episodes_to_update, [
                'name', 'description', 'air_date', 'rating', 'duration_secs',
                'tmdb_id', 'imdb_id', 'custom_properties'
            ])

        # Create new episode relations
        if relations_to_create:
            M3UEpisodeRelation.objects.bulk_create(relations_to_create)

        # Update existing episode relations
        if relations_to_update:
            M3UEpisodeRelation.objects.bulk_update(relations_to_update, [
                'episode', 'container_extension', 'custom_properties'
            ])

    logger.info(f"Batch processed episodes: {len(episodes_to_create)} new, {len(episodes_to_update)} updated, "
                f"{len(relations_to_create)} new relations, {len(relations_to_update)} updated relations")


@shared_task
def batch_refresh_series_episodes(account_id, series_ids=None):
    """
    Batch refresh episodes for multiple series.
    If series_ids is None, refresh all series that haven't been refreshed recently.
    """
    try:
        account = M3UAccount.objects.get(id=account_id, is_active=True)

        if account.account_type != M3UAccount.Types.XC:
            logger.warning(f"Episode refresh called for non-XC account {account_id}")
            return "Episode refresh only available for XtreamCodes accounts"

        # Determine which series to refresh
        if series_ids:
            series_relations = M3USeriesRelation.objects.filter(
                m3u_account=account,
                series__id__in=series_ids
            ).select_related('series')
        else:
            # Refresh series that haven't been refreshed in the last 24 hours
            cutoff_time = timezone.now() - timezone.timedelta(hours=24)
            series_relations = M3USeriesRelation.objects.filter(
                m3u_account=account,
                last_episode_refresh__lt=cutoff_time
            ).select_related('series')

        logger.info(f"Batch refreshing episodes for {series_relations.count()} series")

        with XtreamCodesClient(
            account.server_url,
            account.username,
            account.password,
            account.get_user_agent().user_agent
        ) as client:

            refreshed_count = 0
            for relation in series_relations:
                try:
                    refresh_series_episodes(
                        account,
                        relation.series,
                        relation.external_series_id
                    )
                    refreshed_count += 1
                except Exception as e:
                    logger.error(f"Error refreshing episodes for series {relation.series.name}: {str(e)}")

        logger.info(f"Batch episode refresh completed for {refreshed_count} series")
        return f"Batch episode refresh completed for {refreshed_count} series"

    except Exception as e:
        logger.error(f"Error in batch episode refresh for account {account_id}: {str(e)}")
        return f"Batch episode refresh failed: {str(e)}"


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


@shared_task
def refresh_movie_advanced_data(m3u_movie_relation_id, force_refresh=False):
    """
    Fetch advanced movie data from provider and update Movie and M3UMovieRelation.
    Only fetch if last_advanced_refresh > 24h ago, unless force_refresh is True.
    """
    try:
        relation = M3UMovieRelation.objects.select_related('movie', 'm3u_account').get(id=m3u_movie_relation_id)
        now = timezone.now()
        if not force_refresh and relation.last_advanced_refresh and (now - relation.last_advanced_refresh).total_seconds() < 86400:
            return "Advanced data recently fetched, skipping."

        account = relation.m3u_account
        movie = relation.movie

        from core.xtream_codes import Client as XtreamCodesClient

        with XtreamCodesClient(
            server_url=account.server_url,
            username=account.username,
            password=account.password,
            user_agent=account.get_user_agent().user_agent
        ) as client:
            vod_info = client.get_vod_info(relation.stream_id)
            if vod_info and 'info' in vod_info:
                info_raw = vod_info.get('info', {})

                # Handle case where 'info' might be a list instead of dict
                if isinstance(info_raw, list):
                    # If it's a list, try to use the first item or create empty dict
                    info = info_raw[0] if info_raw and isinstance(info_raw[0], dict) else {}
                    logger.warning(f"VOD info for stream {relation.stream_id} returned list instead of dict, using first item")
                elif isinstance(info_raw, dict):
                    info = info_raw
                else:
                    info = {}
                    logger.warning(f"VOD info for stream {relation.stream_id} returned unexpected type: {type(info_raw)}")

                movie_data_raw = vod_info.get('movie_data', {})

                # Handle case where 'movie_data' might be a list instead of dict
                if isinstance(movie_data_raw, list):
                    movie_data = movie_data_raw[0] if movie_data_raw and isinstance(movie_data_raw[0], dict) else {}
                    logger.warning(f"VOD movie_data for stream {relation.stream_id} returned list instead of dict, using first item")
                elif isinstance(movie_data_raw, dict):
                    movie_data = movie_data_raw
                else:
                    movie_data = {}
                    logger.warning(f"VOD movie_data for stream {relation.stream_id} returned unexpected type: {type(movie_data_raw)}")

                # Update Movie fields if changed
                updated = False
                custom_props = movie.custom_properties or {}
                if info.get('plot') and info.get('plot') != movie.description:
                    movie.description = info.get('plot')
                    updated = True
                if info.get('rating') and info.get('rating') != movie.rating:
                    movie.rating = info.get('rating')
                    updated = True
                if info.get('genre') and info.get('genre') != movie.genre:
                    movie.genre = info.get('genre')
                    updated = True
                if info.get('duration_secs'):
                    duration_secs = int(info.get('duration_secs'))
                    if duration_secs != movie.duration_secs:
                        movie.duration_secs = duration_secs
                        updated = True
                # Check for releasedate or release_date
                release_date_value = info.get('releasedate') or info.get('release_date')
                if release_date_value:
                    try:
                        year = int(str(release_date_value).split('-')[0])
                        if year != movie.year:
                            movie.year = year
                            updated = True
                    except Exception:
                        pass
                if info.get('tmdb_id') and info.get('tmdb_id') != movie.tmdb_id:
                    movie.tmdb_id = info.get('tmdb_id')
                    updated = True
                if info.get('imdb_id') and info.get('imdb_id') != movie.imdb_id:
                    movie.imdb_id = info.get('imdb_id')
                    updated = True
                if info.get('trailer') and info.get('trailer') != custom_props.get('youtube_trailer'):
                    custom_props['youtube_trailer'] = info.get('trailer')
                    updated = True
                if info.get('youtube_trailer') and info.get('youtube_trailer') != custom_props.get('youtube_trailer'):
                    custom_props['youtube_trailer'] = info.get('youtube_trailer')
                    updated = True
                if info.get('backdrop_path') and info.get('backdrop_path') != custom_props.get('backdrop_path'):
                    custom_props['backdrop_path'] = info.get('backdrop_path')
                    updated = True
                if info.get('actors') and info.get('actors') != custom_props.get('actors'):
                    custom_props['actors'] = info.get('actors')
                    updated = True
                if info.get('cast') and info.get('cast') != custom_props.get('actors'):
                    custom_props['actors'] = info.get('cast')
                    updated = True
                if info.get('director') and info.get('director') != custom_props.get('director'):
                    custom_props['director'] = info.get('director')
                    updated = True
                if updated:
                    movie.custom_properties = custom_props
                    movie.save()

                # Update relation custom_properties and last_advanced_refresh
                custom_props = relation.custom_properties or {}
                custom_props['detailed_info'] = info
                custom_props['movie_data'] = movie_data
                custom_props['detailed_fetched'] = True
                relation.custom_properties = custom_props
                relation.last_advanced_refresh = now
                relation.save(update_fields=['custom_properties', 'last_advanced_refresh'])

        return "Advanced data refreshed."
    except Exception as e:
        logger.error(f"Error refreshing advanced movie data for relation {m3u_movie_relation_id}: {str(e)}")
        return f"Error: {str(e)}"


def validate_logo_reference(obj, obj_type="object"):
    """
    Validate that a logo reference exists in the database.
    If not, set it to None to prevent foreign key constraint violations.

    Args:
        obj: Object with a logo attribute
        obj_type: String description of the object type for logging

    Returns:
        bool: True if logo was valid or None, False if logo was invalid and cleared
    """
    if not hasattr(obj, 'logo') or not obj.logo:
        return True

    if not obj.logo.pk:
        # Logo doesn't have a primary key, so it's not saved
        obj.logo = None
        return False

    try:
        # Verify the logo exists in the database
        Logo.objects.get(pk=obj.logo.pk)
        return True
    except Logo.DoesNotExist:
        logger.warning(f"Logo with ID {obj.logo.pk} does not exist in database for {obj_type} '{getattr(obj, 'name', 'Unknown')}', setting to None")
        obj.logo = None
        return False
