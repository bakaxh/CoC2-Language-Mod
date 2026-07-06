import json
import requests
import time
import os
import sys
import re

# ----------------------------------------------------------------------
# 配置
# ----------------------------------------------------------------------
ENDPOINT = "http://127.0.0.1:2333"
TRANSLATOR_ID = ""          # 若 API 需要，可填写
TIMEOUT = 15
DELAY = 0.05                # 每次请求之间的间隔（秒）

# ----------------------------------------------------------------------
# 过滤规则：判断是否需要翻译
# ----------------------------------------------------------------------
def should_translate(text):
    """
    返回 True 表示需要调用 API 翻译，False 表示跳过（保留空值）。
    规则：
    1. 不包含至少3个连续英文字母 -> 跳过（数字、符号、短词）
    2. 包含 [ 或 ] -> 跳过（未解析标签残留）
    3. 以 | 开头 -> 跳过（分支残渣）
    4. 全部由大写字母和下划线组成且长度2-5 -> 跳过（如 STAT_STR）
    5. 完全不含字母 -> 跳过
    """
    if not text or not text.strip():
        return False
    
    t = text.strip()
    
    # 规则4：全大写下划线组合（长度 2-5）
    if re.fullmatch(r'[A-Z_]{2,5}', t):
        return False
    
    # 规则1：必须包含至少3个连续英文字母
    if not re.search(r'[a-zA-Z]{3,}', t):
        return False
    
    # 规则2：包含未解析的方括号
    if '[' in t or ']' in t:
        return False
    
    # 规则3：以 | 开头
    if re.match(r'^\s*\|', t):
        return False
    
    # 规则5：完全不含字母（已经由规则1覆盖，但保留）
    if not re.search(r'[a-zA-Z]', t):
        return False
    # 规则6: 以特定单词结尾且不含空格 -> 跳过
    ending_words = ["Desc", "Name", "Res", "Count", "Num", "Noun", "Simple", "Type", "Color", "Size", "Effect", "Wrapper", "Alloc", "Range", "Base", "Modifier", "Check", "Max", "Min", "Visible", "Item", "Text", "Material"]
    if ' ' not in t:
        for w in ending_words:
            if t.endswith(w):
                return False

# 规则7: 以特定单词开头且不含空格 -> 跳过
    starting_words = ["is", "remove", "has", "enable", "on", "disable", "count", "num", "have", "had", "got", "get", "add", "check", "can", "update", "drop", "clear", "create", "random", "reset", "return", "bg"]
    if ' ' not in t:
        for w in starting_words:
            if t.startswith(w):
                return False
    return True

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
    filtered_count = 0

    for idx, (key, value) in enumerate(data.items(), 1):
        # 如果已有非空翻译，跳过
        if value and value.strip():
            skip_count += 1
            print(f"[{idx}/{total}] Skipping (already translated): {key[:60]}...")
            continue

        # 检查过滤规则：不需要翻译的直接留空
        if not should_translate(key):
            filtered_count += 1
            print(f"[{idx}/{total}] Filtered (unnecessary): {key[:60]}...")
            data[key] = ""   # 保持空值
            # 每 100 条自动保存
            if idx % 10000 == 0:
                save_json_file(output_path, data)
                print(f"Progress saved ({idx} entries).")
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
    print(f"  New translations     : {new_count}")
    print(f"  Skipped (already)    : {skip_count}")
    print(f"  Filtered (unnecessary): {filtered_count}")
    print(f"  Failed/empty         : {total - new_count - skip_count - filtered_count}")

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