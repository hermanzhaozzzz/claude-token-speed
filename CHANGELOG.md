# Changelog

## 1.4.0 — 2026-11-12

- The reading is now `⚡ 248.6 t/s · ⌀ 205`: the share of the 60-minute peak is replaced by a **10-minute average** that reflects how the provider has actually been performing. The average divides tokens by **decode time** (first content chunk to the last), over the last 600 s of generation, so queueing before the first token never counts; idle seconds produce neither tokens nor decode time, so they never enter the denominator and the number holds through pauses and between turns. It resets only when a session starts.
- Speed now uses the same decode time, so the current number and the average are comparable: a call that waited 60 s for its first token no longer looks slow.
- The curve is smoothed: each point is the mean of the last 30 seconds of generation, so pauses inside a turn no longer pull it down, and a dashed line marks the 10-minute average at the same scale. The y-axis is still the 60-minute peak, which is now used only for that scale.
- On narrow terminal and VS Code panels the block sparkline and then the cache segment drop out, so the speed and the average stay visible.

## 1.3.0 — 2026-11-12

- Draw the chart only in the desktop. The VS Code extension now uses the same text band as the terminal (speed, block sparkline, cache, context, timer and 清图): the editor's webview rasterizes every `Svg` asynchronously and swaps in its `alt` text whenever a draw misses its deadline, so a band that redrew its curve every second eventually collapsed into wrapped alt text. Reloading the plugin only cleared it for a while.
- The 清图 button only offers the desktop setup pane on the desktop surface; in the VS Code extension it cleans directly, as in the terminal.

## 1.2.9 — 2026-11-11

- The one-command installer only uninstalls the user-scope plugin and marketplace when they are actually installed, and says so; a clean machine no longer prints two red `✘ Failed to uninstall` lines that look like errors.

## 1.2.8 — 2026-11-11

- Fix the desktop setup restarting Claude in a loop: `launchctl submit` re-runs its job on a timer, so the installer exited and reopened the app every ten seconds. It now starts once through perl `fork` + `setsid`, which survives the app quitting without repeating.
- The setup script is now idempotent: if the managed copy already matches the plugin's version it exits without quitting Claude, holds a lock against overlapping runs, only quits and reopens the app when it was running, and treats a dismissed admin dialog (`-128`) as cancelled rather than failed.
- Managed installs are detected by the `token-speed-local` path as well, so the cache copy also cleans directly instead of offering the setup pane again.

## 1.2.7 — 2026-11-11

- The desktop button now opens a setup pane instead of a toast. **安装并重启** quits Claude first, then asks for the admin password, installs the managed copy from the currently installed plugin, removes the user-scope plugin, and reopens Claude. The install runs detached through `launchctl`, so quitting the app cannot kill it.
- The installer gains `--source DIR`, `--user NAME` and `--no-restart`; the one-command setup still works as before and now clones over HTTPS.
- A failed in-app install is reported the next time the session starts, with the log path.

## 1.2.6 — 2026-11-11

- The desktop warning now puts the installer command on its own transcript line (and copies it), so it is easy to select and paste.

## 1.2.5 — 2026-11-11

- The desktop warning now shows and copies one command; that command installs the managed copy, removes the user-scope plugin and marketplace, and restarts Claude.

## 1.2.4 — 2026-11-11

- The desktop warning now tells users to uninstall the user-scope plugin after a machine-level managed install; the README documents the cleanup order and the same-name lock.

## 1.2.3 — 2026-11-11

- In Claude Desktop, a normal user install now explains the guard limitation when 清图 is clicked instead of running `/compact`; the terminal and the managed copy still clean directly.

## 1.2.2 — 2026-11-11

- Keep thinking and user attachments such as PDFs when cleaning images: only older tool-result rows are rebuilt, so older assistant messages and user prompts stay whole.

## 1.2.1 — 2026-11-11

- Keep the band on one row: the fixed segments no longer shrink, the chart takes the remaining width, and long text truncates instead of wrapping.

## 1.2.0 — 2026-11-11

- Add a `⌫ 清图` button at the right end of the band, after the timer. It answers the engine's `session.compact` hook with a pruned message list, so it runs as a local compaction with no model request — it keeps working after a session's request body has exceeded a provider's size limit.
- Keep the first message and the newest 8 messages; rebuild older ones without their handles, which drops image blocks. Tool pairs stay on one side of the cut, and stored tool records are dropped because they can carry image bytes.
- Add `tests/clean-images.test.ts` for the pruning rules and the button behavior.
- Make the band fill the conversation width: the speed number keeps its size while the chart stretches or compresses with the window; the terminal fallback sizes its block curve from `bodyColumns`.

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
