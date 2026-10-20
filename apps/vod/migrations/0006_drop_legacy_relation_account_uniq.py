from django.db import migrations


# vod_m3umovierelation_movie_account_uniq and
# vod_m3useriesrelation_series_account_uniq predate this fork's move to
# one relation per (account, stream_id/external_series_id) -- the model's
# own Meta.unique_together has declared the new shape since 0001_initial,
# but on a DB that had already been migrated under the old shape before
# that squash landed, Django's migration state considered the new shape
# already satisfied and never emitted the ALTER to actually drop the old
# constraint. Left in place, it hard-limits a movie/series to exactly ONE
# M3U relation per account -- so a provider that lists the same title under
# several categories (each a distinct stream_id/external_series_id) can
# only ever keep one of them; every other category's import silently drops
# its relation (apps/vod/tasks.py's bulk_create(..., ignore_conflicts=True)
# swallows the resulting IntegrityError without surfacing it).
#
# IF EXISTS makes this a no-op on any DB where the constraint was already
# dropped or never existed (e.g. a fresh install under the squashed
# 0001_initial that happened to apply for real). Not meaningfully
# reversible -- a DB that's accumulated more than one relation per
# (movie, account) since this ran can't have the old constraint restored
# without first deleting data, so the reverse is a no-op.

_FORWARD_SQL = """
ALTER TABLE vod_m3umovierelation
    DROP CONSTRAINT IF EXISTS vod_m3umovierelation_movie_account_uniq;
ALTER TABLE vod_m3useriesrelation
    DROP CONSTRAINT IF EXISTS vod_m3useriesrelation_series_account_uniq;
"""

_REVERSE_SQL = """
-- Intentional no-op: see migration module docstring/comment.
SELECT 1;
"""


class Migration(migrations.Migration):

    dependencies = [
        ('vod', '0005_movie_is_adult'),
    ]

    operations = [
        migrations.RunSQL(_FORWARD_SQL, reverse_sql=_REVERSE_SQL),
    ]
