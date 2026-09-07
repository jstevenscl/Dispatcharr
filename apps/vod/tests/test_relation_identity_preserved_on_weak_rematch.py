"""process_movie_batch / process_series_batch must not swap the Movie/Series
behind an already-tracked relation when a later pass's name+year-only match
lands on a different (usually brand-new) row.

Real-world trigger: EDM's own XC feed never sends a tmdb_id/imdb_id at all
(see server.py's get_series/get_series_info and get_vod_streams), so every
match against it is name+year only -- and Django's lookup_by_name_year
helper explicitly excludes rows that have since acquired a tmdb_id/imdb_id
(by design, so a provider that DOES supply ids never gets overridden by a
coincidental name+year guess). Combined, a series/movie that legitimately
gets a tmdb_id from any source, or whose reported year merely changes or
goes blank for one pass, becomes permanently invisible to future name+year
matching from that same provider -- the next batch "can't find" it, creates
a brand-new empty row, and re-targets the existing relation onto it,
orphaning the real row (and, for series, cascading via FK to delete every
episode under it). Confirmed live: "2 Broke Girls" lost all 137 episodes
this way after being correctly repopulated once already.
"""
from django.test import TestCase

from apps.m3u.models import M3UAccount
from apps.vod.models import M3UMovieRelation, M3USeriesRelation, M3UVODCategoryRelation, Movie, Series, VODCategory
from apps.vod.tasks import process_movie_batch, process_series_batch


class RelationIdentityPreservedOnWeakRematchTests(TestCase):
    def setUp(self):
        self.account = M3UAccount.objects.create(
            name='XC Weak Rematch Guard',
            server_url='http://example.com',
            username='user',
            password='pass',
            account_type=M3UAccount.Types.XC,
            is_active=True,
            custom_properties={'enable_vod': True},
        )

    def test_movie_relation_keeps_its_movie_when_rematch_has_no_strong_id(self):
        movie_category = VODCategory.objects.create(name='Uncategorized', category_type='movie')
        movie_relation = M3UVODCategoryRelation.objects.create(
            category=movie_category, m3u_account=self.account, enabled=True,
        )
        categories = {'__uncategorized__': movie_category}
        relations = {movie_category.id: movie_relation}

        # First pass: no tmdb_id at all (matches EDM's real feed shape),
        # year=2011 -- creates the movie and its relation via name+year.
        process_movie_batch(
            self.account,
            [{'stream_id': '100', 'name': '2 Broke Girls', 'year': 2011, 'category_id': None}],
            categories, relations, scan_start_time=None,
        )
        original = Movie.objects.get(name='2 Broke Girls')
        self.assertIsNone(original.tmdb_id)

        # Something (a manual match, an enrichment pass, anything) gives the
        # movie a tmdb_id -- from this point, lookup_by_name_year can never
        # find it again for a provider that never sends one.
        original.tmdb_id = 12345
        original.save(update_fields=['tmdb_id'])

        # Second pass: same stream_id, same title, but the provider's year
        # went blank this time (the exact transient EDM was seen doing) --
        # still no tmdb_id. A naive name+year rematch finds nothing (the
        # enriched row is excluded) and would create + link a new movie.
        process_movie_batch(
            self.account,
            [{'stream_id': '100', 'name': '2 Broke Girls', 'year': None, 'category_id': None}],
            categories, relations, scan_start_time=None,
        )

        relation = M3UMovieRelation.objects.get(m3u_account=self.account, stream_id='100')
        self.assertEqual(
            relation.movie_id, original.id,
            'the relation must stay linked to the already-established, tmdb-tagged movie',
        )
        self.assertTrue(Movie.objects.filter(id=original.id).exists(), 'the original movie must not be orphaned')

    def test_series_relation_keeps_its_series_when_rematch_has_no_strong_id(self):
        series_category = VODCategory.objects.create(name='Uncategorized', category_type='series')
        series_relation_link = M3UVODCategoryRelation.objects.create(
            category=series_category, m3u_account=self.account, enabled=True,
        )
        categories = {'__uncategorized__': series_category}
        relations = {series_category.id: series_relation_link}

        # Series year comes from releaseDate (parsed as a date string), not a
        # bare 'year' field -- matches process_series_batch's own parsing.
        process_series_batch(
            self.account,
            [{'series_id': '910072485', 'name': '2 Broke Girls', 'releaseDate': '2011-09-19', 'category_id': None}],
            categories, relations, scan_start_time=None,
        )
        original = Series.objects.get(name='2 Broke Girls')
        self.assertIsNone(original.tmdb_id)

        original.tmdb_id = 39340
        original.save(update_fields=['tmdb_id'])

        process_series_batch(
            self.account,
            [{'series_id': '910072485', 'name': '2 Broke Girls', 'releaseDate': '', 'category_id': None}],
            categories, relations, scan_start_time=None,
        )

        relation = M3USeriesRelation.objects.get(m3u_account=self.account, external_series_id='910072485')
        self.assertEqual(
            relation.series_id, original.id,
            'the relation must stay linked to the already-established, tmdb-tagged series -- '
            'losing this linkage is exactly what cascaded to delete every episode for "2 Broke Girls"',
        )
        self.assertTrue(Series.objects.filter(id=original.id).exists(), 'the original series must not be orphaned')
