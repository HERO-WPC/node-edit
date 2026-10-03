// 验证 Clash YAML 写回的保真度：proxies 区块以外的内容必须逐字节不变
// 用法: node fidelity.mjs <原始配置> [写回结果输出路径]
import fs from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const els = new Map();
const mk = id => ({
  id, value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
  dataset: {}, style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  addEventListener() {}, appendChild() {}, focus() {}, scrollIntoView() {},
});
const get = id => { if (!els.has(id)) els.set(id, mk(id)); return els.get(id); };
const document = {
  getElementById: get,
  querySelector: () => ({ value: 'list', checked: true, click() {} }),
  querySelectorAll: () => [],
  createElement: () => mk('d'),
  body: { appendChild() {}, removeChild() {} },
};
const api = new Function('document', 'navigator', 'console', 'window', 'atob', 'btoa',
  code + ';return {importNodes,exportClashYaml,openEditor,saveEditor,updatePreview,nodeList:()=>nodeList};')(
  document, {}, console, { confirm: () => true }, globalThis.atob, globalThis.btoa);

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('用法: node fidelity.mjs <原始配置> [写回结果输出路径]');
  process.exit(2);
}
const ORIG = fs.readFileSync(inputPath, 'utf8');
if (!/^\s*proxies:\s*$/m.test(ORIG)) {
  console.error('输入文件里没有顶层 proxies: 区块，无法用于保真度检查');
  process.exit(2);
}

get('importArea').value = ORIG;
get('importBtn').onclick();
console.log('导入节点数:', api.nodeList().length);

// 未编辑直接写回
get('clashExport').onclick();
const out1 = get('clashOut').value;
if (process.argv[3]) fs.writeFileSync(process.argv[3], out1, 'utf8');

const headOf = t => t.slice(0, t.indexOf('proxies:'));
const tailMarker = 'proxy-groups:';
const tailOf = t => {
  const i = t.indexOf(tailMarker);
  return i < 0 ? '' : t.slice(i);
};

const headSame = headOf(ORIG) === headOf(out1);
const tailSame = tailOf(ORIG) === tailOf(out1);
console.log('proxies 之前的内容一致:', headSame);
console.log('proxies 之后的内容一致:', tailSame);
if (!tailSame) {
  const a = tailOf(ORIG).split('\n'), b = tailOf(out1).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { console.log(`  第 ${i + 1} 行不同:\n    原: ${JSON.stringify(a[i])}\n    新: ${JSON.stringify(b[i])}`); break; }
  }
}

// 编辑一条后写回，检查只有 proxies 区域变化
api.openEditor(0);
get('edP').value = '2.2.2.2:8443';
get('edExist').value = 'overwrite';
api.updatePreview();
api.saveEditor();
get('clashExport').onclick();
const out2 = get('clashOut').value;
const headSame2 = headOf(ORIG) === headOf(out2);
const tailSame2 = tailOf(ORIG) === tailOf(out2);
console.log('\n编辑后 —— proxies 之前一致:', headSame2);
console.log('编辑后 —— proxies 之后一致:', tailSame2);

// 逐行 diff：统计变化行
const a = out1.split('\n'), b = out2.split('\n');
let changed = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) { changed++; console.log(`  diff 行 ${i + 1}:\n    - ${a[i]}\n    + ${b[i]}`); }
}
console.log('编辑后变化行数:', changed, '（预期 1：仅 path 行）');

// 汇总判定：任一项不满足即以非零码退出，便于接入 CI
const checks = [
  ['proxies 之前逐字节一致', headSame],
  ['proxies 之后逐字节一致', tailSame],
  ['编辑后 proxies 之前仍一致', headSame2],
  ['编辑后 proxies 之后仍一致', tailSame2],
  ['改动仅限 1 行', changed === 1],
];
const bad = checks.filter(([, ok]) => !ok);
console.log('\n' + checks.map(([n, ok]) => `  ${ok ? 'PASS' : 'FAIL'}  ${n}`).join('\n'));
console.log(bad.length ? `\n结论: ${bad.length} 项保真度检查未通过` : '\n结论: 保真度检查全部通过 ✓');
process.exit(bad.length ? 1 : 0);
