# ml_model.py

import sys
import json
import re
import os
import sys
from rapidfuzz import fuzz
from sentence_transformers import util
from sentence_transformers import SentenceTransformer as st

# Load the sentence-transformers model once at the module level
SENTENCE_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_PATH = os.path.join("/app/media", "models", "all-MiniLM-L6-v2")

# Thresholds
BEST_FUZZY_THRESHOLD = 85
LOWER_FUZZY_THRESHOLD = 40
EMBED_SIM_THRESHOLD = 0.65

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def process_data(input_data):
    os.makedirs(MODEL_PATH, exist_ok=True)

    # If not present locally, download:
    if not os.path.exists(os.path.join(MODEL_PATH, "config.json")):
        eprint(f"Local model not found in {MODEL_PATH}; downloading from {SENTENCE_MODEL_NAME}...")
        st_model = st(SENTENCE_MODEL_NAME, cache_folder=MODEL_PATH)
    else:
        eprint(f"Loading local model from {MODEL_PATH}")
        st_model = st(MODEL_PATH)

    channels = input_data["channels"]
    epg_data = input_data["epg_data"]
    region_code = input_data["region_code"]

    epg_embeddings = None
    if any(row["norm_name"] for row in epg_data):
        epg_embeddings = st_model.encode(
            [row["norm_name"] for row in epg_data],
            convert_to_tensor=True
        )

    channels_to_update = []
    matched_channels = []

    for chan in channels:
        # If channel has a tvg_id that doesn't exist in EPGData, do direct check.
        # I don't THINK this should happen now that we assign EPG on channel creation.
        if chan["tvg_id"]:
            epg_match = [epg["id"] for epg in epg_data if epg["tvg_id"] == chan["tvg_id"]]
            if epg_match:
                chan["epg_data_id"] = epg_match[0]["id"]
                eprint(f"Channel {chan['id']} '{chan['name']}' => EPG found by tvg_id={chan['tvg_id']}")
                channels_to_update.append(chan)
                continue

        # C) Perform name-based fuzzy matching
        fallback_name = chan["tvg_id"].strip() if chan["tvg_id"] else chan["name"]
        if not chan["norm_chan"]:
            eprint(f"Channel {chan['id']} '{chan['name']}' => empty after normalization, skipping")
            continue

        best_score = 0
        best_epg = None
        for row in epg_data:
            if not row["norm_name"]:
                continue

            base_score = fuzz.ratio(chan["norm_chan"], row["norm_name"])
            bonus = 0
            # Region-based bonus/penalty
            combined_text = row["tvg_id"].lower() + " " + row["name"].lower()
            dot_regions = re.findall(r'\.([a-z]{2})', combined_text)
            if region_code:
                if dot_regions:
                    if region_code in dot_regions:
                        bonus = 30  # bigger bonus if .us or .ca matches
                    else:
                        bonus = -15
                elif region_code in combined_text:
                    bonus = 15
            score = base_score + bonus

            eprint(
                f"Channel {chan['id']} '{fallback_name}' => EPG row {row['id']}: "
                f"name='{row['name']}', norm_name='{row['norm_name']}', "
                f"combined_text='{combined_text}', dot_regions={dot_regions}, "
                f"base_score={base_score}, bonus={bonus}, total_score={score}"
            )

            if score > best_score:
                best_score = score
                best_epg = row

        # If no best match was found, skip
        if not best_epg:
            eprint(f"Channel {chan['id']} '{fallback_name}' => no EPG match at all.")
            continue

        # If best_score is above BEST_FUZZY_THRESHOLD => direct accept
        if best_score >= BEST_FUZZY_THRESHOLD:
            chan["epg_data_id"] = best_epg["id"]
            channels_to_update.append(chan)

            matched_channels.append((chan['id'], fallback_name, best_epg["tvg_id"]))
            eprint(
                f"Channel {chan['id']} '{fallback_name}' => matched tvg_id={best_epg['tvg_id']} "
                f"(score={best_score})"
            )

        # If best_score is in the “middle range,” do embedding check
        elif best_score >= LOWER_FUZZY_THRESHOLD and epg_embeddings is not None:
            chan_embedding = st_model.encode(chan["norm_chan"], convert_to_tensor=True)
            sim_scores = util.cos_sim(chan_embedding, epg_embeddings)[0]
            top_index = int(sim_scores.argmax())
            top_value = float(sim_scores[top_index])
            if top_value >= EMBED_SIM_THRESHOLD:
                matched_epg = epg_data[top_index]
                chan["epg_data_id"] = matched_epg["id"]
                channels_to_update.append(chan)

                matched_channels.append((chan['id'], fallback_name, matched_epg["tvg_id"]))
                eprint(
                    f"Channel {chan['id']} '{fallback_name}' => matched EPG tvg_id={matched_epg['tvg_id']} "
                    f"(fuzzy={best_score}, cos-sim={top_value:.2f})"
                )
            else:
                eprint(
                    f"Channel {chan['id']} '{fallback_name}' => fuzzy={best_score}, "
                    f"cos-sim={top_value:.2f} < {EMBED_SIM_THRESHOLD}, skipping"
                )
        else:
            eprint(
                f"Channel {chan['id']} '{fallback_name}' => fuzzy={best_score} < "
                f"{LOWER_FUZZY_THRESHOLD}, skipping"
            )

    return {
        "channels_to_update": channels_to_update,
        "matched_channels": matched_channels,
    }

def main():
    # Read input data from a file
    input_file_path = sys.argv[1]
    with open(input_file_path, 'r') as f:
        input_data = json.load(f)

    # Process data with the ML model (or your logic)
    result = process_data(input_data)

    # Output result to stdout
    print(json.dumps(result))

if __name__ == "__main__":
    main()
