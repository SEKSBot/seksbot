---
read_when:
  - 你使用 `seksbot browser` 并想要常见任务的示例
  - 你想通过 node host 控制在另一台机器上运行的浏览器
  - 你想使用 Chrome 扩展中继（通过工具栏按钮附加/分离）
summary: "`seksbot browser` 的 CLI 参考（配置文件、标签页、操作、扩展中继）"
title: browser
x-i18n:
  generated_at: "2026-02-03T07:44:49Z"
  model: claude-opus-4-5
  provider: pi
  source_hash: af35adfd68726fd519c704d046451effd330458c2b8305e713137fb07b2571fd
  source_path: cli/browser.md
  workflow: 15
---

# `seksbot browser`

管理 seksbot 的浏览器控制服务器并运行浏览器操作（标签页、快照、截图、导航、点击、输入）。

相关：

- 浏览器工具 + API：[浏览器工具](/tools/browser)
- Chrome 扩展中继：[Chrome 扩展](/tools/chrome-extension)

## 通用标志

- `--url <gatewayWsUrl>`：Gateway 网关 WebSocket URL（默认从配置获取）。
- `--token <token>`：Gateway 网关令牌（如果需要）。
- `--timeout <ms>`：请求超时（毫秒）。
- `--browser-profile <name>`：选择浏览器配置文件（默认从配置获取）。
- `--json`：机器可读输出（在支持的地方）。

## 快速开始（本地）

```bash
seksbot browser --browser-profile chrome tabs
seksbot browser --browser-profile seksbot start
seksbot browser --browser-profile seksbot open https://example.com
seksbot browser --browser-profile seksbot snapshot
```

## 配置文件

配置文件是命名的浏览器路由配置。实际上：

- `seksbot`：启动/附加到专用的 seksbot 管理的 Chrome 实例（隔离的用户数据目录）。
- `chrome`：通过 Chrome 扩展中继控制你现有的 Chrome 标签页。

```bash
seksbot browser profiles
seksbot browser create-profile --name work --color "#FF5A36"
seksbot browser delete-profile --name work
```

使用特定配置文件：

```bash
seksbot browser --browser-profile work tabs
```

## 标签页

```bash
seksbot browser tabs
seksbot browser open https://docs.seksbot.ai
seksbot browser focus <targetId>
seksbot browser close <targetId>
```

## 快照 / 截图 / 操作

快照：

```bash
seksbot browser snapshot
```

截图：

```bash
seksbot browser screenshot
```

导航/点击/输入（基于 ref 的 UI 自动化）：

```bash
seksbot browser navigate https://example.com
seksbot browser click <ref>
seksbot browser type <ref> "hello"
```

## Chrome 扩展中继（通过工具栏按钮附加）

此模式让智能体控制你手动附加的现有 Chrome 标签页（不会自动附加）。

将未打包的扩展安装到稳定路径：

```bash
seksbot browser extension install
seksbot browser extension path
```

然后 Chrome → `chrome://extensions` → 启用"开发者模式" → "加载已解压的扩展程序" → 选择打印的文件夹。

完整指南：[Chrome 扩展](/tools/chrome-extension)

## 远程浏览器控制（node host 代理）

如果 Gateway 网关与浏览器运行在不同的机器上，在有 Chrome/Brave/Edge/Chromium 的机器上运行 **node host**。Gateway 网关会将浏览器操作代理到该节点（无需单独的浏览器控制服务器）。

使用 `gateway.nodes.browser.mode` 控制自动路由，使用 `gateway.nodes.browser.node` 在连接多个节点时固定特定节点。

安全 + 远程设置：[浏览器工具](/tools/browser)、[远程访问](/gateway/remote)、[Tailscale](/gateway/tailscale)、[安全](/gateway/security)
