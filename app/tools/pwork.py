import json
import sys
import re

def extract_segments(text, openq='"', closeq='"'):
    """
    将文本按成对引号切割，返回 (type, segment) 列表。
    type: 'dialogue' (引号内) 或 'narration' (引号外)
    保留引号本身在 segment 中。
    """
    segments = []
    # 构建正则：匹配 openq ... closeq，内部不包含 closeq
    if openq == closeq:
        # 英文双引号，简单匹配成对 "..." (不处理转义)
        pattern = re.compile(r'"[^"]*"')
    else:
        pattern = re.compile(re.escape(openq) + r'[^' + re.escape(closeq) + r']*' + re.escape(closeq))
    
    last_end = 0
    for m in pattern.finditer(text):
        nar = text[last_end:m.start()]
        if nar:
            segments.append(('narration', nar))
        segments.append(('dialogue', m.group()))
        last_end = m.end()
    nar = text[last_end:]
    if nar:
        segments.append(('narration', nar))
    return segments

def filter_blank(segments):
    """过滤掉原文部分为纯空白的叙述片段"""
    return [(t, s) for t, s in segments if not (t == 'narration' and not s.strip())]

def align_by_type(src_segs, tgt_segs):
    """
    尝试按类型对齐：分别取出 dialogue 和 narration 列表，按顺序配对。
    若数量不一致，返回 None 表示无法自动对齐。
    """
    src_dial = [(t, s) for t, s in src_segs if t == 'dialogue']
    src_narr = [(t, s) for t, s in src_segs if t == 'narration']
    tgt_dial = [(t, s) for t, s in tgt_segs if t == 'dialogue']
    tgt_narr = [(t, s) for t, s in tgt_segs if t == 'narration']

    if len(src_dial) != len(tgt_dial) or len(src_narr) != len(tgt_narr):
        return None  # 无法对齐

    result = []
    # 按原始顺序穿插
    # 需要记住每个片段在原序列中的位置，但此处为了简单，直接按类型顺序配对
    # 更稳健的方法：分别配对 dialogue 和 narration，然后按原始顺序重建配对列表
    # 这里我们假设顺序完全一致，直接重新遍历原始序列，匹配同类型的片段
    src_idx_d, src_idx_n = 0, 0
    tgt_idx_d, tgt_idx_n = 0, 0
    for (stype, sseg) in src_segs:
        if stype == 'dialogue':
            tseg = tgt_dial[tgt_idx_d][1]
            result.append((sseg, tseg))
            tgt_idx_d += 1
        else:
            tseg = tgt_narr[tgt_idx_n][1]
            result.append((sseg, tseg))
            tgt_idx_n += 1
    return result

def process_json(input_path, output_path):
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    output = {}
    skipped_keys = 0
    skipped_entries = 0

    for key, value in data.items():
        # 判断译文引号类型
        if '“' in value and '”' in value:
            oq, cq = '“', '”'
        else:
            oq, cq = '"', '"'

        # 切割
        src_segs_raw = extract_segments(key, '"', '"')
        tgt_segs_raw = extract_segments(value, oq, cq)

        # 过滤纯空白
        src_segs = filter_blank(src_segs_raw)
        tgt_segs = filter_blank(tgt_segs_raw)

        # 尝试按类型对齐
        aligned = align_by_type(src_segs, tgt_segs)

        if aligned is None:
            # 类型数量不一致，尝试按总片段数强制对齐（作为降级）
            if len(src_segs) == len(tgt_segs):
                aligned = [(s[1], t[1]) for s, t in zip(src_segs, tgt_segs)]
                print(f"警告: 类型数量不匹配，但总片段数相同，强制按位置对齐: {key[:50]}...")
            else:
                print(f"警告: 无法对齐，跳过该条目: {key[:50]}... (原文 {len(src_segs)} 段, 译文 {len(tgt_segs)} 段)")
                skipped_entries += 1
                continue

        # 写入输出
        for seg_key, seg_val in aligned:
            if not seg_key.strip():
                continue
            if seg_key in output:
                skipped_keys += 1
                print(f"跳过重复键: '{seg_key[:50]}'")
                continue
            output[seg_key] = seg_val

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"处理完成，已保存至 {output_path}")
    if skipped_entries > 0:
        print(f"共 {skipped_entries} 个条目因无法对齐被跳过。")
    if skipped_keys > 0:
        print(f"共跳过 {skipped_keys} 个重复键。")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python split_dialogue.py <输入文件.json> [输出文件.json]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "split_output.json"
    process_json(input_file, output_file)