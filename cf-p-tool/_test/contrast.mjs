// WCAG 对比度审计：把工具里实际用到的「文字色 / 背景色」组合逐一算对比度
const hex = h => {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const lum = rgb => {
  const [r, g, b] = rgb.map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (fg, bg) => {
  const a = lum(hex(fg)), b = lum(hex(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};
// 混合半透明文字到背景上的近似结果（用于 rgba 文字）
const blend = (fg, bg, alpha) => {
  const f = hex(fg), b = hex(bg);
  const mix = f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
};

// 主题变量
const V = {
  bg: '#0b0f14', surface: '#111823', surface2: '#161f2d', surface3: '#1c2738',
  border: '#233044', fg: '#e6edf6', fgDim: '#9fb0c6', fgMute: '#8698ae',
  accent: '#5b9dff', ok: '#4ade80', warn: '#fbbf24', danger: '#f87171',
  code: '#a9c8ff', sample: '#9ec1ff', tag: '#8fbcff', inputBg: '#0d131c',
  selBg: '#1d2c45', btnFg: '#06101f', hdrBg: '#161f2d',
  placeholder: '#7b8ba0', offInput: '#0a0f16', offText: '#7f8ea3', offPlaceholder: '#75859b',
};

// [说明, 前景, 背景, 最小字号类别]
const pairs = [
  ['正文 / 页面底', V.fg, V.bg, 'normal'],
  ['正文 / 卡片面', V.fg, V.surface, 'normal'],
  ['次级文字(fg-dim) / 页面底', V.fgDim, V.bg, 'normal'],
  ['次级文字(fg-dim) / 卡片面', V.fgDim, V.surface, 'normal'],
  ['次级文字(fg-dim) / 输入框底', V.fgDim, V.inputBg, 'normal'],
  ['弱化文字(fg-mute) / 页面底', V.fgMute, V.bg, 'normal'],
  ['弱化文字(fg-mute) / 卡片面', V.fgMute, V.surface, 'normal'],
  ['提示 .hint(fg-mute) / 卡片面', V.fgMute, V.surface, 'normal'],
  ['提示 .hint / 输入框底', V.fgMute, V.inputBg, 'normal'],
  ['统计 .stat(fg-dim) / 卡片面', V.fgDim, V.surface, 'normal'],
  ['面板标题 h2(fg) / 卡片面', V.fg, V.surface, 'normal'],
  ['步骤 .step(accent) / 卡片面', V.accent, V.surface, 'normal'],
  ['accent / 页面底', V.accent, V.bg, 'normal'],
  ['成功 b.ok / 卡片面', V.ok, V.surface, 'normal'],
  ['警告 b.skip / 卡片面', V.warn, V.surface, 'normal'],
  ['危险按钮文字 / surface3', V.danger, V.surface3, 'normal'],
  ['主按钮文字 / accent', V.btnFg, V.accent, 'normal'],
  ['标签 .tag / surface', V.tag, V.surface, 'normal'],
  ['代码 code / surface3', V.code, V.surface3, 'normal'],
  ['示例 .sample / inputBg', V.sample, V.inputBg, 'normal'],
  ['等宽预览 .prev / inputBg', V.sample, V.inputBg, 'normal'],
  ['表头 th(fg-dim) / surface2', V.fgDim, V.surface2, 'normal'],
  ['表格正文(fg) / 卡片面', V.fg, V.surface, 'normal'],
  ['输入框文字 / 输入框底', V.fg, V.inputBg, 'normal'],
  ['placeholder / 输入框底', V.placeholder, V.inputBg, 'normal'],
  ['placeholder / 页面底', V.placeholder, V.bg, 'normal'],
  ['导航未选中(fg-dim) / sidebar', V.fgDim, '#0e141d', 'normal'],
  ['导航选中(fg=白) / selBg', '#ffffff', V.selBg, 'normal'],
  ['编辑器字段名(fg-dim) / 编辑器底', V.fgDim, V.surface, 'normal'],
  ['侧栏副标题 / sidebar', V.fgMute, '#0e141d', 'normal'],
  ['禁用输入文字 / 禁用输入底', V.offText, V.offInput, 'normal'],
  ['禁用输入 placeholder / 禁用输入底', V.offPlaceholder, V.offInput, 'normal'],
  ['禁用态字段名 fg-mute / 卡片面', V.fgMute, V.surface, 'normal'],
  ['预览旧值(fg-dim) / 预览底', V.fgDim, V.inputBg, 'normal'],
  ['底部详解正文(fg-dim) / 卡片面', V.fgDim, V.surface, 'normal'],
  ['下拉选项文字 / surface2', V.fg, V.surface2, 'normal'],
];

const AA_NORMAL = 4.5, AA_LARGE = 3.0;
console.log('说明'.padEnd(34) + '对比度   判定');
console.log('-'.repeat(62));
const bad = [];
for (const [label, fg, bg, kind] of pairs) {
  const r = ratio(fg, bg);
  const need = kind === 'large' ? AA_LARGE : AA_NORMAL;
  const pass = r >= need;
  const near = !pass && r >= need - 0.5;
  if (!pass) bad.push([label, fg, bg, r.toFixed(2), near ? '接近' : '不足']);
  console.log(label.padEnd(32) + r.toFixed(2).padStart(6) + '   ' + (pass ? '✓ AA' : (near ? '~ 略低' : '✗ 不达标')));
}
console.log('\n不达标组合（' + bad.length + ' 个）:');
for (const [l, fg, bg, r, tag] of bad) console.log(`  ${tag === '接近' ? '~' : '✗'} ${l}  ${fg} on ${bg}  = ${r}`);
console.log(bad.length === 0 ? '\n结论: 全部组合满足 WCAG AA（正文 4.5:1）' : `\n结论: ${bad.length} 组低于 AA`);
process.exit(bad.length ? 1 : 0);
