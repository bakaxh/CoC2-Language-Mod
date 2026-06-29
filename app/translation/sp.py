import json
import glob
import os
import sys

def split_large_json(input_file, output_prefix='part_', max_chars=1_000_000):
    """
    将大型扁平 JSON 文件分割为多个小 JSON 文件。
    
    :param input_file: 输入 JSON 文件路径
    :param output_prefix: 输出文件前缀，后面会加上数字和 .json
    :param max_chars: 每个分片的最大字符数（含花括号和逗号）
    """
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 如果不是字典，无法按键值对分割
    if not isinstance(data, dict):
        raise ValueError('输入的 JSON 必须是顶层字典（扁平键值对）')

    chunk_num = 1
    # 当前分片的键值对列表，每个元素是 (key, value)
    items = []
    # 当前分片的长度统计：'{}' 占 2 个字符，加上键值对字符串长度和逗号
    total_len = 2  # 初始为 "{}"
    count = 0      # 当前分片中已有的键值对数量

    for key, value in data.items():
        # 生成该键值对的 JSON 字符串形式（不含外层花括号）
        pair_str = json.dumps(key, ensure_ascii=False) + ':' + json.dumps(value, ensure_ascii=False)
        pair_len = len(pair_str)
        # 加入新一对需要的额外字符：pair_len + (如果已有键值对，需要加一个逗号)
        added_len = pair_len + (1 if count > 0 else 0)

        if total_len + added_len <= max_chars:
            # 可以放入当前分片
            items.append((key, value))
            total_len += added_len
            count += 1
        else:
            # 当前分片已满，写出
            if count > 0:
                write_chunk(items, output_prefix, chunk_num)
                chunk_num += 1
                items = []
                total_len = 2
                count = 0
            # 将当前键值对放入新分片
            items.append((key, value))
            total_len += len(pair_str)  # 新分片无逗号，直接加 pair_len
            count += 1

    # 写出最后一个分片
    if count > 0:
        write_chunk(items, output_prefix, chunk_num)

    print(f'分割完成，共生成 {chunk_num} 个分片。')


def write_chunk(items, output_prefix, chunk_num):
    """将 items 列表写成 JSON 文件"""
    chunk_dict = {key: value for key, value in items}
    filename = f'{output_prefix}{chunk_num:03d}.json'
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(chunk_dict, f, ensure_ascii=False, indent=None, separators=(',', ':'))
    print(f'写出 {filename}，大小 {os.path.getsize(filename) / 1024:.1f} KB')


def merge_json_parts(input_pattern, output_file):
    """
    合并所有符合 pattern 的分片 JSON 文件为一个完整的 JSON。
    
    :param input_pattern: 分片文件的匹配模式，例如 'part_*.json'
    :param output_file: 合并后的输出文件路径
    """
    part_files = sorted(glob.glob(input_pattern))
    if not part_files:
        print(f'未找到匹配 "{input_pattern}" 的文件')
        return

    merged = {}
    for fname in part_files:
        with open(fname, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, dict):
            print(f'警告：{fname} 不是字典格式，跳过')
            continue
        # 检查是否有重复键（若有，后覆盖前，可改为报错）
        for key, value in data.items():
            if key in merged:
                print(f'警告：键 "{key}" 在多个分片中出现，后面的值将覆盖前面的')
            merged[key] = value

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print(f'合并完成，输出到 {output_file}，总键数 {len(merged)}')


if __name__ == '__main__':
    # 示例用法：
    # 分割：
    # python script.py split input.json
    # 合并：
    # python script.py merge part_*.json merged.json

    if len(sys.argv) < 2:
        print('用法:')
        print('  分割: python script.py split <input.json> [max_chars] [prefix]')
        print('  合并: python script.py merge <pattern> <output.json>')
        sys.exit(1)

    command = sys.argv[1]
    if command == 'split':
        input_file = sys.argv[2]
        max_chars = int(sys.argv[3]) if len(sys.argv) > 3 else 1_000_000
        prefix = sys.argv[4] if len(sys.argv) > 4 else 'part_'
        split_large_json(input_file, prefix, max_chars)
    elif command == 'merge':
        pattern = sys.argv[2]
        output = sys.argv[3]
        merge_json_parts(pattern, output)
    else:
        print(f'未知命令: {command}')