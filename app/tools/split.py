import json
import re
from collections import OrderedDict

# ---------- 修复尾部逗号 ----------
def fix_trailing_commas(json_str):
    pattern = re.compile(r',\s*([}\]])')
    prev = None
    while prev != json_str:
        prev = json_str
        json_str = pattern.sub(r'\1', json_str)
    return json_str

# ---------- 清理空白：去除首尾换行，去除每行首尾空格/制表符 ----------
def clean_whitespace(text):
    text = text.strip()  # 去除首尾所有空白（含换行）
    return re.sub(r'(?m)^[ \t]+|[ \t]+$', '', text)  # 去除每行缩进和尾部空格

# ---------- 移除 <b> 标签 ----------
def remove_b_tags(text):
    return re.sub(r'</?b>', '', text)

# ---------- 分割含 <i> 的文本 ----------
def split_text_with_i(text):
    # 替换占位符（占位符在外部也已替换，此处为保险）
    text = re.sub(r'\[[^\]]+\]', '%s', text)
    if '<i>' not in text:
        cleaned = clean_whitespace(remove_b_tags(text))
        return [cleaned] if cleaned else []

    parts = []
    pos = 0
    pattern = re.compile(r'<i>(.*?)</i>', re.DOTALL)
    for match in pattern.finditer(text):
        start, end = match.span()
        if start > pos:
            normal = text[pos:start]
            if normal.strip():
                cleaned = clean_whitespace(remove_b_tags(normal))
                if cleaned:
                    parts.append(cleaned)
        content = match.group(1)
        if content.strip():
            cleaned_content = clean_whitespace(remove_b_tags(content))
            if cleaned_content:
                # 保留双引号（作为对话标识）
                if cleaned_content.startswith('"') and cleaned_content.endswith('"'):
                    parts.append(cleaned_content)
                else:
                    parts.append(cleaned_content)
        pos = end
    if pos < len(text):
        normal = text[pos:]
        if normal.strip():
            cleaned = clean_whitespace(remove_b_tags(normal))
            if cleaned:
                parts.append(cleaned)
    return parts

# ---------- 主处理函数 ----------
def process_json(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8') as f:
        raw = f.read()
    fixed_raw = fix_trailing_commas(raw)

    try:
        data = json.loads(fixed_raw, object_pairs_hook=OrderedDict)
    except json.JSONDecodeError as e:
        print("JSON 解析失败，尝试使用 json5...")
        import json5
        data = json5.loads(fixed_raw, object_pairs_hook=OrderedDict)

    new_data = OrderedDict()
    for key, value in data.items():
        # 替换占位符
        key_replaced = re.sub(r'\[[^\]]+\]', '%s', key)

        if '<i>' in key:
            fragments = split_text_with_i(key_replaced)
            for frag in fragments:
                if frag:  # 非空键
                    new_data[frag] = ""
        else:
            cleaned_key = clean_whitespace(remove_b_tags(key_replaced))
            if cleaned_key:
                new_data[cleaned_key] = value  # 原值通常为空

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(new_data, f, ensure_ascii=False, indent=2)

    print(f"处理完成，输出到 {output_file}，共 {len(new_data)} 个键。")

if __name__ == '__main__':
    process_json('extracted_all.json', 'processed.json')