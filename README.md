# token-speed

[![version](https://img.shields.io/badge/version-1.0.0-3AA99A)](https://github.com/hermanzhaozzzz/claude-token-speed/releases)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-2.1.322-3AA99A)](https://code.claude.com/docs/en/plugins/mods/interface)
[![license](https://img.shields.io/badge/license-MIT-3AA99A)](LICENSE)
[![validate](https://github.com/hermanzhaozzzz/claude-token-speed/actions/workflows/validate.yml/badge.svg)](https://github.com/hermanzhaozzzz/claude-token-speed/actions/workflows/validate.yml)

**Live token speed, a 3-minute history curve, cache hit rate, context usage, and the current turn timer — above the prompt in Claude Code and Claude Desktop.**

[中文](README.zh-CN.md) · [Changelog](CHANGELOG.md)

![preview](assets/preview.svg)

## What it shows

One compact row, right-aligned on the band above the input box:

| Segment | Meaning |
|---|---|
| `⚡ 86.4 t/s` | Rolling speed over the last up-to-10 API calls. |
| 3-minute curve | One sample per second, smooth SVG line with an endpoint. Idle seconds sit at the baseline. |
| `◎ 87%` | Session prompt-cache hit rate. Shows `—` until the provider reports cache reads. |
| `[██████░░░░] 42%` | Context-window usage and percentage. Shows `—` until the first usage report. |
| `01:23` | Current turn timer. Freezes at the final duration when the turn ends. |

The row dims and the endpoint becomes hollow when the model is idle. It appears when the first turn starts and stays visible between turns, so you can compare the last few generations.

## Install

### Claude Desktop (Code tab)

1. Click **+** next to the prompt box.
2. Choose **Plugins**.
3. **Add marketplace** with `hermanzhaozzzz/claude-token-speed`.
4. **Add plugin** and pick `token-speed`.

### Claude Code terminal

```bash
/plugin install token-speed --marketplace hermanzhaozzzz/claude-token-speed
```

From a shell:

```bash
claude plugin install token-speed --marketplace hermanzhaozzzz/claude-token-speed
```

Reload an existing session with `/reload-plugins`, or restart the desktop app.

## How the numbers are computed

- **Speed** — Hermes-style rolling throughput: `sum(output_tokens of the last ≤10 calls) / sum(API duration of those calls)`. A call's duration is measured from the model request to its final chunk, so it includes time-to-first-token. Before the first call completes, the row uses a 3-second live estimate.
- **History** — The session samples the current speed once per second and keeps the last 180 samples (3 minutes). Idle seconds sample `0`, which makes generation bursts visible over the window.
- **Cache hit** — `cache_read / (input + cache_read + cache_creation)`, accumulated over the session. It is omitted (`—`) until the provider reports a cache read.
- **Context** — `context.percent` from `$.session.usage()`, refreshed every 2 seconds and on turn completion.
- **Timer** — Wall-clock time from `turn.start` to `turn.complete`, updated once per second.

## Compatibility

| Plugin | Claude Code / Desktop | Status |
|---|---|---|
| 1.0.0 | 2.1.322 desktop (plugin API 2.1.321) | Tested |

This plugin uses the Claude Code **function-hooks plugin API**, which is early access and may change between releases. The repository includes a scheduled GitHub Action that runs `claude plugin validate .` against the latest Claude Code release every week, so an API change surfaces as a failed workflow instead of silently breaking the band.

If a Claude update makes a hook fail, the session prints a `<plugin>: ... hook skipped` notice. Run:

```bash
claude plugin validate .
```

and update `hooks/register.tsx` against the new declarations in `.claude-plugin/types/`.

### Updating for a new Claude Code release

1. Watch the weekly **validate** workflow, or run `claude plugin validate .` locally.
2. Open a session that loads the plugin. The engine writes fresh API declarations to `.claude-plugin/types/` (gitignored).
3. Adjust `hooks/register.tsx` and, if state changed, `types/index.d.ts`.
4. Run `claude plugin validate .`, bump `version` in `.claude-plugin/plugin.json`, add a `CHANGELOG.md` entry, commit, and tag a release.

## Development

```text
.claude-plugin/plugin.json   manifest
.claude-plugin/marketplace.json   local marketplace
hooks/hooks.json             hooks entry
hooks/register.tsx           the whole plugin
types/index.d.ts             state contract
```

Useful constants at the top of `hooks/register.tsx`:

| Constant | Default | Purpose |
|---|---|---|
| `ACCENT` | `#3AA99A` | Teal used by the number, curve, gradient and endpoint. |
| `WINDOW_MS` | `3000` | Live estimate window before the first call completes. |
| `HISTORY_MAX` | `180` | Chart samples; 180 × 1 s = 3 minutes. |
| `SCALE_MAX` | `140` | Fixed chart ceiling in t/s. |
| `CHART_W` / `CHART_H` | `220` / `24` | SVG size in CSS pixels. |

After editing, run `/reload-plugins` in a session. The engine reloads the module and runs `session.start` again. Validate before committing:

```bash
claude plugin validate .
```

## Troubleshooting

- **The band is empty** — it appears from `turn.start`; send a prompt. If you just installed it, run `/reload-plugins` or restart the desktop app.
- **`—` for cache or context** — the provider has not reported the value yet (no cache reads, or the first turn has not completed). The row fills in on later turns.
- **Terminal instead of desktop** — terminals have no `Svg`, so the plugin falls back to a 36-column block sparkline; the rest of the row is unchanged.
- **The row disappeared after an app update** — run `claude plugin validate .` and check the session notice. The weekly CI job is there to catch this early.

## Privacy

Everything is computed locally from the session's own usage events. The plugin makes no network requests, reads no credentials, and writes no files.

## Uninstall

```bash
claude plugin uninstall token-speed
```

Remove the marketplace too if you no longer need it:

```bash
claude plugin marketplace remove claude-token-speed
```

## License

[MIT](LICENSE)
