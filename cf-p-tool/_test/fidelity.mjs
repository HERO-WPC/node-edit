// 验证 Clash YAML 写回的保真度：proxies 区块以外的内容必须逐字节不变
import fs from 'node:fs';

const html = fs.readFileSync('D:/桌面/节点-edit/cf-p-tool/index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const els = new Map();
const mk = id => ({ id, value: '', textContent: '', innerHTML: '', checked: false, disabled: false, dataset: {}, style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, focus() {}, scrollIntoView() {} });
const get = id => { if (!els.has(id)) els.set(id, mk(id)); return els.get(id); };
const document = { getElementById: get, querySelector: () => ({ value: 'list', checked: true, click() {} }), querySelectorAll: () => [], createElement: () => mk('d') };
const api = new Function('document', 'navigator', 'console', 'atob', 'btoa',
  code + ';return {importNodes,exportClashYaml,openEditor,saveEditor,updatePreview,nodeList:()=>nodeList};')(
  document, {}, console, globalThis.atob, globalThis.btoa);

const ORIG = fs.readFileSync(process.argv[2], 'utf8');
get('importArea').value = ORIG;
get('importBtn').onclick();
console.log('导入节点数:', api.nodeList().length);

// 未编辑写回
get('clashExport').onclick();
const out1 = get('clashOut').value;
fs.writeFileSync(process.argv[3], out1, 'utf8');

const before = ORIG.slice(0, ORIG.indexOf('proxies:'));
const after = out1.slice(0, out1.indexOf('proxies:'));
console.log('proxies 之前的内容一致:', before === after);

const tailMarker = 'proxy-groups:';
const ORIG_TAIL = ORIG.slice(ORIG.indexOf(tailMarker));
const OUT_TAIL = out1.slice(out1.indexOf(tailMarker));
console.log('proxies 之后的内容一致:', ORIG_TAIL === OUT_TAIL);
if (ORIG_TAIL !== OUT_TAIL) {
  const a = ORIG_TAIL.split('\n'), b = OUT_TAIL.split('\n');
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
console.log('\n编辑后 —— proxies 之前一致:', ORIG.slice(0, ORIG.indexOf('proxies:')) === out2.slice(0, out2.indexOf('proxies:')));
console.log('编辑后 —— proxies 之后一致:', ORIG_TAIL === out2.slice(out2.indexOf(tailMarker)));

// 逐行 diff：统计变化行
const a = out1.split('\n'), b = out2.split('\n');
let changed = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { changed++; console.log(`  diff 行 ${i + 1}:\n    - ${a[i]}\n    + ${b[i]}`); }
console.log('编辑后变化行数:', changed, '（预期 1：仅 path 行）');
