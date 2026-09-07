"""process_movie_batch / process_series_batch must re-target an existing
relation when a provider reissues a movie/series' external id, instead of
inserting a second relation for the same (movie, account) or (series,
account) pair.

Real-world trigger: EDM's own XC feed assigns a movie/series' exported
stream_id/series_id PER CATEGORY PLACEMENT (an ever-incrementing sequence).
Any edit to a movie/series' placement on EDM's side (a category rename, a
merge, a List Sync re-evaluation) reissues a brand-new id for the exact same
underlying content. Before this fix, a stream_id-only/external_series_id-only
lookup couldn't recognize the reissued relation as "the same one", tried to
insert a second relation for the same (movie, account) pair, and hit the
database's own uniqueness constraint (vod_m3umovierelation_movie_account_uniq
/ vod_m3useriesrelation_series_account_uniq) -- an IntegrityError that
aborted the WHOLE batch's transaction.atomic() block, silently preventing
last_seen from being refreshed for every OTHER legitimate movie/series in
that same batch of up to 1000 -- which is what fed
cleanup_orphaned_vod_content's stale-relation sweep with content that never
actually left the catalog.
"""
from django.test import TestCase

from apps.m3u.models import M3UAccount
from apps.vod.models import (
    M3UMovieRelation, M3USeriesRelation, M3UVODCategoryRelation, Movie, Series, VODCategory,
)
from apps.vod.tasks import process_movie_batch, process_series_batch


def _movie_data(stream_id, name, tmdb_id):
    return {
        'stream_id': stream_id,
        'name': name,
        'tmdb_id': tmdb_id,
        'category_id': None,
    }


def _series_data(series_id, name, tmdb_id):
    return {
        'series_id': series_id,
        'name': name,
        'tmdb_id': tmdb_id,
        'category_id': None,
    }


class ReissuedStreamIdRelationRetargetTests(TestCase):
    def setUp(self):
        self.account = M3UAccount.objects.create(
            name='XC Reissue Guard',
            server_url='http://example.com',
            username='user',
            password='pass',
            account_type=M3UAccount.Types.XC,
            is_active=True,
            custom_properties={'enable_vod': True},
        )

    def _movie_categories_and_relations(self):
        category = VODCategory.objects.create(name='Uncategorized', category_type='movie')
        relation = M3UVODCategoryRelation.objects.create(
            category=category, m3u_account=self.account, enabled=True,
        )
        return {'__uncategorized__': category}, {category.id: relation}

    def _series_categories_and_relations(self):
        category = VODCategory.objects.create(name='Uncategorized', category_type='series')
        relation = M3UVODCategoryRelation.objects.create(
            category=category, m3u_account=self.account, enabled=True,
        )
        return {'__uncategorized__': category}, {category.id: relation}

    def test_reissued_movie_stream_id_retargets_instead_of_duplicating(self):
        categories, relations = self._movie_categories_and_relations()

        # First pass: 20 movies, including our tracked one at stream_id '100'.
        batch1 = [_movie_data(str(100 + i), f'Movie {i}', 9000 + i) for i in range(20)]
        process_movie_batch(self.account, batch1, categories, relations, scan_start_time=None)

        self.assertEqual(Movie.objects.count(), 20)
        self.assertEqual(M3UMovieRelation.objects.filter(m3u_account=self.account).count(), 20)
        original_relation = M3UMovieRelation.objects.get(m3u_account=self.account, stream_id='100')

        # Second pass: same 20 movies (same tmdb_ids), but our tracked movie's
        # stream_id changed from '100' to '999' -- a placement-driven reissue.
        # This must not raise, must not create a duplicate relation, and must
        # not block the other 19 movies from getting last_seen refreshed.
        from django.utils import timezone
        t2 = timezone.now()
        batch2 = [_movie_data('999', 'Movie 0', 9000)] + [
            _movie_data(str(100 + i), f'Movie {i}', 9000 + i) for i in range(1, 20)
        ]
        process_movie_batch(self.account, batch2, categories, relations, scan_start_time=t2)

        self.assertEqual(
            Movie.objects.count(), 20,
            'no duplicate Movie row should be created for the reissued stream_id',
        )
        self.assertEqual(
            M3UMovieRelation.objects.filter(m3u_account=self.account).count(), 20,
            'the reissue must re-target the existing relation, not add a 21st',
        )
        retargeted = M3UMovieRelation.objects.get(m3u_account=self.account, movie_id=original_relation.movie_id)
        self.assertEqual(retargeted.id, original_relation.id, 'same relation row, just repointed')
        self.assertEqual(retargeted.stream_id, '999')
        self.assertEqual(retargeted.last_seen, t2)

        # The other 19 movies in the SAME batch as the reissue must still have
        # been refreshed -- proving the reissue didn't abort the whole batch.
        others = M3UMovieRelation.objects.filter(m3u_account=self.account).exclude(id=original_relation.id)
        self.assertEqual(others.count(), 19)
        for rel in others:
            self.assertEqual(rel.last_seen, t2)

    def test_reissued_series_external_id_retargets_instead_of_duplicating(self):
        categories, relations = self._series_categories_and_relations()

        batch1 = [_series_data(str(100 + i), f'Series {i}', 9000 + i) for i in range(20)]
        process_series_batch(self.account, batch1, categories, relations, scan_start_time=None)

        self.assertEqual(Series.objects.count(), 20)
        self.assertEqual(M3USeriesRelation.objects.filter(m3u_account=self.account).count(), 20)
        original_relation = M3USeriesRelation.objects.get(m3u_account=self.account, external_series_id='100')

        from django.utils import timezone
        t2 = timezone.now()
        batch2 = [_series_data('999', 'Series 0', 9000)] + [
            _series_data(str(100 + i), f'Series {i}', 9000 + i) for i in range(1, 20)
        ]
        process_series_batch(self.account, batch2, categories, relations, scan_start_time=t2)

        self.assertEqual(Series.objects.count(), 20)
        self.assertEqual(
            M3USeriesRelation.objects.filter(m3u_account=self.account).count(), 20,
            'the reissue must re-target the existing relation, not add a 21st',
        )
        retargeted = M3USeriesRelation.objects.get(m3u_account=self.account, series_id=original_relation.series_id)
        self.assertEqual(retargeted.id, original_relation.id)
        self.assertEqual(retargeted.external_series_id, '999')
        self.assertEqual(retargeted.last_seen, t2)

        others = M3USeriesRelation.objects.filter(m3u_account=self.account).exclude(id=original_relation.id)
        self.assertEqual(others.count(), 19)
        for rel in others:
            self.assertEqual(rel.last_seen, t2)
