// 生成一份测试用 Clash 配置，便于手工检查 / 喂给 checkclash.mjs
// 用法: node gencfg.mjs [输出路径]     默认写到系统临时目录
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = import.meta.dirname;
const htmlPath = path.join(here, '..', 'index.html');
const outPath = process.argv[2] || path.join(os.tmpdir(), 'cf-clash.yaml');

const code = fs.readFileSync(htmlPath, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

const els = new Map();
const mk = id => ({ id, value: '', textContent: '', innerHTML: '', checked: false, disabled: false, dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, focus() {}, scrollIntoView() {}, open: false });
const get = id => { if (!els.has(id)) els.set(id, mk(id)); return els.get(id); };
const document = {
  getElementById: get,
  querySelector: () => ({ value: 'list', checked: true, click() {} }),
  querySelectorAll: () => [],
  createElement: () => mk('d'),
  body: { appendChild() {}, removeChild() {} },
};
const api = new Function('document', 'navigator', 'console', 'window', 'atob', 'btoa',
  code + ';return {genMain,generateClashConfig};')(
  document, {}, console, { confirm: () => true }, globalThis.atob, globalThis.btoa);

// 固定用例：两种 ws 节点 + 一条 xhttp（用于验证 xhttp 会被跳过）
const cases = [
  'vless://uuid-1111@1.2.3.4:443?encryption=none&security=tls&sni=a.example.com&type=ws&host=a.example.com&path=%2Fabc%3Fed%3D2048#WS节点',
  'trojan://pass%40word@5.6.7.8:8443?security=tls&sni=b.example.com&type=ws&host=b.example.com&path=%2Ftrojan#TJ',
  'vless://uuid-3333@[2001:db8::1]:443?encryption=none&security=tls&type=xhttp&path=%2Fx&mode=stream-one&sni=c.example.com#XHTTP',
];
get('nodes').value = cases.join('\n');
get('plist').value = '11.1.1.1:443\n11.2.2.2:8443 #HK';
get('nameTpl').value = '{name}-{r}-{i}';
get('existMode').value = 'keep';
get('xhttpMode').value = 'keep';
get('wk').value = '';

api.genMain();
api.generateClashConfig();

const yaml = get('ocf1').value;
fs.writeFileSync(outPath, yaml, 'utf8');
console.log('已写出 ' + outPath + '（' + yaml.length + ' 字符）');
console.log(get('clashFullStat').innerHTML.replace(/<[^>]+>/g, '').trim());
console.log('提示: 可用 node checkclash.mjs "' + outPath + '" 校验结构');
