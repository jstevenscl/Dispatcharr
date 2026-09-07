"""cleanup_orphaned_vod_content must not mass-delete movie/series relations
(and, via CASCADE, every episode under a deleted series) from a single
incomplete refresh pass.

Real-world trigger: refresh_vod_content calls client.get_series()/an
equivalent single API call once per refresh cycle. A transient truncated or
incomplete response (a slow provider, a network hiccup, momentary contention
on the provider's own DB) looks identical to "this content was really
removed" -- there is no status code or header that tells the two apart, the
same class of ambiguity as batch_process_episodes' own stale-relation delete.
Before this guard, a relation missing from just one pass was deleted
immediately (stale_days=0 at the only real call site), cascading to delete
every episode under a series and then the orphaned Series/Movie row itself.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.m3u.models import M3UAccount
from apps.vod.models import M3UMovieRelation, M3USeriesRelation, Movie, Series
from apps.vod.tasks import cleanup_orphaned_vod_content


class CleanupOrphanedVodContentGuardTests(TestCase):
    def setUp(self):
        CleanupOrphanedVodContentGuardTests._series_counter = 0
        CleanupOrphanedVodContentGuardTests._movie_counter = 0
        self.account = M3UAccount.objects.create(
            name='XC Cleanup Guard',
            server_url='http://example.com',
            username='user',
            password='pass',
            account_type=M3UAccount.Types.XC,
            is_active=True,
            custom_properties={'enable_vod': True},
        )

    # Series/Movie both have a (name, year) uniqueness constraint when there's
    # no external id tying the row to a specific catalog entry -- an
    # incrementing counter keeps names unique across multiple _seed_* calls
    # within the same test (e.g. a "fresh" batch and a "stale" batch).
    _series_counter = 0
    _movie_counter = 0

    def _seed_series(self, count, last_seen):
        for _ in range(count):
            CleanupOrphanedVodContentGuardTests._series_counter += 1
            i = CleanupOrphanedVodContentGuardTests._series_counter
            series = Series.objects.create(name=f'Series {i}', year=2000)
            M3USeriesRelation.objects.create(
                m3u_account=self.account,
                series=series,
                external_series_id=str(1000 + i),
                last_seen=last_seen,
            )

    def _seed_movies(self, count, last_seen):
        for _ in range(count):
            CleanupOrphanedVodContentGuardTests._movie_counter += 1
            i = CleanupOrphanedVodContentGuardTests._movie_counter
            movie = Movie.objects.create(name=f'Movie {i}', year=2000)
            M3UMovieRelation.objects.create(
                m3u_account=self.account,
                movie=movie,
                stream_id=str(2000 + i),
                last_seen=last_seen,
            )

    def test_majority_of_series_missing_in_one_pass_is_not_deleted(self):
        # 20 series on file, only 5 "seen" in this pass (75% would be
        # removed) -- looks like a truncated get_series() response, not a
        # real mass removal.
        now = timezone.now()
        self._seed_series(5, last_seen=now)
        self._seed_series(15, last_seen=now - timedelta(days=5))

        cleanup_orphaned_vod_content(stale_days=0, scan_start_time=now, account_id=self.account.id)

        self.assertEqual(M3USeriesRelation.objects.filter(m3u_account=self.account).count(), 20)
        self.assertEqual(Series.objects.count(), 20)

    def test_small_legitimate_series_removal_still_applies(self):
        # 20 series on file, 2 genuinely gone (10%) -- well under the
        # guard's threshold, a normal "provider removed a couple shows" case.
        now = timezone.now()
        self._seed_series(18, last_seen=now)
        self._seed_series(2, last_seen=now - timedelta(days=5))

        cleanup_orphaned_vod_content(stale_days=0, scan_start_time=now, account_id=self.account.id)

        self.assertEqual(M3USeriesRelation.objects.filter(m3u_account=self.account).count(), 18)
        self.assertEqual(Series.objects.count(), 18)

    def test_guard_does_not_block_cleanup_on_small_account(self):
        # Below CLEANUP_STALE_DELETE_MIN_EXISTING -- even a full removal is a
        # small absolute count, so the guard must not block it indefinitely.
        now = timezone.now()
        self._seed_series(3, last_seen=now - timedelta(days=5))

        cleanup_orphaned_vod_content(stale_days=0, scan_start_time=now, account_id=self.account.id)

        self.assertEqual(M3USeriesRelation.objects.filter(m3u_account=self.account).count(), 0)
        self.assertEqual(Series.objects.count(), 0)

    def test_majority_of_movies_missing_in_one_pass_is_not_deleted(self):
        now = timezone.now()
        self._seed_movies(5, last_seen=now)
        self._seed_movies(15, last_seen=now - timedelta(days=5))

        cleanup_orphaned_vod_content(stale_days=0, scan_start_time=now, account_id=self.account.id)

        self.assertEqual(M3UMovieRelation.objects.filter(m3u_account=self.account).count(), 20)
        self.assertEqual(Movie.objects.count(), 20)

    def test_default_grace_period_survives_a_single_missed_pass(self):
        # The real call site (refresh_vod_content) now passes stale_days=2 --
        # a series not seen "since scan_start_time" but seen within the last
        # 2 days must survive, giving a transient miss a chance to reconcile
        # on the next refresh instead of being deleted on first absence.
        now = timezone.now()
        self._seed_series(18, last_seen=now)
        self._seed_series(2, last_seen=now - timedelta(hours=12))  # missed this pass, but recent

        cleanup_orphaned_vod_content(stale_days=2, scan_start_time=now, account_id=self.account.id)

        self.assertEqual(M3USeriesRelation.objects.filter(m3u_account=self.account).count(), 20)
        self.assertEqual(Series.objects.count(), 20)
