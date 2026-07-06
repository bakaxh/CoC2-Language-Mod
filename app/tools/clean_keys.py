import sys
import re
import json
from pathlib import Path

# ----------------------------------------------------------------------
# 1. 清理 key：去掉换行符后的缩进空格，并 trim
# ----------------------------------------------------------------------
def clean_key(text):
    # 去掉每个换行符后的水平空白（空格、制表符等），但不删除换行符本身
    cleaned = re.sub(r'\n[ \t]+', '\n', text)
    # 再去除首尾空白（安全起见）
    return cleaned.strip()

# ----------------------------------------------------------------------
# 2. 排序函数：长度 → 字符顺序
# ----------------------------------------------------------------------
def sort_keys(d):
    return sorted(d.keys(), key=lambda k: (len(k), k))

# ----------------------------------------------------------------------
# 3. 主流程
# ----------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print("Usage: python clean_keys.py <input1.json> [input2.json ...] [-o output_prefix]")
        return

    # 解析参数
    args = sys.argv[1:]
    output_prefix = "cleaned"
    if "-o" in args:
        idx = args.index("-o")
        if idx + 1 < len(args):
            output_prefix = args[idx + 1]
            args.pop(idx + 1)
            args.pop(idx)
        else:
            print("Error: -o requires a value")
            return

    input_files = args
    if not input_files:
        print("No input files specified.")
        return

    # 存储去重后的所有条目
    all_data = {}

    for filepath in input_files:
        if not Path(filepath).exists():
            print(f"Warning: {filepath} not found, skip.")
            continue

        print(f"Processing {filepath} ...")
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        for key, value in data.items():
            new_key = clean_key(key)
            # 如果 key 清空后变成空字符串或长度不足，可选择性跳过
            if not new_key or len(new_key) < 4:
                continue
            # 去重：保留最先出现的
            if new_key not in all_data:
                all_data[new_key] = value  # 原 value 通常为空字符串

    print(f"Total unique keys after cleaning: {len(all_data)}")

    # 按排序输出，每 40000 条一个文件
    chunk_size = 40000
    ordered_keys = sort_keys(all_data)
    file_index = 0

    for i in range(0, len(ordered_keys), chunk_size):
        batch_keys = ordered_keys[i:i + chunk_size]
        batch_dict = {k: all_data[k] for k in batch_keys}
        output_path = f"{output_prefix}_{file_index:04d}.json"
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(batch_dict, f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(batch_dict)} entries -> {output_path}")
        file_index += 1

    print("Done!")

if __name__ == '__main__':
    main()