from django.apps import AppConfig
from django.conf import settings
import os, logging

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
