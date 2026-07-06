import json
import requests
import time
import os
import sys

ENDPOINT = "http://127.0.0.1:2333"
TRANSLATOR_ID = ""
TIMEOUT = 45
DELAY = 0.1
INPUT_FILE = "processed.json"
OUTPUT_FILE = "translated.json"

def translate_text(text):
    url = f"{ENDPOINT}/api/translate"
    params = {"text": text}
    if TRANSLATOR_ID:
        params["id"] = TRANSLATOR_ID
    try:
        resp = requests.get(url, params=params, timeout=TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if data.get("error"):
            print(f"    API error: {data['error']}")
            return None
        return data.get("result")
    except requests.exceptions.Timeout:
        print("    Request timeout")
        return None
    except requests.exceptions.RequestException as e:
        print(f"    Network error: {e}")
        return None
    except json.JSONDecodeError:
        print("    Invalid JSON response")
        return None

def load_json_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json_file(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Input file {INPUT_FILE} not found.")
        sys.exit(1)

    print(f"Loading input: {INPUT_FILE}")
    data = load_json_file(INPUT_FILE)
    total = len(data)
    print(f"Total entries: {total}")

    if os.path.exists(OUTPUT_FILE):
        print(f"Found existing output {OUTPUT_FILE}, loading translations...")
        existing = load_json_file(OUTPUT_FILE)
        for key, value in existing.items():
            if value and value.strip():
                data[key] = value
        print(f"Loaded {len(existing)} existing translations")
    else:
        print("No existing output, starting fresh")

    count = 0
    skip_count = 0
    for idx, (key, value) in enumerate(data.items(), 1):
        if value and value.strip():
            skip_count += 1
            print(f"[{idx}/{total}] Skipping already translated: {key[:60]}...")
            continue

        print(f"[{idx}/{total}] Translating: {key[:80]}...")
        translation = translate_text(key)

        if translation is not None:
            data[key] = translation
            count += 1
            print(f"   Translation successful: {translation[:80]}...")
        else:
            data[key] = ""
            print("   Translation failed, keeping empty")

        if idx % 100 == 0:
            print(f"Progress saved at {idx} entries")
            save_json_file(OUTPUT_FILE, data)

        time.sleep(DELAY)

    save_json_file(OUTPUT_FILE, data)

    print("Completed.")
    print(f"New translations: {count}")
    print(f"Skipped (already translated): {skip_count}")
    print(f"Failed: {total - count - skip_count}")

if __name__ == "__main__":
    main()