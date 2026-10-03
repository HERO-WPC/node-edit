// Clash 配置结构校验器
// 递归下降解析本配置实际出现的两种形状：
//   block(indent) := map(indent) | seq(indent)
//   seq 项 = "- " + (标量 | 映射)     映射项 = key: value | key: <更深缩进的块>
// 不支持锚点/多行标量/流式映射等本配置用不到的语法。
import fs from 'node:fs';

const path = process.argv[2];
// 统一换行符：源文件可能是 CRLF，按 \n 切分会让每行末尾残留 \r
const rawLines = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
let fail = 0;
const bad = (ln, msg) => { fail++; console.log(`  ✗ 第 ${ln} 行: ${msg}`); };

/* ---------- 1. 基础语法 ---------- */
rawLines.forEach((l, i) => {
  if (l.includes('\t')) bad(i + 1, '包含制表符（YAML 禁止 Tab 缩进）');
  if (/\s+$/.test(l) && l.trim()) bad(i + 1, '行尾有多余空格');
});
console.log(`1) 基础语法: ${fail === 0 ? '通过' : fail + ' 处异常'}`);

/* ---------- 2. 预处理 ---------- */
const rows = rawLines
  .map((text, idx) => ({ text, ln: idx + 1 }))
  .filter(x => x.text.trim() && !x.text.trim().startsWith('#'))
  .map(x => ({ ...x, indent: x.text.length - x.text.replace(/^\s+/, '').length, t: x.text.trim() }));

const scalar = s => {
  s = String(s).trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map(v => scalar(v)).filter(v => v !== null);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
};
const isItem = t => /^-\s/.test(t) || t === '-';
const splitKV = t => {
  const m = t.match(/^([^:\s][^:]*?):\s*(.*)$/);
  return m ? { key: m[1], rest: m[2] } : null;
};

/* ---------- 3. 递归下降 ---------- */
let pos = 0;

function parseBlock(indent) {
  if (pos >= rows.length || rows[pos].indent < indent) return null;
  return isItem(rows[pos].t) ? parseSeq(indent) : parseMap(indent);
}

/* 键的取值块。两种合法写法：
   a) 子块缩进更深      dns:\n  enable: true
   b) 序列与键同缩进    proxies:\n- name: x      ← YAML 允许块序列不额外缩进 */
function childBlock(keyIndent) {
  if (pos >= rows.length) return null;
  const next = rows[pos];
  if (next.indent > keyIndent) return parseBlock(next.indent);
  if (next.indent === keyIndent && isItem(next.t)) return parseSeq(keyIndent);
  return null;
}

function parseMap(indent) {
  const obj = {};
  while (pos < rows.length) {
    const r = rows[pos];
    if (r.indent !== indent || isItem(r.t)) break;
    const kv = splitKV(r.t);
    if (!kv) { bad(r.ln, `不是合法的 key: value → "${r.t}"`); pos++; continue; }
    pos++;
    if (kv.rest === '') obj[kv.key] = childBlock(indent);
    else obj[kv.key] = scalar(kv.rest);
  }
  return obj;
}

function parseSeq(indent) {
  const arr = [];
  while (pos < rows.length) {
    const r = rows[pos];
    if (r.indent !== indent || !isItem(r.t)) break;
    const body = r.t.replace(/^-\s?/, '');
    const kv = splitKV(body);
    pos++;
    if (!kv) {                       // 纯标量项（如策略组成员、rules 条目）
      arr.push(scalar(body));
      continue;
    }
    const obj = {};
    arr.push(obj);
    if (kv.rest === '') obj[kv.key] = childBlock(indent);
    else obj[kv.key] = scalar(kv.rest);
    // 同一序列项的其余兄弟键，缩进必须 > indent
    while (pos < rows.length && rows[pos].indent > indent && !isItem(rows[pos].t)) {
      const rr = rows[pos];
      const k2 = splitKV(rr.t);
      if (!k2) { bad(rr.ln, `不是合法的 key: value → "${rr.t}"`); pos++; continue; }
      pos++;
      if (k2.rest === '') obj[k2.key] = childBlock(rr.indent);
      else obj[k2.key] = scalar(k2.rest);
    }
  }
  return arr;
}

const doc = parseBlock(rows.length ? rows[0].indent : 0) || {};
const leftover = rows.length - pos;
console.log(`2) 结构解析: 顶层键 ${Object.keys(doc).length} 个${leftover ? `，未消费 ${leftover} 行` : ''}`);
if (leftover) fail++;

/* ---------- 4. Clash 语义校验 ---------- */
const proxies = Array.isArray(doc.proxies) ? doc.proxies : [];
const groups = Array.isArray(doc['proxy-groups']) ? doc['proxy-groups'] : [];
const rules = Array.isArray(doc.rules) ? doc.rules : [];
console.log(`3) proxies=${proxies.length}, proxy-groups=${groups.length}, rules=${rules.length}`);
if (!proxies.length) { fail++; console.log('  ✗ proxies 为空'); }
if (!groups.length) { fail++; console.log('  ✗ proxy-groups 为空'); }

for (const x of proxies) {
  for (const k of ['name', 'type', 'server', 'port']) {
    if (x[k] === undefined || x[k] === null) { fail++; console.log(`  ✗ 代理 ${JSON.stringify(x.name)} 缺字段 ${k}`); }
  }
  if (typeof x.port !== 'number') { fail++; console.log(`  ✗ ${x.name} 的 port 不是数字: ${JSON.stringify(x.port)}`); }
  if (x.type === 'vless' && !x.uuid) { fail++; console.log(`  ✗ vless ${x.name} 缺 uuid`); }
  if (x.type === 'trojan' && !x.password) { fail++; console.log(`  ✗ trojan ${x.name} 缺 password`); }
  if (x.network === 'ws') {
    const wo = x['ws-opts'];
    if (!wo || typeof wo !== 'object' || Array.isArray(wo)) { fail++; console.log(`  ✗ ws 代理 ${x.name} 缺 ws-opts`); }
    else if (!wo.path) { fail++; console.log(`  ✗ ws 代理 ${x.name} 的 ws-opts 缺 path`); }
  }
}

const pNames = new Set(proxies.map(x => x.name));
const gNames = new Set(groups.map(g => g.name));
const dangling = [];
for (const g of groups) {
  const members = Array.isArray(g.proxies) ? g.proxies : [];
  if (!members.length) { fail++; console.log(`  ✗ 策略组 ${JSON.stringify(g.name)} 没有成员（可能解析失败）`); }
  for (const m of members) {
    if (!pNames.has(m) && !gNames.has(m) && m !== 'DIRECT' && m !== 'REJECT') dangling.push(`${g.name} → ${m}`);
  }
}
if (dangling.length) { fail += dangling.length; console.log('  ✗ 悬空引用:', dangling); }

if (doc['mixed-port'] === undefined && doc.port === undefined) { fail++; console.log('  ✗ 缺少 mixed-port / port'); }
if (!rules.length) { fail++; console.log('  ✗ 缺少 rules'); }
if (doc.dns) {
  if (doc.dns['enhanced-mode'] !== 'fake-ip') console.log(`  · 提示: dns.enhanced-mode = ${doc.dns['enhanced-mode']}`);
  if (!doc.dns.nameserver) { fail++; console.log('  ✗ dns 缺 nameserver'); }
}

console.log(fail === 0 ? '\n结论: 结构校验全部通过 ✓' : `\n结论: 发现 ${fail} 个问题`);
process.exit(fail ? 1 : 0);
