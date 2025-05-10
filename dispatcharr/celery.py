# dispatcharr/celery.py
import os
from celery import Celery
import logging

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'dispatcharr.settings')
app = Celery("dispatcharr")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Configure Celery logging
app.conf.update(
    worker_log_level='DEBUG',
    worker_log_format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    beat_log_level='DEBUG',
    worker_hijack_root_logger=False,
    worker_task_log_format='%(asctime)s %(levelname)s %(task_name)s: %(message)s',
)

# Set only specific log messages to DEBUG level
# This maintains user configurability for all other loggers
@app.on_after_configure.connect
def setup_celery_logging(**kwargs):
    # Only set specific loggers to DEBUG that handle the routine messages
    # we want to suppress from INFO level
    logging.getLogger('celery.beat').getChild('Scheduler').setLevel(logging.DEBUG)
    logging.getLogger('celery.worker.strategy').setLevel(logging.DEBUG)
    logging.getLogger('celery.app.trace').setLevel(logging.DEBUG)
