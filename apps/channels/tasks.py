# apps/channels/tasks.py

import logging
import os
import re

from celery import shared_task
from rapidfuzz import fuzz
from sentence_transformers import SentenceTransformer, util
from django.conf import settings
from django.db import transaction

from apps.channels.models import Channel
from apps.epg.models import EPGData
from core.models import CoreSettings  # to retrieve "preferred-region" setting

logger = logging.getLogger(__name__)

# Load the model once at module level
SENTENCE_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_PATH = os.path.join(settings.MEDIA_ROOT, "models", "all-MiniLM-L6-v2")
os.makedirs(MODEL_PATH, exist_ok=True)

# Only download if not already present
if not os.path.exists(os.path.join(MODEL_PATH, "config.json")):
    logger.info(f"Local model not found in {MODEL_PATH}; downloading from {SENTENCE_MODEL_NAME}...")
    st_model = SentenceTransformer(SENTENCE_MODEL_NAME, cache_folder=MODEL_PATH)
else:
    logger.info(f"Loading local model from {MODEL_PATH}")
    st_model = SentenceTransformer(MODEL_PATH)

# Threshold constants
BEST_FUZZY_THRESHOLD = 70
LOWER_FUZZY_THRESHOLD = 40
EMBED_SIM_THRESHOLD = 0.65

# Common extraneous words
COMMON_EXTRANEOUS_WORDS = [
    "tv", "channel", "network", "television",
    "east", "west", "hd", "uhd", "us", "usa", "not", "24/7",
    "1080p", "720p", "540p", "480p",
    "arabic", "latino", "film", "movie", "movies"
]

def normalize_name(name: str) -> str:
    """
    A more aggressive normalization that:
      - Lowercases
      - Removes bracketed/parenthesized text
      - Removes punctuation
      - Strips extraneous words
      - Collapses extra spaces
    """
    if not name:
        return ""

    norm = name.lower()
    norm = re.sub(r"\[.*?\]", "", norm)
    norm = re.sub(r"\(.*?\)", "", norm)
    norm = re.sub(r"[^\w\s]", "", norm)
    tokens = norm.split()
    tokens = [t for t in tokens if t not in COMMON_EXTRANEOUS_WORDS]
    norm = " ".join(tokens).strip()
    return norm

@shared_task
def match_epg_channels():
    """
    Goes through all Channels and tries to find a matching EPGData row by:
      1) If channel.tvg_id is valid in EPGData, skip
      2) If channel has a tvg_id but not found in EPGData, attempt direct EPGData lookup
      3) Otherwise do name-based fuzzy ratio pass:
         - add region-based bonus if region code is found in the EPG row
         - if fuzzy >= BEST_FUZZY_THRESHOLD => accept
         - if fuzzy in [LOWER_FUZZY_THRESHOLD..BEST_FUZZY_THRESHOLD) => do embedding check
         - else skip
    4) Log summary
    """
    logger.info("Starting EPG matching logic...")

    try:
        region_obj = CoreSettings.objects.get(key="preferred-region")
        region_code = region_obj.value.strip().lower()  # e.g. "us"
    except CoreSettings.DoesNotExist:
        region_code = None

    all_epg = list(EPGData.objects.all())
    epg_rows = []
    for e in all_epg:
        epg_rows.append({
            "epg_id": e.id,
            "tvg_id": e.tvg_id or "",
            "raw_name": e.name,
            "norm_name": normalize_name(e.name),
        })

    epg_embeddings = None
    if any(row["norm_name"] for row in epg_rows):
        epg_embeddings = st_model.encode(
            [row["norm_name"] for row in epg_rows],
            convert_to_tensor=True
        )

    matched_channels = []

    with transaction.atomic():
        for chan in Channel.objects.all():
            # A) Skip if channel.tvg_id is valid
            if chan.tvg_id and EPGData.objects.filter(tvg_id=chan.tvg_id).exists():
                continue

            # B) If channel has a tvg_id but not in EPG, do direct lookup
            if chan.tvg_id:
                epg_match = EPGData.objects.filter(tvg_id=chan.tvg_id).first()
                if epg_match:
                    logger.info(
                        f"Channel {chan.id} '{chan.name}' => found EPG by tvg_id={chan.tvg_id}"
                    )
                    continue

            # C) Name-based matching
            fallback_name = chan.tvg_name.strip() if chan.tvg_name else chan.name
            norm_chan = normalize_name(fallback_name)
            if not norm_chan:
                logger.info(
                    f"Channel {chan.id} '{chan.name}' => empty after normalization, skipping"
                )
                continue

            best_score = 0
            best_epg = None
            for row in epg_rows:
                if not row["norm_name"]:
                    continue
                base_score = fuzz.ratio(norm_chan, row["norm_name"])
                bonus = 0
                if region_code:
                    combined_text = row["tvg_id"].lower() + " " + row["raw_name"].lower()
                    if region_code in combined_text:
                        bonus = 15
                score = base_score + bonus
                if score > best_score:
                    best_score = score
                    best_epg = row

            if not best_epg:
                logger.info(f"Channel {chan.id} '{fallback_name}' => no EPG match at all.")
                continue

            if best_score >= BEST_FUZZY_THRESHOLD:
                chan.tvg_id = best_epg["tvg_id"]
                chan.save()
                matched_channels.append((chan.id, fallback_name, best_epg["tvg_id"]))
                logger.info(
                    f"Channel {chan.id} '{fallback_name}' => matched tvg_id={best_epg['tvg_id']} (score={best_score})"
                )
            elif best_score >= LOWER_FUZZY_THRESHOLD and epg_embeddings is not None:
                chan_embedding = st_model.encode(norm_chan, convert_to_tensor=True)
                sim_scores = util.cos_sim(chan_embedding, epg_embeddings)[0]
                top_index = int(sim_scores.argmax())
                top_value = float(sim_scores[top_index])
                if top_value >= EMBED_SIM_THRESHOLD:
                    matched_epg = epg_rows[top_index]
                    chan.tvg_id = matched_epg["tvg_id"]
                    chan.save()
                    matched_channels.append((chan.id, fallback_name, matched_epg["tvg_id"]))
                    logger.info(
                        f"Channel {chan.id} '{fallback_name}' => matched EPG tvg_id={matched_epg['tvg_id']} "
                        f"(fuzzy={best_score}, cos-sim={top_value:.2f})"
                    )
                else:
                    logger.info(
                        f"Channel {chan.id} '{fallback_name}' => fuzzy={best_score}, "
                        f"cos-sim={top_value:.2f} < {EMBED_SIM_THRESHOLD}, skipping"
                    )
            else:
                logger.info(
                    f"Channel {chan.id} '{fallback_name}' => fuzzy={best_score} < {LOWER_FUZZY_THRESHOLD}, skipping"
                )

    total_matched = len(matched_channels)
    if total_matched:
        logger.info(f"Match Summary: {total_matched} channel(s) matched.")
        for (cid, cname, tvg) in matched_channels:
            logger.info(f"  - Channel ID={cid}, Name='{cname}' => tvg_id='{tvg}'")
    else:
        logger.info("No new channels were matched.")

    logger.info("Finished EPG matching logic.")
    return f"Done. Matched {total_matched} channel(s)."
