# Changelog

## 1.0.2 — 2026-11-11

- Use the theme's `planMode` teal for the speed number; desktop text colors accept theme keys rather than raw hex.
- Leave room for the endpoint ring at the chart's right edge.
- Scale the chart to the recent peak instead of a fixed 140 t/s ceiling.

## 1.0.1 — 2026-11-11

- Reduce host clock round-trips while streaming: the live window now samples every 8 chunks instead of every chunk. No visual change.

## 1.0.0 — 2026-11-11

- Initial public release.
- Live token speed above the prompt, averaged over the last 10 API calls.
- 3-minute SVG sparkline with smooth curve and endpoint; dims and hollows when idle.
- Session prompt-cache hit rate.
- Context-window usage bar and percentage.
- Current turn timer; freezes at the final duration.
- Terminal fallback using block characters.
- Teal accent (`#3AA99A`).

Compatibility: tested with Claude Code 2.1.322 (desktop) and the plugin API written by 2.1.321.
