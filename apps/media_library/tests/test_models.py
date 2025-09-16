from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.media_library.models import Library, MediaItem, WatchProgress, normalize_title


class NormalizeTitleTests(TestCase):
    def test_normalize_title_strips_noise(self):
        value = normalize_title("The.Matrix (1999) [4K]")
        self.assertEqual(value, "the matrix")


class WatchProgressTests(TestCase):
    def setUp(self):
        self.library = Library.objects.create(name="Test Library")
        self.media_item = MediaItem.objects.create(
            library=self.library,
            item_type=MediaItem.TYPE_MOVIE,
            title="Example",
            sort_title="Example",
            normalized_title="example",
        )
        self.user = get_user_model().objects.create_user(
            username="tester", email="tester@example.com", password="pass1234"
        )

    def test_update_progress_marks_completed_when_threshold_met(self):
        progress = WatchProgress.objects.create(user=self.user, media_item=self.media_item)
        progress.update_progress(position_ms=9500, duration_ms=10000)
        self.assertTrue(progress.completed)
        self.assertEqual(progress.position_ms, 10000)

    def test_update_progress_handles_partial_progress(self):
        progress = WatchProgress.objects.create(user=self.user, media_item=self.media_item)
        progress.update_progress(position_ms=4000, duration_ms=10000)
        self.assertFalse(progress.completed)
        self.assertEqual(progress.position_ms, 4000)
        self.assertEqual(progress.duration_ms, 10000)
