# token-speed

[![version](https://img.shields.io/badge/version-1.1.0-3AA99A)](https://github.com/hermanzhaozzzz/claude-token-speed/releases)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.322-3AA99A)](https://code.claude.com/docs/en/plugins/mods/interface)
[![license](https://img.shields.io/badge/license-MIT-3AA99A)](LICENSE)
[![validate](https://github.com/hermanzhaozzzz/claude-token-speed/actions/workflows/validate.yml/badge.svg)](https://github.com/hermanzhaozzzz/claude-token-speed/actions/workflows/validate.yml)

**在 Claude Code / Claude Desktop 输入框上沿显示实时 token 速度及其占过去 60 分钟峰值的比例、3 分钟历史曲线、缓存命中率、上下文占用和本轮计时。**

[English](README.md) · [更新日志](CHANGELOG.md)

![preview](assets/preview.svg)

## 显示内容

输入框上沿一行，右对齐：

| 片段 | 含义 |
|---|---|
| `⚡ 360.1 t/s · 76% of 472` | 当前速度及其占 60 分钟峰值（`472 t/s`）的比例；轮次之间显示 `0.0 t/s · 0%`。 |
| 3 分钟曲线 | 每秒一个采样，平滑 SVG 曲线带端点；纵轴固定在 60 分钟峰值，空闲秒回落到基线。 |
| `◎ 87%` | 会话级 prompt 缓存命中率。提供方还没报告缓存读取时显示 `—`。 |
| `[██████░░░░] 42%` | 上下文窗口占用与百分比。首轮完成前显示 `—`。 |
| `01:23` | 本轮计时；本轮结束后冻结在最终时长。 |

模型空闲时整行变暗、曲线端点变成空心。第一轮开始时出现，轮次之间保留，便于比较最近几次生成；本轮结束时速度归零为 `0.0 t/s`。

## 安装

### Claude Desktop（Code 标签页）

1. 点击输入框旁的 **+**。
2. 选择 **Plugins**。
3. **Add marketplace** 填入 `hermanzhaozzzz/claude-token-speed`。
4. **Add plugin**，选择 `token-speed`。

### Claude Code 终端

```bash
/plugin install token-speed --marketplace hermanzhaozzzz/claude-token-speed
```

或在 shell 中：

```bash
claude plugin install token-speed --marketplace hermanzhaozzzz/claude-token-speed
```

已打开的会话执行 `/reload-plugins`，或重启桌面版。

## 数字怎么算

- **速度** — Hermes 口径：`最近 ≤10 次调用的 output_tokens 之和 / 这些调用的 API 耗时之和`。单次耗时从请求发出到最后一个 chunk，包含首字延迟。每轮第一次调用完成前使用 3 秒实时估算；轮次之间显示 `0.0 t/s`，不继承上一轮读数。
- **峰值比例** — `当前速度 / 过去 60 分钟内最高的 1 秒采样`，封顶 100%。峰值为滑动窗口：旧采样滑出 60 分钟后，比例自动按新的最高值重新标定。
- **历史** — 每秒采样一次，保留最近 180 个点（3 分钟）；曲线纵轴取 60 分钟峰值并向上取整到 50 t/s（最低 100），生成段在整小时内可以直接比较，不再各自缩放。空闲秒记为 `0`，因此能看出生成与停顿的分布。
- **缓存命中** — `cache_read / (input + cache_read + cache_creation)`，按会话累计；提供方没有缓存读取时显示 `—`。
- **上下文** — 取 `$.session.usage()` 的 `context.percent`，每 2 秒和每轮结束时刷新。
- **计时** — 从 `turn.start` 到 `turn.complete` 的墙钟时间，每秒更新。

## 兼容性

| 插件 | Claude Code / Desktop | 状态 |
|---|---|---|
| 1.1.0 | 2.1.322 桌面版（插件 API 2.1.321） | 已验证 |

本插件使用 Claude Code 的 **function-hooks 插件 API**，该 API 目前是 early access，版本之间可能变化。仓库里有一个每周定时运行的 GitHub Action，用最新 Claude Code 执行 `claude plugin validate .`，API 变化会直接体现为失败的工作流。

如果 Claude 升级后某个 hook 失效，会话会打印 `<plugin>: ... hook skipped`。执行：

```bash
claude plugin validate .
```

然后按照 `.claude-plugin/types/` 里的新声明更新 `hooks/register.tsx`。

### 适配新的 Claude Code 版本

1. 关注每周的 **validate** workflow，或在本地运行 `claude plugin validate .`。
2. 打开一个加载该插件的会话，引擎会把最新的 API 声明写到 `.claude-plugin/types/`（已 gitignore）。
3. 按新声明调整 `hooks/register.tsx`，状态结构变了再改 `types/index.d.ts`。
4. 运行 `claude plugin validate .`，更新 `.claude-plugin/plugin.json` 的 `version`，在 `CHANGELOG.md` 记一笔，提交并打新 tag。

## 开发

```text
.claude-plugin/plugin.json   清单
.claude-plugin/marketplace.json   本地 marketplace
hooks/hooks.json             hooks 入口
hooks/register.tsx           插件本体
types/index.d.ts             状态契约
```

`hooks/register.tsx` 顶部的主要常量：

| 常量 | 默认值 | 用途 |
|---|---|---|
| `ACCENT` | `#3AA99A` | 数字、曲线、渐变和端点共用的雾青；数字与曲线在同一个 SVG 里，颜色完全一致。 |
| `WINDOW_MS` | `3000` | 首次调用完成前的实时估算窗口。 |
| `PEAK_WINDOW_MS` | `3600000` | 峰值比例和曲线纵轴使用的滑动窗口。 |
| `PEAK_FLOOR` | `100` | 还没有峰值时的最低纵轴。 |
| `HISTORY_MAX` | `180` | 曲线采样数；180 × 1 秒 = 3 分钟。 |
| 曲线上限 | 60 分钟峰值 | 向上取整到 50 t/s，最低为 `PEAK_FLOOR`。 |
| `CHART_W` / `CHART_H` | `220` / `24` | SVG 尺寸（CSS 像素）。 |

修改后在会话里执行 `/reload-plugins`。提交前运行：

```bash
claude plugin validate .
```

## 常见问题

- **没有显示** — 它在 `turn.start` 时出现，先发一条消息试试；刚安装的话执行 `/reload-plugins` 或重启桌面版。
- **轮次之间显示 `0.0 t/s`** — 正常：数字跟随当前轮次，不保留上一轮的读数；最近几次生成仍在 3 分钟曲线里。
- **缓存或上下文显示 `—`** — 提供方还没报告该值（没有缓存读取，或首轮尚未完成），后续轮次会补上。
- **终端里没有曲线** — 终端不支持 `Svg`，会自动退回 36 列块字符曲线，峰值比例以紧凑的 `· 76%` 显示，其余部分不变。
- **桌面版升级后消失** — 运行 `claude plugin validate .`，查看会话提示；每周 CI 就是为了尽早发现这类问题。

## 隐私

所有数据都在本地根据会话自身的 usage 事件计算。插件不发起网络请求、不读取凭据、不写文件。

## 卸载

```bash
claude plugin uninstall token-speed
```

不再需要时也可以移除 marketplace：

```bash
claude plugin marketplace remove claude-token-speed
```

## 许可证

[MIT](LICENSE)
