---
name: agent-browser-cli
description: 使用 agent-browser-cli 进行浏览器感知与控制、页面交互、截图/PDF、Cookie/CDP 和排障。
---

# agent-browser-cli

使用 `agent-browser-cli` 控制用户真实 Chrome。底层是 Rust daemon + Chrome 扩展桥，保留登录态和 Cookie；不是 Selenium/Playwright。

## 正常流程直接执行命令

每次开始浏览器任务，不要先做健康检查，直接执行最贴近目标的命令。`tabs` / `open` / `exec` / `scan` 会按需自动启动 daemon；daemon 未常驻是正常状态，不是故障。

```bash
agent-browser-cli open https://example.com
agent-browser-cli scan --text-only
agent-browser-cli snapshot --limit 200
agent-browser-cli exec --tab <tabId> 'return document.title'
```

只有目标命令失败、输出明确提示连接异常、扩展未连接、端口不一致、无可用标签页，或用户明确要求排障时，才进入状态检查：

```bash
agent-browser-cli status
agent-browser-cli doctor
agent-browser-cli logs --tail 100
```

`status` 中 `daemon_not_running` / `running=false` 不能单独作为停止操作的理由；优先继续执行目标命令让 CLI 自动拉起 daemon。`doctor` 只检查状态，不自动启动 daemon、不改配置、不安装 skill。

## 常用命令优先级

先区分三个入口：

```text
scan：内容感知，适合看正文、列表、页面文本。
snapshot：操作定位，适合找按钮、链接、输入框并生成 @e 引用。
exec / JSON CDP：逃生口，封装命令失效或特殊页面时回退。
```

基础感知和按需排障：

```bash
agent-browser-cli tabs
agent-browser-cli tabtree
agent-browser-cli tabtree --full
agent-browser-cli tabtree --profile work
agent-browser-cli tabtree --tab <tabId>
agent-browser-cli lookup tab <tabId>
agent-browser-cli lookup browser <browser_id>
agent-browser-cli lookup profile work
agent-browser-cli tabs --profile work
agent-browser-cli profile-label set work --profile <profile_id>
agent-browser-cli tabs --profile work
agent-browser-cli open --profile work https://example.com
agent-browser-cli open --window https://example.com
agent-browser-cli open --window --focus https://example.com
# open 返回后继续操作新页面时，优先使用 result.opened_tab_id / result.opened_session_key
agent-browser-cli open https://example.com
agent-browser-cli close --tab <tabId>
agent-browser-cli exec --tab <tabId> 'return document.title'
agent-browser-cli status
agent-browser-cli doctor
agent-browser-cli logs --tail 100
```

## 标签分组

多任务开新标签时可以用 session 或 group-title 把标签放入 Chrome 原生标签组。需要独立窗口时用 `open --window`；默认不聚焦，需要抢焦点时显式加 `--focus`；`--window --group-title` / `--window --session` 会把新窗口里的首个 tab 加入对应 tab group。分组只是整理浏览器标签，失败不影响开 tab 主流程。

```bash
agent-browser-cli open https://example.com --session research
agent-browser-cli open https://example.com --group-title "任务A"
agent-browser-cli open --window https://example.com
agent-browser-cli open --window --focus https://example.com
agent-browser-cli open --profile work https://example.com
```

## 截图和 PDF

截图/PDF 必须让 CLI 写文件，不要把 base64 大段塞进上下文。命令只返回路径、字节数和少量元信息。

```bash
agent-browser-cli screenshot --out /tmp/page.png
agent-browser-cli screenshot --full-page --out /tmp/full.png
agent-browser-cli screenshot --target '@e1' --out /tmp/button.png
agent-browser-cli screenshot --selector 'button[type=submit]' --format jpeg --quality 70 --out /tmp/button.jpg
agent-browser-cli save-pdf --out /tmp/page.pdf
```

## exec 使用规则

执行复杂 JS 时写入临时文件：

```bash
agent-browser-cli exec --tab <tabId> --file /tmp/script.js
```

需要等待页面变化时使用 `--wait-js`，不要在脚本里固定 `setTimeout`：

```bash
agent-browser-cli exec --tab <tabId> 'document.querySelector("button").click()' --wait-js 'return document.body.innerText.includes("完成")' --wait-timeout 3
```

## JSON/CDP 逃生口

跨标签页、Cookie、CDP、扩展管理、浏览器内容权限时，用 JSON 指令：

```bash
agent-browser-cli exec '{"cmd":"tabs"}'
agent-browser-cli exec '{"cmd":"cookies"}'
agent-browser-cli exec '{"cmd":"cdp","tabId":303987837,"method":"Page.captureScreenshot","params":{"format":"png"}}'
```

## 运维入口

- 目标命令失败、扩展未连接、端口不一致、无可用标签页：看 `references/operations.md`。
- daemon 未运行但尚未执行目标命令：不要排障，直接继续执行 `tabs/open/exec/scan`。
- skill 安装：先 `agent-browser-cli install-skill --dry-run` 展示计划，用户确认后再 `agent-browser-cli install-skill`。
- 可自动执行的排障命令：`status`、`doctor`、`logs --tail`、`restart`、`stop`、`tabs`。
