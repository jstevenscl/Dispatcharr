from django.apps import AppConfig
from django.conf import settings
import os, logging

logger = logging.getLogger(__name__)
st_model = None

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        global st_model
        from sentence_transformers import SentenceTransformer

        # Load the sentence-transformers model once at the module level
        SENTENCE_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
        MODEL_PATH = os.path.join(settings.MEDIA_ROOT, "models", "all-MiniLM-L6-v2")
        os.makedirs(MODEL_PATH, exist_ok=True)

        # If not present locally, download:
        if not os.path.exists(os.path.join(MODEL_PATH, "config.json")):
            logger.info(f"Local model not found in {MODEL_PATH}; downloading from {SENTENCE_MODEL_NAME}...")
            st_model = SentenceTransformer(SENTENCE_MODEL_NAME, cache_folder=MODEL_PATH)
        else:
            logger.info(f"Loading local model from {MODEL_PATH}")
            st_model = SentenceTransformer(MODEL_PATH)
