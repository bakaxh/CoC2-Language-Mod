import json
import requests
import time
import os
import sys

# ----------------------------------------------------------------------
# 配置
# ----------------------------------------------------------------------
ENDPOINT = "http://127.0.0.1:2333"
TRANSLATOR_ID = ""          # 若 API 需要，可填写
TIMEOUT = 45
DELAY = 0.05            # 每次请求之间的间隔（秒）

# ----------------------------------------------------------------------
# 翻译 API
# ----------------------------------------------------------------------
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

# ----------------------------------------------------------------------
# 文件读写
# ----------------------------------------------------------------------
def load_json_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json_file(filepath, data):
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ----------------------------------------------------------------------
# 处理单个文件
# ----------------------------------------------------------------------
def process_file(input_path, output_path):
    if not os.path.exists(input_path):
        print(f"Input file not found: {input_path}, skipping.")
        return

    print(f"\n{'='*60}")
    print(f"Processing: {input_path}")
    print(f"Output to: {output_path}")

    data = load_json_file(input_path)
    total = len(data)
    print(f"Total entries: {total}")

    # 断点续传：如果输出文件已存在，加载已有翻译
    if os.path.exists(output_path):
        print("Loading existing translations...")
        existing = load_json_file(output_path)
        for key, value in existing.items():
            if value and value.strip():
                data[key] = value
        print(f"Restored {len(existing)} existing translations")
    else:
        print("Starting fresh.")

    new_count = 0
    skip_count = 0

    for idx, (key, value) in enumerate(data.items(), 1):
        # 如果已有非空翻译，跳过
        if value and value.strip():
            skip_count += 1
            print(f"[{idx}/{total}] Skipping (already translated): {key[:60]}...")
            continue

        print(f"[{idx}/{total}] Translating: {key[:80]}...")
        translation = translate_text(key)

        if translation is not None:
            data[key] = translation
            new_count += 1
            print(f"   → {translation[:80]}...")
        else:
            data[key] = ""
            print("   Translation failed, keeping empty.")

        # 每 100 条自动保存
        if idx % 100 == 0:
            save_json_file(output_path, data)
            print(f"Progress saved ({idx} entries).")

        time.sleep(DELAY)

    # 最终保存
    save_json_file(output_path, data)

    print(f"\nFile completed: {input_path}")
    print(f"  New translations : {new_count}")
    print(f"  Skipped (already): {skip_count}")
    print(f"  Failed/empty     : {total - new_count - skip_count}")

# ----------------------------------------------------------------------
# 主入口
# ----------------------------------------------------------------------
def main():
    # 从命令行获取文件列表，无参数则默认 processed.json
    input_files = sys.argv[1:]
    if not input_files:
        input_files = ["processed.json"]

    for f in input_files:
        # 生成输出文件名：translated_ + 原文件名
        dir_name = os.path.dirname(f)
        base_name = os.path.basename(f)
        output_name = "translated_" + base_name
        output_path = os.path.join(dir_name, output_name)

        process_file(f, output_path)

    print("\nAll files processed.")

if __name__ == "__main__":
    main()