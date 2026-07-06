const fs = require('fs');
const path = require('path');

// 扫描目录下所有 .js 文件，排除 translation/ 和 node_modules/
function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (full.includes('translation') || full.includes('node_modules')) continue;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, fileList);
    } else if (path.extname(file) === '.js') {
      fileList.push(full);
    }
  }
  return fileList;
}

// 从文件内容中提取所有字符串字面量（单引号、双引号、模板字符串）
function extractStrings(content) {
  const strings = new Set();
  // 双引号字符串
  const dq = /"((?:[^"\\]|\\.)*)"/g;
  // 单引号字符串
  const sq = /'((?:[^'\\]|\\.)*)'/g;
  // 模板字符串
  const bt = /`((?:[^`\\]|\\.)*)`/g;

  for (const re of [dq, sq, bt]) {
    let match;
    while ((match = re.exec(content)) !== null) {
      let str = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, '\\');
      if (str.length > 0) strings.add(str);
    }
  }
  return strings;
}

// 判断是否可能是游戏文本，排除代码符号
function looksLikeGameText(s) {
  if (s.length < 2 || s.length > 12000) return false;
  // 必须包含英文字母
  if (!/[A-Za-z]/.test(s)) return false;
  // 排除纯数字、符号
  if (/^[\W\d_]+$/.test(s)) return false;
  // 排除常见 JS 代码片段
  const codeIndicators = [
    'function', 'require', 'module', 'exports', '__', 'Object', 'return',
    'typeof', 'instanceof', 'new ', 'this.', 'window.', 'document.',
    'console.', 'import ', 'export ', 'const ', 'let ', 'var ', 'class ',
    '=>', '===', '!==', 'if ', 'else', 'for ', 'while ', 'switch', 'case ',
  ];
  for (const ci of codeIndicators) {
    if (s.includes(ci)) return false;
  }
  // 包含至少一个空格或换行，或者长度 > 20（可能是短语/句子）
  if (/\s/.test(s) || s.length > 20) return true;
  // 短字符串：必须看起来像单词或短语（纯字母、常见标点）
  if (/^[A-Za-z0-9 ,.!?';:"()-]+$/.test(s)) return true;
  return false;
}

// 主流程
const rootDir = process.argv[2] || '.';
const jsFiles = walk(rootDir);
console.log(`找到 ${jsFiles.length} 个 JS 文件`);

const allStrings = new Set();
for (const file of jsFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  const strings = extractStrings(content);
  for (const s of strings) {
    if (looksLikeGameText(s)) {
      allStrings.add(s);
    }
  }
}

// 去重并排序
const sorted = Array.from(allStrings).sort();
console.log(`提取到 ${sorted.length} 条候选文本`);

// 导出为 JSON
const outPath = path.join(rootDir, 'extracted_texts.json');
const obj = {};
for (const s of sorted) {
  obj[s] = "";
}
fs.writeFileSync(outPath, JSON.stringify(obj, null, 2));
console.log(`已写入 ${outPath}`);