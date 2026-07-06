// fill_fragments.js
// 用法：node fill_fragments.js
// 前提：当前目录下存在 runtime_fragments.json、translation/main.json、
//       translation/patch/patch_0.json ... patch_6.json（根据你原脚本的路径）

const fs = require('fs');
const path = require('path');

// ---------- 加载已有字典 ----------
function loadDict(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[跳过] 文件不存在: ${filePath}`);
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`[错误] 解析 ${filePath} 失败:`, e.message);
    return {};
  }
}

// 合并多个字典到一个对象（后面的覆盖前面的）
function mergeDicts(...dicts) {
  return Object.assign({}, ...dicts);
}

// ---------- 主流程 ----------
const baseDir = process.cwd(); // 可修改为你的项目根目录

// 1. 读取 runtime_fragments.json
const runtimePath = path.join(baseDir, 'runtime_fragments.json');
if (!fs.existsSync(runtimePath)) {
  console.error('找不到 runtime_fragments.json，请确认文件路径');
  process.exit(1);
}
const runtimeDict = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));

// 2. 加载已有翻译：main.json + patch_0~6
const translationDir = path.join(baseDir, 'translation');
const mainPath = path.join(baseDir, 'main.json');
const ePath = path.join(baseDir, 'enums.json');
const patchDir = path.join(baseDir, 'patch');

const existingDicts = [];
existingDicts.push(loadDict(mainPath));
existingDicts.push(loadDict(ePath));

for (let i = 0; i <= 6; i++) {
  const patchPath = path.join(patchDir, `patch_${i}.json`);
  if (fs.existsSync(patchPath)) {
    existingDicts.push(loadDict(patchPath));
  }
}

const masterDict = mergeDicts(...existingDicts);
console.log(`[信息] 已加载 ${Object.keys(masterDict).length} 条已有翻译`);

// 3. 填充 runtime_fragments.json 的空值
let filledCount = 0;
const output = {};

for (const [key, value] of Object.entries(runtimeDict)) {
  if (value && value.trim() !== '') {
    // 已经有值（不太可能，但保留）
    output[key] = value;
  } else if (masterDict[key] !== undefined && masterDict[key].trim() !== '') {
    // 从已有字典中找到非空译文
    output[key] = masterDict[key];
    filledCount++;
  } else {
    // 保持空值，等待人工翻译
    output[key] = '';
  }
}

// 4. 写入输出文件
const outputPath = path.join(baseDir, 'runtime_fragments_filled.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');

console.log(`[完成] 共填充 ${filledCount} 个片段，剩余 ${Object.keys(runtimeDict).length - filledCount} 个待翻译`);
console.log(`输出文件：${outputPath}`);