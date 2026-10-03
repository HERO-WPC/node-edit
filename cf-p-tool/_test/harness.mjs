// 临时测试台：把 cf-p-tool/index.html 里的 <script> 抽出来，在最小 DOM 桩上真实执行。
// 用法: node harness.mjs
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(import.meta.dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error('未找到 <script> 块');
const code = m[1];

/* ---------------- DOM 桩 ---------------- */
const clicks = [];
function mkEl(id) {
  const el = {
    id, value: '', textContent: '', innerHTML: '', checked: false, disabled: false,
    dataset: {}, style: {}, _handlers: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    focus() {}, scrollIntoView() {},
    click() { (this._handlers.click || []).forEach(fn => fn.call(this, { target: this })); },
    appendChild() {}, addEventListener(t, fn) { (this._handlers[t] ||= []).push(fn); },
    set onclick(fn) { this._handlers.click = [fn]; },
    get onclick() { return this._handlers.click?.[0]; },
  };
  return el;
}
const els = new Map();
const getEl = id => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); };

const tabs = ['1', '2', '3', '4'].map(t => { const e = mkEl('tab' + t); e.dataset.t = t; e.classList.add('tab'); if (t === '1') e.classList.add('on'); return e; });
const panels = ['1', '2', '3', '4'].map(t => { const e = mkEl('p' + t); e.classList.add('panel'); if (t === '1') e.classList.add('on'); return e; });
tabs.forEach(t => { t._handlers.click = [() => { tabs.forEach(x => x.classList.remove('on')); panels.forEach(x => x.classList.remove('on')); t.classList.add('on'); getEl('p' + t.dataset.t).classList.add('on'); }]; });

const radios = ['list', 'line', 'self'].map(v => { const e = mkEl('src-' + v); e.value = v; e.checked = v === 'list'; e._handlers.change = [() => { radios.forEach(r => r.checked = r.value === v); getEl('onSrcChange')?.(); }]; return e; });
const rowchks = [];
const nodeBody = getEl('nodeBody');
nodeBody.querySelectorAll = sel => (sel === '.rowchk' ? rowchks.filter(Boolean) : []);

const document = {
  getElementById: getEl,
  querySelector: sel => {
    if (sel === 'input[name=src]:checked') return radios.find(r => r.checked) || radios[0];
    const t = sel.match(/\.tab\[data-t="(\d)"\]/); if (t) return tabs[+t[1] - 1];
    return null;
  },
  querySelectorAll: sel => {
    if (sel === '.tab') return tabs;
    if (sel === 'input[name=src]') return radios;
    if (sel === '.rowchk:checked') return rowchks.filter(c => c.checked);
    if (sel === '.rowchk') return rowchks;
    return [];
  },
  createElement: () => mkEl('dyn'),
};
const writes = [];
const navigator = { clipboard: { writeText: t => { writes.push(t); return Promise.resolve(); } } };

/* ---------------- 执行被测代码 ---------------- */
const ctx = { document, navigator, console, atob: globalThis.atob, btoa: globalThis.btoa, Blob: class {}, URL: globalThis.URL, encodeURIComponent, decodeURIComponent };
const api = new Function(...Object.keys(ctx), code + '\n;return {parseNode,buildNode,setNodeParams,cloneNode,classify,makeName,parseList,parseListSig,parseNodesInput,genMain,openEditor,editorToNode,updatePreview,saveEditor,exportSelected,genSub,genTest,toBatch,renderTable,getqOf,nodeList:()=>nodeList};')(...Object.values(ctx));

/* ---------------- 断言 ---------------- */
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); } };
const set = (id, v) => { getEl(id).value = v; };
const sec = t => console.log('\n=== ' + t + ' ===');

/* ========== 1. 链接解析 / 重建（往返一致性） ========== */
sec('1. parseNode ⇄ buildNode 往返');
const cases = [
  'vless://uuid-1111@1.2.3.4:443?encryption=none&security=tls&sni=a.example.com&type=ws&host=a.example.com&path=%2Fabc%3Fed%3D2048#WS%E8%8A%82%E7%82%B9',
  'trojan://pass%40word@5.6.7.8:8443?security=tls&sni=b.example.com&type=ws&host=b.example.com&path=%2Ftrojan#TJ',
  'vless://uuid-3333@[2001:db8::1]:443?encryption=none&security=tls&type=xhttp&path=%2Fx&mode=stream-one&sni=c.example.com#XHTTP',
  'vless://uuid-4444@9.9.9.9:8080?encryption=none&security=none&type=ws&path=%2Fplain#NO-TLS',
];
for (const raw of cases) {
  const n = api.parseNode(raw);
  const back = api.buildNode(n);
  ok('往返: ' + (n.name || raw.slice(0, 24)), back === raw, '\n        原: ' + raw + '\n        回: ' + back);
}

/* ========== 2. ① 批量生成（全组合） ========== */
sec('2. ① 批量生成 —— 全组合 + p/s 自动识别');
set('nodes', cases[0] + '\n' + cases[1] + '\n' + cases[2]);
set('plist', '11.1.1.1\n11.2.2.2:8443 #HK\nsocks5://u:p@11.3.3.3:1080 #SG');
set('nameTpl', '{name}-{r}-{i}');
set('existMode', 'keep'); set('xhttpMode', 'keep'); set('wk', ''); getEl('rmno').checked = false;
api.genMain();
const out1 = getEl('ol1').value.split('\n');
ok('生成条数 = 2 条WS×3 + 1 条xhttp原样 = 7', out1.length === 7, '实际 ' + out1.length);
ok('xhttp 节点原样保留', out1.includes(cases[2]));
const wsSample = api.parseNode(out1[0]);
const pv = wsSample.pp.map(([k, v]) => k + '=' + v).join('&');
ok('第 1 条 path 内注入 p=11.1.1.1', wsSample.pp.some(([k, v]) => k === 'p' && v === '11.1.1.1'), pv);
ok('原 path 前缀 /abc 保留', wsSample.pPath === '/abc', wsSample.pPath);
ok('原本 ed=2048 保留', wsSample.pp.some(([k, v]) => k === 'ed' && v === '2048'), pv);
ok('socks5:// 归为 s 参数', out1.some(l => api.parseNode(l).pp.some(([k, v]) => k === 's' && v === 'socks5://u:p@11.3.3.3:1080')));
ok('命名模板生效（含备注 HK）', out1.some(l => decodeURIComponent(api.parseNode(l).name) === 'WS节点-HK-11.2.2.2'));
ok('base64 订阅可解码回同一批', Buffer.from(getEl('ob1').value, 'base64').toString('utf8') === out1.join('\n'));
ok('Clash 片段含 ws-opts 且仅 ws', getEl('oc1').value.includes('ws-opts:') && !getEl('oc1').value.includes('xhttp'));
ok('sing-box 片段为合法 JSON', (() => { try { const j = JSON.parse(getEl('os1').value); return Array.isArray(j) && j.length === 6; } catch (e) { return false; } })());
ok('示例 path 提示已输出', getEl('sample1').textContent.includes('/abc'));

/* ========== 2b. 已有参数 = multi 模式 ========== */
sec('2b. ① multi 模式（保留原版 + 改参数版）');
radios.forEach(r => r.checked = r.value === 'list');
const safeParse = l => (l === undefined ? { name: '(无)', pp: [] } : api.parseNode(l));
// 该节点 path 内已有 p 与 s 两个参数（同名不同值即触发 multi 冲突）
const withP = 'vless://uuid-9999@7.7.7.7:443?encryption=none&security=tls&type=ws&path=%2Fm%3Fp%3D1.1.1.1%26s%3Dsocks5%3A%2F%2Fu%3Ap%409.9.9.9%3A1080#老节点';
set('nodes', withP); set('plist', '2.2.2.2\nsocks5://a:b@8.8.8.8:1080');
set('nameTpl', '{name}-{r}-{i}'); set('existMode', 'multi'); set('xhttpMode', 'keep');
set('wk', ''); getEl('rmno').checked = false;
api.genMain();
const outMulti = getEl('ol1').value.split('\n');
// 每个 ProxyIP 一次调用：该 IP 只带一个参数，故只与同名参数冲突 → 原版 + 该参数的新版本
ok('multi 每个 IP 输出 2 条（原版 + 冲突参数的新版本）', outMulti.length === 4, '实际 ' + outMulti.length);
ok('原版原样输出且名称未被改动', outMulti[0] === withP && outMulti[2] === withP, '\n        ' + outMulti[0] + '\n        ' + outMulti[2]);
const vP = safeParse(outMulti[1]);
ok('p 版本写入新 p=2.2.2.2', vP.pp.some(([k, v]) => k === 'p' && v === '2.2.2.2'), JSON.stringify(vP.pp));
ok('p 版本保留原 s 不变', vP.pp.some(([k, v]) => k === 's' && v.includes('9.9.9.9:1080')), JSON.stringify(vP.pp));
const vS = safeParse(outMulti[3]);
ok('s 版本写入新 s（不再回退成原版）', vS.pp.some(([k, v]) => k === 's' && v.startsWith('socks5://a:b')), JSON.stringify(vS.pp));
ok('s 版本保留原 p=1.1.1.1', vS.pp.some(([k, v]) => k === 'p' && v === '1.1.1.1'), JSON.stringify(vS.pp));
ok('原版保持原名，新版本改用命名模板', safeParse(outMulti[0]).name === safeParse(withP).name && decodeURIComponent(vP.name) !== decodeURIComponent(safeParse(outMulti[0]).name),
  [safeParse(outMulti[0]).name, vP.name, vS.name].join(' | '));
ok('两个新版本名称可区分', decodeURIComponent(vP.name) !== decodeURIComponent(vS.name), vP.name + ' | ' + vS.name);
ok('统计提示说明 multi 行为', getEl('stat1').innerHTML.includes('multi'), getEl('stat1').innerHTML);
// 无冲突时应只输出 1 条（不无谓翻倍）
set('nodes', 'vless://uuid-8888@7.7.7.7:443?encryption=none&security=tls&type=ws&path=%2Fm#干净节点');
set('plist', '2.2.2.2'); set('existMode', 'multi');
api.genMain();
ok('无同名参数时 multi 不复制（仅 1 条）', getEl('ol1').value.split('\n').length === 1, '实际 ' + getEl('ol1').value.split('\n').length);
// keep 模式：原有 p 保留
set('existMode', 'keep'); set('nodes', withP); set('plist', '2.2.2.2');
api.genMain();
ok('keep 模式保留原 p=1.1.1.1', safeParse(getEl('ol1').value).pp.some(([k, v]) => k === 'p' && v === '1.1.1.1'), getEl('ol1').value);
// overwrite 模式：覆盖为 2.2.2.2
set('existMode', 'overwrite');
api.genMain();
ok('overwrite 模式覆盖为 p=2.2.2.2', safeParse(getEl('ol1').value).pp.some(([k, v]) => k === 'p' && v === '2.2.2.2'), getEl('ol1').value);
set('existMode', 'keep');

/* ========== 2c. 连接参数写在节点 query 上（回归：曾被静默丢弃） ========== */
sec('2c. 节点 query 层的 p/s（回归测试）');
const linkLvl = 'vless://uuid-7777@7.7.7.7:443?encryption=none&security=tls&type=ws&path=%2Fws&p=1.1.1.1&s=socks5%3A%2F%2Fu%3Ap%401.2.3.4%3A1080#链路层参数';
const parsedLvl = api.parseNode(linkLvl);
ok('p 从节点 query 读入', parsedLvl.pp.some(([k, v]) => k === 'p' && v === '1.1.1.1'), JSON.stringify(parsedLvl.pp));
// 修复点⑤：path 内原本就是百分号编码的值（%26/%3A）不应被再次编码成 %25
const encodedPath = 'vless://uuid-5555@7.7.7.7:443?encryption=none&security=tls&type=ws&path=%2Fm%3Fp%3D1.1.1.1%26s%3Dsocks5%3A%2F%2Fu%3Ap%409.9.9.9%3A1080#%E7%BC%96%E7%A0%81%E5%8F%82%E6%95%B0';
ok('含已编码值的链接往返不变形', api.buildNode(api.parseNode(encodedPath)) === encodedPath,
  '\n        原: ' + encodedPath + '\n        回: ' + api.buildNode(api.parseNode(encodedPath)));
ok('往返后参数值未被双重编码', (() => {
  const pp = api.parseNode(api.buildNode(api.parseNode(encodedPath))).pp;
  return pp.some(([k, v]) => k === 's' && v === 'socks5://u:p@9.9.9.9:1080');
})(), JSON.stringify(api.parseNode(api.buildNode(api.parseNode(encodedPath))).pp));
// 普通用户输入（未编码）仍必须被正确编码
const plainNode = api.parseNode('vless://uuid-4444@7.7.7.7:443?encryption=none&security=tls&type=ws&path=%2Fws#plain');
api.setNodeParams(plainNode, [['p', 'user@1.2.3.4:443']], 'overwrite');
ok('新输入的特殊字符仍被编码写入', api.buildNode(plainNode).includes('p%3Duser%401.2.3.4%3A443'), api.buildNode(plainNode));
ok('s 从节点 query 读入且未被截断', parsedLvl.pp.some(([k, v]) => k === 's' && v === 'socks5://u:p@1.2.3.4:1080'), JSON.stringify(parsedLvl.pp));
ok('往返后不丢参数', (() => {
  const rp = api.parseNode(api.buildNode(parsedLvl)).pp;
  return rp.some(([k, v]) => k === 'p' && v === '1.1.1.1') && rp.some(([k, v]) => k === 's' && v === 'socks5://u:p@1.2.3.4:1080');
})(), api.buildNode(parsedLvl));
// path 与 query 同时存在同名参数时，path 优先
const both = 'vless://uuid-6666@7.7.7.7:443?encryption=none&security=tls&type=ws&path=%2Fws%3Fp%3D9.9.9.9&p=1.1.1.1#冲突';
ok('path 内同名参数优先', api.parseNode(both).pp.some(([k, v]) => k === 'p' && v === '9.9.9.9'), JSON.stringify(api.parseNode(both).pp));
// 导入→编辑器回填时不能丢掉 query 层的 s（② 的用例在下一节重新装载）
set('importArea', linkLvl); getEl('clearBtn').click(); getEl('importBtn').click();
api.openEditor(0);
ok('编辑器回填了 query 层的 s', getEl('edS').value === 'socks5://u:p@1.2.3.4:1080', getEl('edS').value);
ok('编辑器回填了 query 层的 p', getEl('edP').value === '1.1.1.1', getEl('edP').value);
// 复位，避免影响后续小节
getEl('clearBtn').click(); getEl('edCancel').click(); set('importArea', '');

/* ========== 3. 固定节点出口（精确配对） ========== */
sec('3. ① 固定节点出口');
radios.forEach(r => r.checked = r.value === 'line');
set('pairs', cases[0] + ' | 22.1.1.1:443 #JP\n' + cases[1] + ' | p=33.3.3.3&wk=US\n' + cases[2] + '\n' + cases[3] + ' | socks5://u:p@44.4.4.4:1080');
api.genMain();
const out1b = getEl('ol1').value.split('\n');
ok('逐行生成 4 条', out1b.length === 4, '实际 ' + out1b.length);
const b0 = api.parseNode(out1b[0]);
ok('第 1 条配对 p=22.1.1.1:443', b0.pp.some(([k, v]) => k === 'p' && v === '22.1.1.1:443'));
ok('第 1 条命名带备注 JP', decodeURIComponent(b0.name).includes('JP'), b0.name);
const b1 = api.parseNode(out1b[1]);
ok('第 2 条键值对 p+wk 同时写入', b1.pp.some(([k, v]) => k === 'p' && v === '33.3.3.3') && b1.pp.some(([k, v]) => k === 'wk' && v === 'US'));
const b3 = api.parseNode(out1b[3]);
ok('第 4 条识别为 s 代理', b3.pp.some(([k, v]) => k === 's' && v.startsWith('socks5://')), JSON.stringify(b3.pp));
ok('出口留空的节点原样输出', out1b[2] === cases[2]);

/* ========== 4. 入口 IP 自动作为 ProxyIP ========== */
sec('4. ① 入口 IP 自动作为 ProxyIP');
radios.forEach(r => r.checked = r.value === 'self');
set('nodes', cases[0] + '\n' + cases[2]);
api.genMain();
const out1c = getEl('ol1').value.split('\n');
ok('ws 节点生成 1 条', out1c.length === 2, '实际 ' + out1c.length);
ok('p = 自身入口 1.2.3.4:443', api.parseNode(out1c[0]).pp.some(([k, v]) => k === 'p' && v === '1.2.3.4:443'), JSON.stringify(api.parseNode(out1c[0]).pp));

/* ========== 5. ② 导入 / 编辑 / 导出 ========== */
sec('5. ② 节点管理');
set('importArea', cases[0] + '\n' + cases[1] + '\n' + cases[2] + '\nss://x@1.1.1.1:443');
getEl('importBtn').click();   // 走真实事件绑定
ok('导入 3 条 VLESS/Trojan，忽略 ss', getEl('stat2').innerHTML.includes('导入 3 条'), getEl('stat2').innerHTML);
ok('重复导入按链接去重', (() => { set('importArea', cases[0]); getEl('importBtn').click(); return api.nodeList().length === 3; })(), '列表 ' + api.nodeList().length + ' 条');
api.openEditor(0);
ok('编辑器回填 path（含参数）', getEl('edPath').value.startsWith('/abc?ed=2048'), getEl('edPath').value);
ok('编辑器回填 p（空）', getEl('edP').value === '');
// 填入 p，比较预览与实际保存结果是否完全一致
set('edP', '55.5.5.5:8443'); set('edExist', 'keep');
api.updatePreview();
const previewLink = getEl('prevNew').dataset.link;
api.saveEditor();
const savedLink = api.buildNode(api.nodeList()[0]);
ok('实时预览 === 保存结果', previewLink === savedLink, '\n        预览: ' + previewLink + '\n        保存: ' + savedLink);
ok('保存后 p 已写入', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '55.5.5.5:8443'));
// 二次编辑：已有参数 + 保留模式
api.openEditor(0);
set('edP', '66.6.6.6'); set('edExist', 'keep');
api.updatePreview(); api.saveEditor();
ok('keep 模式保留旧 p=55.5.5.5:8443', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '55.5.5.5:8443'), JSON.stringify(api.nodeList()[0].pp));
// 覆盖模式
api.openEditor(0);
set('edP', '66.6.6.6'); set('edExist', 'overwrite');
api.updatePreview(); api.saveEditor();
ok('overwrite 模式覆盖为 p=66.6.6.6', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '66.6.6.6'), JSON.stringify(api.nodeList()[0].pp));
// 清空参数应删除该键
api.openEditor(0);
set('edP', ''); set('edExist', 'overwrite');
api.updatePreview(); api.saveEditor();
ok('清空 p 后该键被移除', !api.nodeList()[0].pp.some(([k]) => k === 'p'), JSON.stringify(api.nodeList()[0].pp));
// 导出
api.exportSelected();
ok('导出全部 3 条（未勾选时）', getEl('ol2').value.split('\n').length === 3, getEl('stat2').innerHTML);
// 修复点④：带特殊字符时，预览展示的编码值必须等于链接里真实写入的 path 编码值
api.openEditor(0);
set('edP', 'user@1.2.3.4:443'); set('edExist', 'overwrite');
api.updatePreview();
const previewLink0 = getEl('prevNew').dataset.link;
const shownEnc = api.getqOf(previewLink0, 'path');      // 链接中真实写入的 path 编码值
const inPreview = getEl('prevEnc').textContent;
ok('预览编码行 === 链接中真实 path 编码值', inPreview.includes(shownEnc), '\n        预览行: ' + inPreview + '\n        链接值: ' + shownEnc);
api.saveEditor();
const savedEnc = api.nodeList()[0].pp.map(([k, v]) => k + '=' + v).join('&');
ok('带 @/特殊字符的参数不丢字符', savedEnc.includes('user@1.2.3.4:443'), savedEnc);
ok('编码后的链接可被重新解析回原值', api.parseNode(api.buildNode(api.nodeList()[0])).pp.some(([k, v]) => k === 'p' && v === 'user@1.2.3.4:443'), api.buildNode(api.nodeList()[0]));

/* ========== 6. ② 批量应用到所选 ========== */
sec('6. ② 批量应用到所选');
set('importArea', cases[0] + '\n' + cases[1] + '\n' + cases[3]);
getEl('clearBtn').click();
getEl('importBtn').click();
ok('清空+重新导入后 3 条', api.nodeList().length === 3, '实际 ' + api.nodeList().length);
rowchks.length = 0;                                   // 表格已随 clear/import 重建，丢弃旧行引用
// 勾选前两条
const chk1 = mkEl('c1'), chk2 = mkEl('c2');
chk1.dataset.i = '0'; chk2.dataset.i = '1'; chk1.checked = true; chk2.checked = true;
rowchks.push(chk1, chk2);
// 至少一项参数的校验（已勾选，故应给出参数提示）
getEl('bP').value = ''; set('bS', ''); set('bWk', '');
getEl('bApply').click();
ok('未填参数时提示', getEl('stat2').innerHTML.includes('至少填一项'), getEl('stat2').innerHTML);
// 批量覆盖
set('bP', '77.7.7.7:443'); set('bWk', 'hk'); getEl('bRm').checked = true; set('bExist', 'overwrite');
getEl('bApply').click();
ok('已应用到 2 条', getEl('stat2').innerHTML.includes('已应用到 2 条'), getEl('stat2').innerHTML);
ok('第 1 条写入 p=77.7.7.7:443', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '77.7.7.7:443'), JSON.stringify(api.nodeList()[0].pp));
ok('wk 自动大写为 HK', api.nodeList()[0].pp.some(([k, v]) => k === 'wk' && v === 'HK'), JSON.stringify(api.nodeList()[0].pp));
ok('rm=no 已写入', api.nodeList()[0].pp.some(([k, v]) => k === 'rm' && v === 'no'));
ok('未勾选的第 3 条未被改动', api.nodeList()[2].pp.length === 0, JSON.stringify(api.nodeList()[2].pp));
// keep 模式不覆盖已有
set('bP', '88.8.8.8'); getEl('bWk').value = ''; getEl('bRm').checked = false; set('bExist', 'keep');
getEl('bApply').click();
ok('keep 模式保留 p=77.7.7.7:443', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '77.7.7.7:443'), getEl('stat2').innerHTML);
// copy 模式生成新节点
const before = api.nodeList().length;
set('bP', '99.9.9.9'); set('bExist', 'copy');
getEl('bApply').click();
ok('copy 模式新增副本', api.nodeList().length === before + 2, '前 ' + before + ' → 后 ' + api.nodeList().length);
ok('副本带新参数', api.nodeList().slice(before).every(n => n.pp.some(([k, v]) => k === 'p' && v === '99.9.9.9')));

/* ========== 7. ③ 订阅参数 ========== */
sec('7. ③ 订阅参数生成');
set('subs', 'https://w.example.com/UUID/sub');
set('plist3', '1.1.1.1 #HK\n2.2.2.2 #US');
set('pkey3', 'auto'); set('target', 'clash');
getEl('gen3').onclick();
let subLines = getEl('ol3').value.split('\n');
ok('生成 2 条订阅', subLines.length === 2, '实际 ' + subLines.length);
ok('URL 形如 ?p=1.1.1.1&target=clash', subLines[0].includes('?p=1.1.1.1&target=clash'), subLines[0]);
ok('标签进入行首', subLines[0].startsWith('cfnew-HK'));

// 修复点①：「标签 | 参数」显式键
set('plist3', 'HK | p=1.1.1.1');
set('target', '');
getEl('gen3').onclick();
const one = getEl('ol3').value.split('\n')[0];
ok('「标签 | 参数」不再被整串编码进值', !one.includes('HK%20%7C') && !one.includes('p%3D'), one);
ok('显式键 p 生效', one.includes('?p=1.1.1.1'), one);
ok('标签 HK 进入行首', one.startsWith('cfnew-HK  '), one);
// 附加参数 + target 输入框合并
set('plist3', 'US | p=2.2.2.2&wk=JP');
set('target', 'clash');
getEl('gen3').onclick();
const two = getEl('ol3').value.split('\n')[0];
ok('附加 wk=JP 已带上', two.includes('&wk=JP'), two);
ok('target 输入框未被覆盖', two.includes('&target=clash'), two);
ok('统计提示标明显式键条数', getEl('stat3').innerHTML.includes('显式指定了键'), getEl('stat3').innerHTML);
// 自动识别仍然可用（无 | 时）
set('plist3', 'socks5://u:p@1.2.3.4:1080');
set('target', '');
getEl('gen3').onclick();
ok('无标签时仍自动识别为 s', getEl('ol3').value.includes('?s=socks5'), getEl('ol3').value);
// 下拉框强制键
set('plist3', '1.1.1.1');
set('pkey3', 'wk');
getEl('gen3').onclick();
ok('下拉框强制键 wk 生效', getEl('ol3').value.includes('?wk=1.1.1.1'), getEl('ol3').value);
set('pkey3', 'auto');

/* ========== 8. ④ ProxyIP 测试辅助 ========== */
sec('8. ④ ProxyIP 整理');
set('tplist', '1.2.3.4:443 #HK\n5.6.7.8:8443 #US\n1.2.3.4:443');
set('tPrefix', 'CF');
getEl('genT').onclick();
ok('纯 ip:port 列表去重后 2 条', getEl('tIps').value.split('\n').length === 2, getEl('tIps').value);
ok('名称对照表带前缀', getEl('tNames').value.startsWith('CF-HK'), getEl('tNames').value);
getEl('toBatch').onclick();
ok('「去批量生成」回填了 plist', getEl('plist').value.includes('1.2.3.4:443'));

/* ========== 9. 复制按钮 / 剪贴板 ========== */
sec('9. 剪贴板绑定');
const before9 = writes.length;
getEl('copyL1').onclick(); getEl('copyB1').onclick(); getEl('copyC1').onclick(); getEl('copyS1').onclick();
getEl('copyL2').onclick(); getEl('copyB2').onclick(); getEl('copyC2').onclick(); getEl('copyS2').onclick();
getEl('copyL3').onclick();
ok('9 个复制按钮均写入剪贴板', writes.length - before9 === 9, '实际 ' + (writes.length - before9));
ok('复制内容非空', writes.slice(before9).every(w => w && w.length > 0));

console.log('\n================ 结果: PASS ' + pass + ' / FAIL ' + fail + ' ================');
process.exit(fail ? 1 : 0);
