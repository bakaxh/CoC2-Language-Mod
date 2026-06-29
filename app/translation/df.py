import json

with open('extracted_texts.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

keys = list(data.keys())
print("总键数：", len(keys))
unique_keys = set(keys)
print("去重后键数：", len(unique_keys))

# 统计各键的字符长度
lengths = [len(k) for k in unique_keys]
print("平均长度：", sum(lengths)/len(lengths))
print("最大长度：", max(lengths))