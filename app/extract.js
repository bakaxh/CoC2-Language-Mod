const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function walk(dir, list = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (full.includes('node_modules') || full.includes('translation')) continue;
    if (fs.statSync(full).isDirectory()) walk(full, list);
    else if (f.endsWith('505.9d948911959c0b4a9a3c.js')) list.push(full);
  }
  return list;
}

function extractAllStrings(code) {
  const strings = new Set();
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch { return strings; }

  function walkNode(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal' && typeof node.value === 'string' && node.value.length >= 2 && /[A-Za-z]/.test(node.value)) {
      strings.add(node.value);
    }
    if (node.type === 'TemplateLiteral') {
      let s = '';
      for (let i = 0; i < node.quasis.length; i++) {
        s += node.quasis[i].value.raw;
      }
      if (s.length >= 2 && /[A-Za-z]/.test(s)) strings.add(s);
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === 'object') {
        if (Array.isArray(v)) v.forEach(walkNode);
        else walkNode(v);
      }
    }
  }
  walkNode(ast);
  return strings;
}

const files = walk('.');
let all = new Set();
for (const f of files) {
  const code = fs.readFileSync(f, 'utf-8');
  for (const s of extractAllStrings(code)) all.add(s);
}

// const arr = Array.from(all).sort();
const arr = Array.from(all);
const obj = {};
arr.forEach(s => obj[s] = '');
fs.writeFileSync('extracted_all.json', JSON.stringify(obj, null, 2));
console.log(`提取完成，共 ${arr.length} 条，写入 extracted_all.json`);