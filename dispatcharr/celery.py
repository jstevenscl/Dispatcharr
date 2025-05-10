# dispatcharr/celery.py
import os
from celery import Celery
import logging
from django.conf import settings  # Import Django settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dispatcharr.settings')
app = Celery("dispatcharr")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Configure Celery logging
app.conf.update(
    worker_log_level=settings.LOG_LEVEL_NAME,  # Use same log level from environment
    worker_log_format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    beat_log_level=settings.LOG_LEVEL_NAME,  # Use same log level from environment
    worker_hijack_root_logger=False,
    worker_task_log_format='%(asctime)s %(levelname)s %(task_name)s: %(message)s',
)

@app.on_after_configure.connect
def setup_celery_logging(**kwargs):
    # Check if user has set logging to INFO level
    if settings.LOG_LEVEL_NAME.upper() == 'INFO':
        # Get the specific loggers that output the noisy INFO messages
        for logger_name in ['celery.app.trace', 'celery.beat', 'celery.worker.strategy', 'celery.beat.Scheduler']:
            # Create a custom filter to suppress specific messages
            logger = logging.getLogger(logger_name)

            # Add a custom filter to completely filter out the repetitive messages
            class SuppressFilter(logging.Filter):
                def filter(self, record):
                    # Return False to completely suppress these specific patterns when at INFO level
                    if (
                        "succeeded in" in getattr(record, 'msg', '') or
                        "Scheduler: Sending due task" in getattr(record, 'msg', '') or
                        "received" in getattr(record, 'msg', '')
                    ):
                        return False  # Don't log these messages at all
                    return True  # Log all other messages

            # Add the filter to each logger
            logger.addFilter(SuppressFilter())
