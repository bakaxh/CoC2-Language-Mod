import sys
import re
import json
import json5
from tqdm import tqdm
from pathlib import Path

# ----------------------------------------------------------------------
# 1. 标签内部分支按顶级 | 切分（忽略嵌套 [ ] 中的 |）
# ----------------------------------------------------------------------
def split_first_level_pipes(s):
    parts = []
    current = []
    depth = 0
    for ch in s:
        if ch == '[':
            depth += 1
            current.append(ch)
        elif ch == ']':
            depth -= 1
            current.append(ch)
        elif ch == '|' and depth == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(ch)
    parts.append(''.join(current))
    return parts

# ----------------------------------------------------------------------
# 2. 片段是否有翻译价值：trim 后长度≥4 且至少包含一个字母
# ----------------------------------------------------------------------
def is_valuable(text):
    s = text.strip()
    if len(s) < 4:
        return False
    if not re.search(r'[a-zA-Z]', s):
        return False
    return True

# ----------------------------------------------------------------------
# 3. 核心拆分：同时处理 [嵌套标签] 和 <HTML 标签>
# ----------------------------------------------------------------------
def extract_texts(raw_str):
    """
    生成器：从原始字符串中逐个产出有价值的文本片段。
    - 遇到 [...] 按之前逻辑处理（递归拆分分支）。
    - 遇到 <...> 则跳过整个 HTML 标签，不输出标签本身，
      但标签内部和外部文字会被当作正常文本（因为只跳过 <...> 本身）。
    - 相邻的普通字符直接累积。
    """
    buf = []
    i, n = 0, len(raw_str)

    while i < n:
        c = raw_str[i]

        # ----- 处理 [ 开头的游戏标签 -----
        if c == '[':
            # 先把前面的普通文本输出
            if buf:
                text = ''.join(buf)
                if is_valuable(text):
                    yield text
                buf = []

            start = i
            depth = 1
            i += 1
            while i < n and depth > 0:
                if raw_str[i] == '[':
                    depth += 1
                elif raw_str[i] == ']':
                    depth -= 1
                i += 1

            if depth == 0:
                # 提取最外层 [ ] 内部的内容
                inner = raw_str[start+1 : i-1]
                # 按顶级 | 拆分，递归处理每个分支
                branches = split_first_level_pipes(inner)
                if len(branches) > 1:
                    for branch in branches:
                        yield from extract_texts(branch)
                # 单分支或无 | 的普通标签：不产生文本（变量名之类直接丢弃）
            else:
                # 括号未闭合，视为普通文本继续
                buf.extend(raw_str[start:])
                i = n
            continue

        # ----- 处理 <HTML 标签> -----
        if c == '<':
            # 先把前面的普通文本输出
            if buf:
                text = ''.join(buf)
                if is_valuable(text):
                    yield text
                buf = []

            # 找到匹配的 >
            j = i + 1
            while j < n and raw_str[j] != '>':
                j += 1
            if j < n:
                # 跳过整个 <...>，不产生任何文本
                i = j + 1
            else:
                # 没找到 >，当普通字符处理
                buf.append(c)
                i += 1
            continue

        # ----- 普通字符 -----
        buf.append(c)
        i += 1

    # 处理末尾剩余文本
    if buf:
        text = ''.join(buf)
        if is_valuable(text):
            yield text

# ----------------------------------------------------------------------
# 4. 加载已有翻译文件的所有 key（用于去重）
# ----------------------------------------------------------------------
def load_existing_keys(paths):
    existing = set()
    for p in paths:
        if not Path(p).exists():
            print(f"Warning: {p} not found, skip.")
            continue
        print(f"Loading existing translations from: {p}")
        with open(p, 'r', encoding='utf-8') as f:
            data = json5.load(f)   # json5 同样能容忍格式问题
        existing.update(data.keys())
    return existing

# ----------------------------------------------------------------------
# 5. 排序键：长度 → 字符串（大小写敏感）
# ----------------------------------------------------------------------
def sort_keys(d):
    return sorted(d.keys(), key=lambda k: (len(k), k))

# ----------------------------------------------------------------------
# 6. 主流程
# ----------------------------------------------------------------------
def main():
    if len(sys.argv) < 2:
        print("Usage: python dep.py <input.json> [existing1.json existing2.json ...]")
        return

    input_path = sys.argv[1]
    existing_paths = sys.argv[2:] if len(sys.argv) > 2 else []

    # 1) 读取并解析原始大文件（json5 容忍尾随逗号）
    print("Loading & parsing input file (this may take a while)...")
    with open(input_path, 'r', encoding='utf-8') as f:
        raw = f.read()
    data = json5.loads(raw)

    # 2) 加载已有翻译 key 去重
    seen = load_existing_keys(existing_paths)

    # 3) 准备输出
    chunk_size = 40_000
    current_batch = {}
    file_index = 0

    # 进度条
    total_keys = len(data)
    print(f"Total entries in source: {total_keys}")
    print(f"Existing keys loaded: {len(seen)}")

    with tqdm(data.keys(), desc="Extracting fragments", unit="keys") as pbar:
        for orig_str in pbar:
            for frag in extract_texts(orig_str):
                # trim 处理后的片段
                key = frag.strip()
                if key not in seen:
                    seen.add(key)
                    current_batch[key] = ""
                    # 达到一批则写出
                    if len(current_batch) >= chunk_size:
                        output_path = f"fragments_{file_index:04d}.json"
                        write_sorted_json(current_batch, output_path)
                        file_index += 1
                        current_batch = {}
            pbar.set_postfix(fragments=len(seen), files=file_index)

    # 写出最后一批
    if current_batch:
        output_path = f"fragments_{file_index:04d}.json"
        write_sorted_json(current_batch, output_path)
        file_index += 1

    print(f"Done! Total unique fragments: {len(seen)}")
    print(f"Output files: {file_index}")

# ----------------------------------------------------------------------
# 7. 按排序规则写出 JSON 文件
# ----------------------------------------------------------------------
def write_sorted_json(batch_dict, path):
    ordered_keys = sort_keys(batch_dict)
    ordered_dict = {k: batch_dict[k] for k in ordered_keys}
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(ordered_dict, f, ensure_ascii=False, indent=2)
    print(f"Wrote {len(ordered_dict)} entries -> {path}")

if __name__ == '__main__':
    main()