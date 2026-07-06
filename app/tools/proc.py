import json
import sys
from collections import OrderedDict

def main():
    input_file = 'oc.json'
    try:
        # 保持原始键的顺序
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f, object_pairs_hook=OrderedDict)
    except FileNotFoundError:
        print(f"错误：找不到文件 {input_file}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"错误：{input_file} 不是合法的 JSON 文件\n{e}")
        sys.exit(1)

    # 要删除的前缀（isAAAA, hasAAAA, setAAAA, ...）
    prefixes_to_remove = [
        'is', 'has', 'set', 'unlock', 'remove',
        'on', 'debug', 'clear', 'enable', 'disable', 'get'
    ]
    # 要删除的子串（包含即删除）
    substrings_to_remove = [
        '.json', '.png', '.js', '.jpg', '.svg',
        'bitmaps/', '/resources'
    ]

    # 第一步至第三步：过滤
    filtered = OrderedDict()
    for key, value in data.items():
        # 1. 键包含 '_' → 删除
        if '_' in key:
            continue
        # 2. 键以指定前缀开头 → 删除
        if any(key.startswith(prefix) for prefix in prefixes_to_remove):
            continue
        # 3. 键包含指定子串 → 删除
        if any(sub in key for sub in substrings_to_remove):
            continue
        # 保留
        filtered[key] = value

    # 第四步：按 %s / %d 分类
    regex_unsorted = OrderedDict()
    origin_unsorted = OrderedDict()

    for key, value in filtered.items():
        if '%s' in key or '%d' in key:
            regex_unsorted[key] = value
        else:
            origin_unsorted[key] = value

    # 写入未排序版本（保持过滤后的原始顺序）
    with open('regexTranslationUnsort.json', 'w', encoding='utf-8') as f:
        json.dump(regex_unsorted, f, ensure_ascii=False, indent=2, sort_keys=False)
    with open('originTranslationUnsort.json', 'w', encoding='utf-8') as f:
        json.dump(origin_unsorted, f, ensure_ascii=False, indent=2, sort_keys=False)

    # 写入排序版本（按键排序）
    with open('regexTranslation.json', 'w', encoding='utf-8') as f:
        json.dump(regex_unsorted, f, ensure_ascii=False, indent=2, sort_keys=True)
    with open('originTranslation.json', 'w', encoding='utf-8') as f:
        json.dump(origin_unsorted, f, ensure_ascii=False, indent=2, sort_keys=True)

    print("处理完成。已生成以下文件：")
    print("  regexTranslationUnsort.json")
    print("  originTranslationUnsort.json")
    print("  regexTranslation.json")
    print("  originTranslation.json")

if __name__ == '__main__':
    main()