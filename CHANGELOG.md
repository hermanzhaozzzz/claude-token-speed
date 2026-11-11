# Changelog

## 1.1.0 — 2026-11-11

- Zero the speed number when a turn ends; a new turn no longer inherits the previous turn's rolling reading.
- Show the current speed as a share of the trailing 60-minute peak: `0.0 t/s · 0% of 472` on the desktop and a compact `· 0%` in the terminal fallback.
- Pin the chart's y-axis to the 60-minute peak (rounded up to 50 t/s, minimum 100) instead of rescaling to the recent burst, so the 3-minute curve stays comparable across the hour.
- Add `peak60m` and `percentOfPeak` to the snapshot contract.

## 1.0.4 — 2026-11-11

- Draw the speed number inside the same SVG as the curve, so both use the exact teal. Desktop plugin text is otherwise forced to the theme's gold accent.
- Draw a small vector lightning bolt; the `t/s` unit stays gray.
- The number remains accessible through the SVG's `alt` text.

## 1.0.3 — 2026-11-11

- Use the foreground text color for the speed number. Desktop text colors accept only theme keys; the available green (`planMode`) clashed with the teal curve.
- Cache hit still shows `—` when the provider reports zero cache reads, matching Hermes. DeepSeek/FreeAPI currently reports `cache_read_input_tokens: 0`.

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
