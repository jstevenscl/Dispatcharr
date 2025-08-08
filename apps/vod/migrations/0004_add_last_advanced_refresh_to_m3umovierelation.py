from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('vod', '0003_rename_release_date_episode_air_date'),
    ]

    operations = [
        migrations.AddField(
            model_name='m3umovierelation',
            name='last_advanced_refresh',
            field=models.DateTimeField(blank=True, null=True, help_text="Last time advanced data was fetched from provider"),
        ),
    ]
