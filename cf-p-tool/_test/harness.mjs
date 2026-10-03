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
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._s.has(c) : !!force;
        if (on) this._s.add(c); else this._s.delete(c);
        return on;
      },
    },
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
let confirmAnswer = true;                     // 测试里可切换的确认框返回值
const window = { confirm: () => confirmAnswer };

/* ---------------- 执行被测代码 ---------------- */
const ctx = { document, navigator, console, window, atob: globalThis.atob, btoa: globalThis.btoa, Blob: class {}, URL: globalThis.URL, encodeURIComponent, decodeURIComponent };
const api = new Function(...Object.keys(ctx), code + '\n;return {parseNode,buildNode,setNodeParams,cloneNode,classify,makeName,parseList,parseListSig,parseNodesInput,genMain,openEditor,editorToNode,updatePreview,saveEditor,exportSelected,genSub,genTest,toBatch,renderTable,getqOf,generateClashConfig,selIds,setNodeQ,syncPathParam,replaceValue,selfProxyValue,nodeList:()=>nodeList};')(...Object.values(ctx));

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
// copyText 走 Promise，回调在微任务里执行
await new Promise(r => setTimeout(r, 0));
ok('9 个复制按钮均写入剪贴板', writes.length - before9 === 9, '实际 ' + (writes.length - before9));
ok('复制内容非空', writes.slice(before9).every(w => w && w.length > 0));
ok('复制成功后有反馈提示', getEl('stat2').innerHTML.includes('已复制到剪贴板'), getEl('stat2').innerHTML);
// 非安全上下文（file:// 或 http）：navigator.clipboard 不存在，点击不得抛错
{
  const els2 = new Map();
  const get2 = id => { if (!els2.has(id)) els2.set(id, mkEl(id)); return els2.get(id); };
  const document2 = {
    getElementById: get2,
    querySelector: () => ({ value: 'list', checked: true, click() {} }),
    querySelectorAll: () => [],
    createElement: () => mkEl('d'),
    body: { appendChild() {}, removeChild() {} },   // execCommand 兜底路径需要
  };
  const api2 = new Function('document', 'navigator', 'console', 'atob', 'btoa',
    code + ';return {genMain};')(document2, {}, console, globalThis.atob, globalThis.btoa);
  get2('nodes').value = cases[0]; get2('plist').value = '11.1.1.1';
  get2('nameTpl').value = '{name}'; get2('existMode').value = 'keep'; get2('xhttpMode').value = 'keep'; get2('wk').value = '';
  get2('gen1').onclick();
  let err = null;
  try { get2('copyL1').onclick(); get2('dl1'); } catch (e) { err = e.message; }
  ok('无 navigator.clipboard 时复制不抛错（降级处理）', !err, '抛错：' + err);
  ok('降级后仍给出可读提示', /已复制|不允许自动复制|没有可复制/.test(get2('stat1').innerHTML), get2('stat1').innerHTML);
}

/* ========== 10. Clash 订阅链接与完整配置 ========== */
sec('10. Clash 订阅');
// 客户端类型默认 clash；基地址未带 /sub 且无 target 时应自动补 /sub
set('subs', 'https://w.example.com/UUID');
set('plist3', '1.1.1.1 #HK');
set('pkey3', 'auto'); set('target', ''); set('clientType', 'clash');
getEl('gen3').click();
let s = getEl('ol3').value.split('\n')[0];
ok('未带 /sub 时自动补全', s.includes('/UUID/sub?'), s);
ok('自动带上 target=clash', s.includes('target=clash'), s);
// 已是 /sub 结尾：不应重复补
set('subs', 'https://w.example.com/UUID/sub');
getEl('gen3').click();
s = getEl('ol3').value.split('\n')[0];
ok('/sub 结尾不重复补', (s.match(/\/sub/g) || []).length === 1, s);
// 参数里已显式带 target：不应再追加一个
set('subs', 'https://w.example.com/UUID/sub');
set('plist3', 'US | p=2.2.2.2&target=stash');
getEl('gen3').click();
s = getEl('ol3').value.split('\n')[0];
ok('显式 target 不被覆盖', s.includes('target=stash') && !s.includes('target=clash'), s);
// 客户端类型切到 sing-box
set('plist3', '1.1.1.1 #HK'); set('clientType', 'singbox'); set('target', '');
getEl('gen3').click();
ok('客户端类型 singbox 生效', getEl('ol3').value.includes('target=singbox'), getEl('ol3').value);
// target 输入框可覆盖下拉选择
set('clientType', 'clash'); set('target', 'surge');
getEl('gen3').click();
ok('target 输入框覆盖下拉', getEl('ol3').value.includes('target=surge'), getEl('ol3').value);
set('target', '');
// 「只要 Clash 订阅」按钮
set('clientType', 'singbox');
getEl('clashOnly').click();
ok('Clash 快捷按钮切回 clash 并生成', getEl('clientType').value === 'clash' && getEl('ol3').value.includes('target=clash'), getEl('ol3').value);

sec('10b. 完整 Clash 配置');
set('clashLevel', 'full');                 // 桩里 select 默认是空串，需显式指定
radios.forEach(r => r.checked = r.value === 'list');
set('nodes', cases[0] + '\n' + cases[1] + '\n' + cases[2]);   // 2 条 ws + 1 条 xhttp
set('plist', '11.1.1.1'); set('existMode', 'keep'); set('xhttpMode', 'keep');
set('wk', ''); getEl('rmno').checked = false;
getEl('gen1').click();
getEl('genClash1').click();
const cfg = getEl('ocf1').value;
ok('完整配置已生成', cfg.length > 200, '长度 ' + cfg.length);
for (const key of ['mixed-port:', 'dns:', 'proxies:', 'proxy-groups:', 'rules:']) {
  ok('包含 ' + key, cfg.includes(key));
}
ok('配置里含 2 个 ws 代理', (cfg.match(/^  type: vless$|^  type: trojan$/gm) || []).length === 2, '实际 ' + (cfg.match(/^  type: (vless|trojan)$/gm) || []).length);
ok('xhttp 节点被跳过并提示', getEl('clashFullStat').innerHTML.includes('跳过 1 条非 WS'), getEl('clashFullStat').innerHTML);
ok('proxy-groups 引用了节点名', cfg.includes('proxy-groups:') && cfg.includes('type: select'));
ok('规则以 MATCH 收尾', /- MATCH,/.test(cfg), cfg.split('\n').slice(-2).join(' | '));
ok('fake-ip 与 DNS 配置齐备', cfg.includes('enhanced-mode: fake-ip') && cfg.includes('default-nameserver:'));
// 完整级别的规模：应与 Worker 端 ?target=clash 的输出同构
ok('完整级别含 14 个策略组', (cfg.match(/^  - name:/gm) || []).length === 14, '实际 ' + (cfg.match(/^  - name:/gm) || []).length);
ok('完整级别含 14 条 rule-providers', (cfg.match(/^    type: http$/gm) || []).length === 14, '实际 ' + (cfg.match(/^    type: http$/gm) || []).length);
ok('完整级别含 52 条规则', (cfg.match(/^  - (DOMAIN|IP-CIDR|GEOIP|MATCH|RULE-SET)/gm) || []).length === 52, '实际 ' + (cfg.match(/^  - (DOMAIN|IP-CIDR|GEOIP|MATCH|RULE-SET)/gm) || []).length);
ok('完整级别含 geox-url 与 sniffer', cfg.includes('geox-url:') && cfg.includes('sniffer:'));
ok('规则集指向 jsDelivr', cfg.includes('fastly.jsdelivr.net/gh/Loyalsoldier/clash-rules@release'), '');
ok('含各类应用策略组', ['🌍 国外媒体', '📺 哔哩哔哩', '📹 油管视频', '🎬 奈飞视频', '🌐 谷歌服务', '🤖 OpenAI', 'Ⓜ️ 微软服务', '🍎 苹果服务', '🍃 应用净化']
  .every(n => cfg.includes('- name: "' + n + '"')), '缺少分组');
// 精简级别
set('clashLevel', 'slim');
getEl('genClash1').click();
const slim = getEl('ocf1').value;
ok('精简级别只有 4 个策略组', (slim.match(/^  - name:/gm) || []).length === 4, '实际 ' + (slim.match(/^  - name:/gm) || []).length);
ok('精简级别无 rule-providers', !slim.includes('rule-providers:'), '');
ok('精简级别不依赖外部规则集', !slim.includes('jsdelivr'), '');
ok('精简级别仍有 DNS 与 fake-ip', slim.includes('enhanced-mode: fake-ip') && slim.includes('nameserver:'));
ok('提示区分完整/精简', getEl('clashFullStat').innerHTML.includes('精简'), getEl('clashFullStat').innerHTML);
set('clashLevel', 'full');
getEl('genClash1').click();
// 无输出时应给出提示而不是生成空配置
set('ol1', '');
getEl('genClash1').click();
ok('无输出时提示且不生成', getEl('ocf1').value === '' && getEl('clashFullStat').innerHTML.includes('请先'), getEl('clashFullStat').innerHTML);

/* ========== 11. Clash YAML 导入 / 编辑 / 写回 ========== */
sec('11. Clash YAML 导入与写回');
const SAMPLE_YAML = [
  '# 我的 Clash 配置（注释必须保留）',
  'mixed-port: 7890',
  'mode: rule',
  'dns:',
  '  enable: true',
  '  nameserver:',
  '    - 223.5.5.5',
  '',
  'proxies:',
  '- name: "节点A"',
  '  type: vless',
  '  server: 1.2.3.4',
  '  port: 443',
  '  uuid: uuid-aaaa',
  '  udp: true',
  '  tls: true',
  '  servername: "a.example.com"',
  '  network: ws',
  '  ws-opts:',
  '    path: "/abc?ed=2048&p=1.1.1.1%3A443"',
  '    headers:',
  '      Host: "a.example.com"',
  '- name: "节点B"',
  '  type: trojan',
  '  server: 5.6.7.8',
  '  port: 8443',
  '  password: "pw"',
  '  tls: true',
  '  network: ws',
  '  ws-opts:',
  '    path: "/tj"',
  '- name: "机场SS"',
  '  type: ss',
  '  server: 9.9.9.9',
  '  port: 8388',
  '  cipher: aes-256-gcm',
  '  password: "sspw"',
  '',
  'proxy-groups:',
  '  - name: "🚀 节点选择"',
  '    type: select',
  '    proxies:',
  '      - "节点A"',
  '      - "节点B"',
  '      - "机场SS"',
  '',
  'rules:',
  '  - MATCH,🚀 节点选择',
  ''
].join('\n');

set('importArea', SAMPLE_YAML);
getEl('clearBtn').click();
getEl('importBtn').click();
ok('识别为 Clash 配置并导入 2 条可编辑节点', api.nodeList().length === 2, '导入 ' + api.nodeList().length + ' 条：' + getEl('stat2').innerHTML);
ok('非 VLESS/Trojan 被提示原样保留', getEl('stat2').innerHTML.includes('原样保留'), getEl('stat2').innerHTML);
ok('写回区已显示', getEl('clashOutBox').style.display === '');

const n0 = api.nodeList()[0];
ok('解析出 p 参数', n0.pp.some(([k, v]) => k === 'p' && v === '1.1.1.1:443'), JSON.stringify(n0.pp));
ok('解析出 ws path 前缀', n0.pPath === '/abc', n0.pPath);
ok('解析出 Host 头', n0.host === 'a.example.com', n0.host);
ok('解析出 SNI', n0.sni === 'a.example.com', n0.sni);
ok('trojan 密码解析正确', api.nodeList()[1].auth === 'pw', api.nodeList()[1].auth);

// 未改动直接写回：proxies 以外的内容必须逐字节一致
getEl('clashExport').click();
const roundTrip = getEl('clashOut').value;
const keptHead = SAMPLE_YAML.slice(0, SAMPLE_YAML.indexOf('proxies:'));
ok('注释与 dns 区块原样保留', roundTrip.startsWith(keptHead), '\n        期望开头: ' + JSON.stringify(keptHead));
ok('proxy-groups 及之后原样保留', roundTrip.includes('proxy-groups:\n  - name: "🚀 节点选择"'), '');
ok('rules 原样保留', roundTrip.trimEnd().endsWith('- MATCH,🚀 节点选择'), JSON.stringify(roundTrip.slice(-40)));
ok('ss 节点按原文保留', roundTrip.includes('type: ss') && roundTrip.includes('cipher: aes-256-gcm'));
// 策略组仍引用着原有名字，写回后引用不应断裂
ok('写回后节点名未变（引用不断裂）', roundTrip.includes('- name: "节点A"') && roundTrip.includes('- name: "节点B"'));

// 编辑后写回
api.openEditor(0);
set('edP', '2.2.2.2:8443'); set('edExist', 'overwrite');
api.updatePreview(); api.saveEditor();
getEl('clashExport').click();
const edited = getEl('clashOut').value;
ok('编辑后的 p 已写回 YAML', edited.includes('p=2.2.2.2%3A8443'), edited.match(/path: "[^"]*"/)?.[0]);
ok('编辑后其余区块仍不变', edited.startsWith(keptHead) && edited.trimEnd().endsWith('- MATCH,🚀 节点选择'));
ok('编辑后 YAML 仍可被重新导入', (() => {
  set('importArea', edited); getEl('clearBtn').click(); getEl('importBtn').click();
  const again = api.nodeList();
  return again.length === 2 && again[0].pp.some(([k, v]) => k === 'p' && v === '2.2.2.2:8443');
})(), '二次导入结果 ' + api.nodeList().length + ' 条');
// 清空后应恢复原状
getEl('clearBtn').click();
getEl('clashExport').click();
ok('清空后导出提示需先导入', getEl('clashOutStat').innerHTML.includes('还没有导入过'), getEl('clashOutStat').innerHTML);

// 普通链接导入不应触发 Clash 写回
set('importArea', cases[0]);
getEl('importBtn').click();
getEl('clashExport').click();
ok('链接导入不误判为 Clash', getEl('clashOutStat').innerHTML.includes('还没有导入过'), getEl('clashOutStat').innerHTML);

/* ========== 12. YAML 节点 → ① 「入口 IP 自动作为 ProxyIP」 ========== */
sec('12. YAML 节点送入 ① 的入口自反代模式');
set('importArea', SAMPLE_YAML);
getEl('clearBtn').click();
getEl('importBtn').click();
ok('YAML 已导入 2 条', api.nodeList().length === 2, '实际 ' + api.nodeList().length);
// 直接粘 YAML 到 ① 是不行的（这是设计现状，先固化行为）
set('nodes', SAMPLE_YAML); set('plist', '');
radios.forEach(r => r.checked = r.value === 'self');
getEl('gen1').click();
ok('把 YAML 原样贴进 ① 会被拒绝（提示忽略非链接行）', getEl('out1').style.display === 'none' && getEl('stat1').innerHTML.includes('忽略非 VLESS/Trojan'), getEl('stat1').innerHTML);
// 用桥接按钮送过去
getEl('sendToBatch2').click();
const bridged = getEl('nodes').value.split('\n').filter(Boolean);
ok('桥接后 ① 收到 2 条链接', bridged.length === 2, '实际 ' + bridged.length + '：' + bridged[0]);
ok('桥接后的链接是合法 vless/trojan', bridged.every(l => /^(vless|trojan):\/\//.test(l)), bridged.join(' | '));
ok('桥接保留了 uuid 与 sni', bridged[0].includes('uuid-aaaa') && bridged[0].includes('a.example.com'), bridged[0]);
ok('桥接保留了 path 内的 p 参数', decodeURIComponent(bridged[0]).includes('p=1.1.1.1:443'), decodeURIComponent(bridged[0]));
ok('桥接保留了 Host', bridged[0].includes('host=a.example.com'), bridged[0]);
// 桥接后 self 模式应能正常生成
radios.forEach(r => r.checked = r.value === 'self');
getEl('gen1').click();
const selfOut = getEl('ol1').value.split('\n').filter(Boolean);
ok('self 模式基于 YAML 节点生成 2 条', selfOut.length === 2, '实际 ' + selfOut.length + '：' + getEl('stat1').innerHTML);
// 默认「已有参数=保留」：原本已有 p 的节点不会改，原本没有 p 的节点写入自己的入口
ok('已有 p 的节点在 keep 下不被覆盖', api.parseNode(selfOut[0]).pp.some(([k, v]) => k === 'p' && v === '1.1.1.1:443'), JSON.stringify(api.parseNode(selfOut[0]).pp));
ok('原本无 p 的节点写入自己的入口 IP:端口', api.parseNode(selfOut[1]).pp.some(([k, v]) => k === 'p' && v === '5.6.7.8:8443'), JSON.stringify(api.parseNode(selfOut[1]).pp));
ok('self 模式不会产生重复 p', api.parseNode(selfOut[0]).pp.filter(([k]) => k === 'p').length === 1, JSON.stringify(api.parseNode(selfOut[0]).pp));
ok('原有 ed=2048 未被破坏', api.parseNode(selfOut[0]).pp.some(([k, v]) => k === 'ed' && v === '2048'), JSON.stringify(api.parseNode(selfOut[0]).pp));
// 切到「覆盖」后应改用自己的入口
set('existMode', 'overwrite');
radios.forEach(r => r.checked = r.value === 'self');
getEl('gen1').click();
const selfOut2 = getEl('ol1').value.split('\n').filter(Boolean);
ok('改为覆盖后，p 变成自己的入口 1.2.3.4:443', api.parseNode(selfOut2[0]).pp.some(([k, v]) => k === 'p' && v === '1.2.3.4:443'), JSON.stringify(api.parseNode(selfOut2[0]).pp));
set('existMode', 'keep');

/* ========== 13. 删除 xhttp 后全量导出（回归：曾因越界下标崩溃） ========== */
sec('13. 删除节点后的全量导出');
const MIXED = [
  cases[0], cases[1],
  'vless://uuid-cccc@[2001:db8::1]:443?encryption=none&security=tls&type=xhttp&path=%2Fx&sni=c.example.com#XHTTP-C',
  'vless://uuid-dddd@9.9.9.9:8080?encryption=none&security=none&type=xhttp&path=%2Fy#XHTTP-D',
  cases[3],
];
set('importArea', MIXED.join('\n'));
getEl('clearBtn').click();
getEl('importBtn').click();
ok('导入 5 条（3 ws + 2 xhttp）', api.nodeList().length === 5, '实际 ' + api.nodeList().length);
// 勾选两条 xhttp 并删除
rowchks.length = 0;
[[2], [3]].forEach(([i]) => { const c = mkEl('r' + i); c.dataset.i = String(i); c.checked = true; rowchks.push(c); });
getEl('delSel').click();
ok('删除后剩 3 条', api.nodeList().length === 3, '实际 ' + api.nodeList().length);
ok('删除提示含实际数量与剩余', getEl('stat2').innerHTML.includes('已删除 2 条') && getEl('stat2').innerHTML.includes('剩余 3 条'), getEl('stat2').innerHTML);
// 表格重建后不勾选任何行 → 点界面按钮应导出全部
// 注意：必须走按钮点击，直接调 api.exportSelected() 会掩盖「按钮没绑定」这类问题
rowchks.length = 0;
getEl('exportBtn').click();
ok('导出按钮已绑定到导出逻辑', getEl('out2').style.display === 'block', '导出区未显示，说明按钮没触发');
let ex = getEl('ol2').value.split('\n').filter(Boolean);
ok('未勾选 → 导出全部 3 条', ex.length === 3, '实际 ' + ex.length + '：' + getEl('stat2').innerHTML);
ok('剩下的都是 ws 节点', ex.every(l => !l.includes('xhttp')), ex.join('\n'));
ok('提示说明是「全部」', getEl('stat2').innerHTML.includes('已导出全部'), getEl('stat2').innerHTML);
// 越界下标（删除后残留）不得再导致崩溃
rowchks.length = 0;
[0, 1, 2, 3, 4, 9].forEach(i => { const c = mkEl('x' + i); c.dataset.i = String(i); c.checked = true; rowchks.push(c); });
let crashed = false;
try { getEl('exportBtn').click(); } catch (e) { crashed = true; }
ok('越界下标不再让导出崩溃', !crashed);
ok('越界下标被忽略，仍导出有效行', getEl('ol2').value.split('\n').filter(Boolean).length === 3, getEl('ol2').value);
ok('selIds 过滤越界与重复', api.selIds().length === 3, JSON.stringify(api.selIds()));
// 筛选状态提示
getEl('search').value = 'WS节点';
api.renderTable();
getEl('exportBtn').click();
ok('筛选时提示说明只显示部分', getEl('stat2').innerHTML.includes('当前筛选只显示'), getEl('stat2').innerHTML);
getEl('search').value = '';
api.renderTable();

/* ========== 14. 批量替换 SNI / Host ========== */
sec('14. 批量替换 SNI / Host');
// replaceValue 行为
ok('留空查找 = 整体替换', api.replaceValue('a.old.com', '', 'cdn.new.com') === 'cdn.new.com');
ok('子串替换（全部出现处）', api.replaceValue('a.old.com.old', 'old', 'new') === 'a.new.com.new');
ok('* 通配匹配后缀', api.replaceValue('a.old.com', '*.old.com', 'cdn.new.com') === 'cdn.new.com');
ok('* 通配不匹配时不改动', api.replaceValue('a.keep.com', '*.old.com', 'cdn.new.com') === 'a.keep.com');
ok('空值整体替换可用', api.replaceValue('', '', 'cdn.new.com') === 'cdn.new.com');

// 准备 3 条节点：两条 sni/host 匹配，一条不匹配
const SNI_NODES = [
  'vless://uuid-1@1.2.3.4:443?encryption=none&security=tls&sni=a.old.com&type=ws&host=a.old.com&path=%2Fws1#N1',
  'vless://uuid-2@1.2.3.5:443?encryption=none&security=tls&sni=b.old.com&type=ws&host=b.old.com&path=%2Fws2#N2',
  'vless://uuid-3@1.2.3.6:443?encryption=none&security=tls&sni=keep.com&type=ws&host=keep.com&path=%2Fws3#N3',
];
set('importArea', SNI_NODES.join('\n'));
getEl('clearBtn').click();
getEl('importBtn').click();
ok('导入 3 条', api.nodeList().length === 3, '实际 ' + api.nodeList().length);

// 只替换所选：勾选前两条
rowchks.length = 0;
[0, 1].forEach(i => { const c = mkEl('s' + i); c.dataset.i = String(i); c.checked = true; rowchks.push(c); });
set('sniFind', '*.old.com'); set('sniRepl', 'cdn.new.com');
getEl('sniF1').checked = true; getEl('sniF2').checked = true; confirmAnswer = true;
getEl('bSni').click();
ok('只替换勾选的两条', api.nodeList()[0].sni === 'cdn.new.com' && api.nodeList()[1].sni === 'cdn.new.com', JSON.stringify(api.nodeList().map(n => n.sni)));
ok('未勾选的第三条不动', api.nodeList()[2].sni === 'keep.com', api.nodeList()[2].sni);
ok('Host 同时被替换', api.nodeList()[0].host === 'cdn.new.com' && api.nodeList()[1].host === 'cdn.new.com', JSON.stringify(api.nodeList().map(n => n.host)));
ok('query 数组已同步（链接里生效）', (() => {
  const l = api.buildNode(api.nodeList()[0]);
  return l.includes('sni=cdn.new.com') && l.includes('host=cdn.new.com');
})(), api.buildNode(api.nodeList()[0]));
ok('替换后链接可被重新解析回新值', (() => {
  const rp = api.parseNode(api.buildNode(api.nodeList()[0]));
  return rp.sni === 'cdn.new.com' && rp.host === 'cdn.new.com';
})());
ok('提示含替换条数与范围', getEl('stat2').innerHTML.includes('已替换 2 条') && getEl('stat2').innerHTML.includes('勾选的 2 条'), getEl('stat2').innerHTML);
ok('原本 path 前缀未被破坏', api.parseNode(api.buildNode(api.nodeList()[0])).pPath === '/ws1', api.parseNode(api.buildNode(api.nodeList()[0])).pPath);

// 整体替换（留空查找）作用于全部
rowchks.length = 0;
set('sniFind', ''); set('sniRepl', 'all.example.com');
getEl('bSniAll').click();
ok('替换全部：三条都变成新值', api.nodeList().every(n => n.sni === 'all.example.com' && n.host === 'all.example.com'), JSON.stringify(api.nodeList().map(n => n.sni)));
ok('全部替换提示范围', getEl('stat2').innerHTML.includes('列表全部 3 条'), getEl('stat2').innerHTML);

// 只勾 SNI 不勾 Host
rowchks.length = 0;
[0].forEach(i => { const c = mkEl('t' + i); c.dataset.i = String(i); c.checked = true; rowchks.push(c); });
set('sniFind', 'all.example.com'); set('sniRepl', 'onlysni.example.com');
getEl('sniF1').checked = true; getEl('sniF2').checked = false;
getEl('bSni').click();
ok('只改 SNI 时 Host 保持原值', api.nodeList()[0].sni === 'onlysni.example.com' && api.nodeList()[0].host === 'all.example.com',
  JSON.stringify({ sni: api.nodeList()[0].sni, host: api.nodeList()[0].host }));

// 校验与提示
getEl('sniF1').checked = false; getEl('sniF2').checked = false;
getEl('bSniAll').click();
ok('未勾选范围时给出提示', getEl('stat2').innerHTML.includes('至少勾选一项'), getEl('stat2').innerHTML);
getEl('sniF1').checked = true;
set('sniFind', ''); set('sniRepl', '');
getEl('bSniAll').click();
ok('查找与替换同时为空时提示', getEl('stat2').innerHTML.includes('不能同时为空'), getEl('stat2').innerHTML);
// 匹配不到时不改动
set('sniFind', 'nope.example.com'); set('sniRepl', 'x.example.com');
const beforeSni = api.nodeList().map(n => n.sni).join(',');
getEl('bSniAll').click();
ok('匹配不到时不改动任何节点', api.nodeList().map(n => n.sni).join(',') === beforeSni, api.nodeList().map(n => n.sni).join(','));
ok('匹配不到时给出提示', getEl('stat2').innerHTML.includes('没有节点的 SNI / Host 匹配'), getEl('stat2').innerHTML);
// 部分匹配 + 用户取消 → 不改动（勾选「会命中的第 1 条」与「不会命中的第 2 条」）
rowchks.length = 0;
[0, 1].forEach(i => { const c = mkEl('u' + i); c.dataset.i = String(i); c.checked = true; rowchks.push(c); });
set('sniFind', 'onlysni.example.com'); set('sniRepl', 'changed.example.com');
confirmAnswer = false;
const beforeCancel = api.nodeList().map(n => n.sni).join(',');
getEl('bSni').click();
ok('用户取消后不做改动', api.nodeList().map(n => n.sni).join(',') === beforeCancel, api.nodeList().map(n => n.sni).join(','));
ok('取消后有提示', getEl('stat2').innerHTML.includes('已取消'), getEl('stat2').innerHTML);
// 确认后同样场景应生效
confirmAnswer = true;
getEl('bSni').click();
ok('确认后仅命中那条被替换', api.nodeList()[0].sni === 'changed.example.com' && api.nodeList()[1].sni === 'all.example.com',
  JSON.stringify(api.nodeList().map(n => n.sni)));
confirmAnswer = true;
// 带通配的 path 内参数也应同步
set('importArea', 'vless://uuid-9@1.2.3.4:443?encryption=none&security=tls&type=ws&path=%2Fp%3Fsni%3Dold.com#P1');
getEl('clearBtn').click();
getEl('importBtn').click();
rowchks.length = 0;
set('sniFind', 'old.com'); set('sniRepl', 'new.com');
getEl('sniF1').checked = true; getEl('sniF2').checked = false;
getEl('bSniAll').click();
ok('path 内的同名参数同步更新', (() => {
  const n = api.nodeList()[0];
  return n.pp.some(([k, v]) => k === 'sni' && v === 'new.com') && !n.pp.some(([k, v]) => k === 'sni' && v === 'old.com');
})(), JSON.stringify(api.nodeList()[0].pp));

/* ========== 15. ② 以入口地址作 ProxyIP ========== */
sec('15. ② 以入口地址作 ProxyIP');
set('importArea', MIXED.join('\n'));      // 3 ws + 2 xhttp
getEl('clearBtn').click();
getEl('importBtn').click();
ok('导入 5 条', api.nodeList().length === 5, '实际 ' + api.nodeList().length);

ok('入口地址取值（IPv4）', api.selfProxyValue({ server: '1.2.3.4', port: 443 }) === '1.2.3.4:443');
ok('入口地址取值（IPv6 加方括号）', api.selfProxyValue({ server: '2001:db8::1', port: 443 }) === '[2001:db8::1]:443', api.selfProxyValue({ server: '2001:db8::1', port: 443 }));
ok('入口地址取值（无端口默认 443）', api.selfProxyValue({ server: 'a.com' }) === 'a.com:443', api.selfProxyValue({ server: 'a.com' }));

// 只作用于勾选：勾选第 1、2 条
rowchks.length = 0;
[0, 1].forEach(i => { const c = mkEl('sf' + i); c.dataset.i = String(i); c.checked = true; rowchks.push(c); });
set('bExist', 'overwrite');
getEl('bSelf').click();
ok('勾选的两条写入自身入口', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '1.2.3.4:443') &&
  api.nodeList()[1].pp.some(([k, v]) => k === 'p' && v === '5.6.7.8:8443'),
  JSON.stringify([api.nodeList()[0].pp, api.nodeList()[1].pp]));
ok('未勾选的第三条未被写入', !api.nodeList()[2].pp.some(([k]) => k === 'p'), JSON.stringify(api.nodeList()[2].pp));
ok('提示含条数与范围', getEl('stat2').innerHTML.includes('已把入口地址设为 ProxyIP：2 条') && getEl('stat2').innerHTML.includes('勾选的 2 条'), getEl('stat2').innerHTML);
ok('链接里 p 已生效', api.buildNode(api.nodeList()[0]).includes('p%3D1.2.3.4%3A443'), api.buildNode(api.nodeList()[0]));

// keep 策略保留已有 p
rowchks.length = 0;
const beforeKeep = api.nodeList()[0].pp.find(([k]) => k === 'p')[1];
set('bExist', 'keep');
getEl('bSelf').click();
ok('keep 策略不动已有 p', api.nodeList()[0].pp.find(([k]) => k === 'p')[1] === beforeKeep, JSON.stringify(api.nodeList()[0].pp));
ok('keep 时有保留提示', getEl('stat2').innerHTML.includes('按当前策略保留未改'), getEl('stat2').innerHTML);

// copy 策略复制新节点
rowchks.length = 0;
const cA = mkEl('cq0'); cA.dataset.i = '0'; cA.checked = true; rowchks.push(cA);
const nBefore = api.nodeList().length;
set('bExist', 'copy');
getEl('bSelf').click();
ok('copy 策略复制出新节点', api.nodeList().length === nBefore + 1, '前 ' + nBefore + ' → 后 ' + api.nodeList().length);
ok('copy 提示含复制条数', getEl('stat2').innerHTML.includes('复制新节点 1 条'), getEl('stat2').innerHTML);

// 不勾选 → 作用于全部
rowchks.length = 0;
set('bExist', 'overwrite');
getEl('bSelf').click();
ok('未勾选时作用于全部',
  api.nodeList().every(n => n.pp.some(([k, v]) => k === 'p' && v === (String(n.server).includes(':') ? '[' + n.server + ']' : n.server) + ':' + n.port)),
  JSON.stringify(api.nodeList().map(n => [n.server, n.pp.find(([k]) => k === 'p')?.[1]])));
ok('范围提示为「列表全部」', getEl('stat2').innerHTML.includes('列表全部'), getEl('stat2').innerHTML);
ok('语义警示已给出', getEl('stat2').innerHTML.includes('CF 边缘'), getEl('stat2').innerHTML);

// 与 YAML 导入的节点联动
set('importArea', SAMPLE_YAML);
getEl('clearBtn').click();
getEl('importBtn').click();
rowchks.length = 0;
set('bExist', 'overwrite');
getEl('bSelf').click();
ok('YAML 导入的节点同样适用', api.nodeList()[0].pp.some(([k, v]) => k === 'p' && v === '1.2.3.4:443') &&
  api.nodeList()[1].pp.some(([k, v]) => k === 'p' && v === '5.6.7.8:8443'), JSON.stringify(api.nodeList().map(n => n.pp)));
getEl('clashExport').click();
// YAML 里 path 以「编码成 url 值、再解回 path 形态」写出：? 与 & 是字面量，
// 只有内层参数值保持 %3A 编码（Clash 的 ws-opts.path 正是这个形态）
const clashPaths = getEl('clashOut').value.match(/path: "[^"]*"/g)?.join(' | ');
ok('写回 YAML 时写入的 p 一并生效',
  getEl('clashOut').value.includes('p=1.2.3.4%3A443') && getEl('clashOut').value.includes('p=5.6.7.8%3A8443'), clashPaths);
ok('写回 YAML 后仍保留原有 ed 参数', getEl('clashOut').value.includes('ed=2048'), clashPaths);

console.log('\n================ 结果: PASS ' + pass + ' / FAIL ' + fail + ' ================');
process.exit(fail ? 1 : 0);
