#!/usr/bin/env python3
import sys
import json

def main():
    # 读取：支持文件参数或标准输入
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        content = sys.stdin.read()

    data = json.loads(content)
    if not isinstance(data, dict):
        raise ValueError('输入必须是 JSON 对象（键值对）')

    # 删除键名包含 |、]、[ 的项
    bad = set('|][')
    cleaned = {k: v for k, v in data.items() if not bad.intersection(k)}

    # 输出紧凑 JSON（保留非 ASCII 字符原样）
    output = json.dumps(cleaned, ensure_ascii=False, separators=(',', ':'))

    # 写入：指定输出文件或标准输出
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(output + '\n')
    else:
        sys.stdout.write(output + '\n')

if __name__ == '__main__':
    main()