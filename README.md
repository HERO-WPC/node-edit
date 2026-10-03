# cfnew 节点管理助手

给 [cfnew](https://github.com/byJoey/cfnew) 部署的 Cloudflare Worker 配一个顺手的本地工具：批量给节点加 `p`（ProxyIP）/ `s`（SOCKS5）参数、编辑节点、生成各客户端订阅链接。

**纯静态单文件网页，双击即用**，不依赖服务器、不联网、不上传任何数据——所有处理都在你自己的浏览器里完成。

> 在线版：<https://node-edit.pages.dev/cf-p-tool/>
> 本地版：直接双击 `cf-p-tool/index.html`

---

## 这是什么 / 不是什么

**是**：一个「节点链接 / Clash 配置」的批量编辑与生成工具。

**不是**：它不提供任何节点，也不搭建代理。真正的服务端是 [cfnew](https://github.com/byJoey/cfnew)——你需要自己把它部署到 Cloudflare Worker。本仓库不含 cfnew 源码。

---

## 快速开始

1. 打开 `cf-p-tool/index.html`（双击，或用本地服务，见下方）
2. 在 **①** 粘贴你的节点链接和一批反代 IP，点「生成节点」
3. 复制结果导入客户端；或在 **③** 生成 Clash / sing-box / Surge 等订阅链接

工具支持 VLESS 与 Trojan（WS、XHTTP）。

---

## 功能

### ① 批量生成参数节点

给每条节点铺开一批出站参数，用来测速挑最快的反代。

**三种模式**

| 模式 | 作用 |
|---|---|
| 批量测试 ProxyIP | 每条节点 × 每行 ProxyIP 全组合输出 |
| 固定节点出口 | 每行「节点 \| 出口」精确配对，不做组合 |
| 入口 IP 自动作为 ProxyIP | 取节点 `@` 后面的地址:端口，作为它自己的 ProxyIP |

**自动识别 `p` / `s`**：带 `socks5://`、`socks://`、`http(s)://` 前缀或含 `user:pass@` 的归为 `s` 代理，其余（IP、IP:端口、域名、`[IPv6]:端口`）归为 `p` 反代。

**输出**：节点链接、base64 订阅、Clash 片段、sing-box 片段，另外可一键生成**完整 Clash 配置**（可直接导入客户端或存为 `config.yaml`），分两个级别：

| 级别 | 规模 | 说明 |
|---|---|---|
| **完整**（默认） | 360 行 / 14 策略组 / 14 rule-providers / 52 条规则 | 与 Worker 端 `?target=clash` 输出同构：含 `geox-url`、`sniffer`、DNS fallback，规则集走 jsDelivr 拉取 loyalsoldier/clash-rules |
| **精简** | 112 行 / 4 策略组 / 6 条规则 | 不依赖任何外部规则集，适合快速验证或内网环境 |

> 完整级别的规则集文件由客户端首次使用时从 jsDelivr 下载（约 14 个小文件），需要能访问该 CDN。

**命名模板**：`{name}` 原名、`{r}` 备注、`{v}` 参数值、`{i}` IP、`{port}` 端口。

**已有参数冲突时**有三种策略：保留 / 覆盖 / 生成两个版本。选「生成两个版本」时，**原节点保留原名**、新版本套用命名模板，避免客户端里出现两个同名节点分不清。

> ⚠️ 「入口 IP 自动作为 ProxyIP」只在**节点地址本身就是真实入口**时才符合直觉。如果你的节点地址填的是 CF 边缘/优选 IP，出站会再绕一层——那多半不是你要的效果。

### ② 节点管理与编辑

节点进表格，可搜索、按协议/传输筛选、批量改参数、逐字段编辑。

**导入**：`vless://` `trojan://` 链接（多行）、整段 base64 订阅、或**一整份 Clash 配置 YAML**——自动识别，不用切模式。

**批量修改**：`p` / `s` / `wk` / `rm`，三种冲突策略（保留 / 覆盖 / 复制新节点）。

**以入口地址作 ProxyIP**：一键把每条节点 `@` 后的主机:端口设为它自己的 `p`——与 ① 的「入口 IP 自动作为 ProxyIP」同一套逻辑（共用同一处实现），但作用在②的列表上，因此**同样适用于从 Clash YAML 导入的节点**。作用于勾选行（未勾选则全部），沿用「已有参数」策略。

> ⚠️ 与 ① 同一条注意事项：只在节点地址**本身就是真实入口**时才符合直觉；若地址已是 CF 边缘/优选 IP，出站会再绕一层。

**批量替换 SNI / Host**：

| 查找 | 行为 |
|---|---|
| `*.old.com` | `*` 通配，只匹配该后缀 |
| `old.com` | 子串替换（所有出现处） |
| （留空） | 把已有该参数的节点整体设为「替换为」 |

只会处理**本来就有该参数**的节点，不会给没有 SNI 的节点凭空填值；顶层属性、链接 query、`path` 内同名参数三处同步更新。

**编辑 Clash YAML**（重点）

- 把整份 Clash 配置粘进导入框 → 识别出 `proxies:` 里的 VLESS/Trojan 节点，其余协议（vmess、ss、hysteria2 等）**按原文整段保留**、不解析也不错写
- 改完后点「导出 Clash YAML」写回，**没改过的节点原文照抄**：你自己的缩进、引号风格（`'x'` vs `"x"`）、键顺序、行内注释、以及 `proxies` 区块里列 0 的注释都原样保留
- 只有**改动过的节点**才按标准格式重建，并且**就地替换**——节点在文件里的位置不变
- `proxy-groups` / `rules` / `dns` 等 `proxies` 以外的内容**逐字节保留**，策略组引用不会断裂
- 可复制或下载 `config.yaml`

> 举例：一份用单引号、`udp` 字段缺失、`type` 写在 `name` 前面的配置，如果你只改了其中一个节点的反代 IP，写回后**整份文件只有那一个节点的那一行变化**，其余节点连注释都一字不动。

**导出**：不勾选任何行时导出**全部**节点；结果区可复制链接 / base64 / Clash / sing-box，或下载 `.txt`。

**送去 ①**：把当前列表（含 YAML 导入的节点）转成链接送进标签页①，继续做批量组合处理。

### ③ 订阅参数生成

为每个反代 IP 生成一条带标签的订阅 URL，逐个导入测试。

**客户端类型**（Worker 端原生支持，无需第三方订阅转换）：

`base64`（通用 / v2rayNG）、`clash`、`clashr`、`stash`、`sing-box`、`surge`、`loon`、`Quantumult X`、`CLASH 家宽链式`

生成结果形如：

```
cfnew-HK  https://你的域名/{UUID}/sub?p=1.1.1.1&target=clash
```

已做的便利处理：自动补 `/sub`、自动追加 `target`、参数里已显式写 `target=` 时不覆盖。旁边有「只要 Clash 订阅 →」一键生成并复制。

**参数列表三种写法**：`1.1.1.1 #HK`（自动识别键）、`HK | p=1.1.1.1`（显式指定键）、`US | p=2.2.2.2&wk=JP`（可带附加参数）。

> 订阅层的 `wk`（筛选地区）和 `rm`（移除地区）与节点层含义不同；订阅模式对 XHTTP 节点同样有效。

### ④ ProxyIP 测试辅助

把带 `#地区` 备注的列表整理成纯 `ip:port`（喂给 CloudflareSpeedTest / tcping）和名称对照表，测完速可一键回填到 ① 继续批量生成。

---

## 参数速查

| 参数 | 含义 |
|---|---|
| `p` | 出站 ProxyIP，**直连失败时**才改走。支持 IP、IP:端口、`[IPv6]:端口`、域名，可逗号分隔多个 |
| `s` | 出站代理，接受 `socks5://` / `socks://` / `http://` / `https://` 前缀，或裸 `user:pass@host:port`（无前缀按 SOCKS5） |
| `wk` | 节点层：Worker 地区，影响分区回退；订阅层：只输出指定地区的优选 |
| `rm` | 节点层：仅 `rm=no` 有效；订阅层：移除地区 |

工具把节点解析成对象再改参数、重建链接，`p`/`s`/`wk`/`rm` 写入 `path` 随连接生效，**优先级高于面板和环境变量**。XHTTP 节点的连接参数 Worker 不读取，出口请用 ③ 管理。

---

## 部署

### 在线部署到 Cloudflare Pages

仓库结构里工具位于子目录 `cf-p-tool/`，**根目录没有 `index.html`**，所以连接仓库时必须在 Pages 里指定构建输出目录。

1. 把本仓库推到 GitHub
2. Cloudflare 控制台 → Workers 和 Pages → 创建 → Pages → 连接 Git 仓库
3. 构建配置：
   - 框架预设：`None`
   - 构建命令：**留空**
   - **构建输出目录：`cf-p-tool`** ← 关键
4. 保存并部署

> 如果输出目录留空，站点会是空的，访问根域名报 404；此时子路径 `/<项目名>/` 仍可访问，但建议按上面改正。

### 本地打开

最简单：双击 `cf-p-tool/index.html`。

需要本地服务时（推荐，剪贴板 API 在 `file://` 下不可用，工具会自动降级并提示）：

```bash
python -m http.server 8081 --directory cf-p-tool
# 打开 http://127.0.0.1:8081/
```

---

## 测试

仓库带一套验证脚本，改完代码建议跑一遍（需要 Node.js，无第三方依赖）：

```bash
cd cf-p-tool/_test

# 主测试：171 项断言，覆盖四个标签页的全部路径
node harness.mjs

# 深色主题对比度审计：36 组配色须全部满足 WCAG AA，否则以非零码退出
node contrast.mjs

# 生成一份测试用 Clash 配置，再用结构校验器检查它
node gencfg.mjs
node checkclash.mjs "$TEMP/cf-clash.yaml"     # Windows；其他系统用 /tmp/cf-clash.yaml
CLASH_LEVEL=slim node gencfg.mjs              # 生成精简级别（默认 full）

# YAML 写回保真度：proxies 区块以外的内容必须逐字节一致
node fidelity.mjs <原始配置> <写回结果>
```

`harness.mjs` 的做法是把 `index.html` 里的脚本抽出来，在最小 DOM 桩上**真实执行**，所以既能覆盖逻辑分支，也能覆盖「按钮是否真的接上了」这类界面接线问题。

三个校验脚本（`harness` / `contrast` / `checkclash`）和 `fidelity` 失败时都会以非零码退出，可直接接入 CI；`gencfg.mjs` 只是生成器。

---

## 实现说明

**为什么是单文件**：整个工具是一个 HTML（`cf-p-tool/index.html`，约 98 KB），CSS/JS 全部内联，无构建步骤、无外部依赖。好处是可以直接双击运行、方便丢到任何静态托管；代价是文件较大。

**节点对象模型**：不做字符串替换，而是 `链接 ⇄ 节点对象` 双向转换（`parseNode` / `buildNode`），改参数在对象上做，再重建 URI，避免正则拼接出错。

**链接编辑的注意点**：`path` 整体是作为节点 query 的一个值写出去的，只转义会破坏 query 结构的字符（`% & = ? # + /`），已存在的 `%XX` 原样保留——否则整个 path 再走一次 `encodeURIComponent` 会产生 `%253A` 这类双重编码。

**Clash YAML 定点替换**：只定位顶层 `proxies:` 区块并重建它，其余行原样搬运，因此注释、缩进风格、`proxy-groups` 引用都不受影响。

---

## 已知限制

- **仅支持 VLESS / Trojan**。两者之外（vmess、ss、hysteria2、tuic 等）在 Clash YAML 里按原文保留，但不能在表格里编辑。这与 cfnew Worker 端只识别 `vless://` / `trojan://` 一致。
- **XHTTP 节点无法写回 Clash**（Clash 无法表示该传输），导出时会跳过并提示。
- **没有真机验证过导出的 Clash 配置**。项目内做了 YAML 结构校验与保真度校验，但那不等于 mihomo 内核一定接受。首次使用建议在客户端里确认。
- **不保存任何数据**。未使用 localStorage，刷新页面后列表清空——请及时导出。

---

## 文件说明

```
cf-p-tool/index.html      工具本体（深色主题，单文件，双击即用）
批量加p.html               最初的轻量版：只做「批量加 p」，223 行
cf-p-tool/_test/          验证脚本（不参与工具运行）
.zcode/plans/             开发过程记录
```

`cfnew/` 是第三方项目（[byJoey/cfnew](https://github.com/byJoey/cfnew)），已在 `.gitignore` 中排除，不在本仓库内。

---

## 免责声明

本项目仅供个人学习与技术交流使用。请遵守你所在地区的法律法规以及 Cloudflare 的服务条款，不要用于任何非法用途。
