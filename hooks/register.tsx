import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer, TurnStepChunk } from 'claude-code'

import type { TokenSpeedSnapshot } from '../types'

const ACCENT = '#3AA99A'
const WINDOW_MS = 3000
const TICK_MS = 1000
const HISTORY_MAX = 180
const CALLS_MAX = 10
const SCALE_MAX = 140
const CHART_W = 220
const CHART_H = 24
const PAD = 2

const BLOCKS = '▁▂▃▄▅▆▇█'

const INITIAL: TokenSpeedSnapshot = {
  version: 1,
  speed: null,
  history: [],
  cacheHit: null,
  contextPercent: null,
  elapsedSec: 0,
  isActive: false,
  hasData: false,
}

const snap = atom({ plugin: 'token-speed', key: 'snap' } as const, INITIAL)

type Sample = { at: number; tokens: number }
type Call = { tokens: number; ms: number }

let turnStartedAt = 0
let lastTurnSec = 0
let isActive = false
let hasData = false
let speed: number | null = null
let history: number[] = []
let cacheTotals = { input: 0, read: 0, write: 0 }
let contextPercent: number | null = null
let calls: Call[] = []

let stepStartedAt = 0
let firstTokenAt = 0
let stepTokens = 0
let samples: Sample[] = []

let timer: Timer | null = null
let tickCount = 0

function estimateTokens(text: string): number {
  let ascii = 0
  let wide = 0
  for (const ch of text) {
    if ((ch.codePointAt(0) ?? 0) < 128) ascii += 1
    else wide += 1
  }
  return ascii / 3.6 + wide * 0.9
}

function rollingSpeed(): number | null {
  if (calls.length === 0) return null
  let tokens = 0
  let ms = 0
  for (const call of calls) {
    tokens += call.tokens
    ms += call.ms
  }
  return ms > 0 ? (tokens * 1000) / ms : null
}

function cacheHitPercent(): number | null {
  const prompt = cacheTotals.input + cacheTotals.read + cacheTotals.write
  if (prompt <= 0 || cacheTotals.read <= 0) return null
  return Math.round((cacheTotals.read / prompt) * 100)
}

function liveSpeed(now: number): number | null {
  const last = samples[samples.length - 1]
  if (last) {
    let first = last
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      const sample = samples[i]
      if (sample && now - sample.at <= WINDOW_MS) first = sample
      else break
    }
    const span = last.at - first.at
    if (span >= 1000 && last.tokens > first.tokens) {
      return ((last.tokens - first.tokens) * 1000) / span
    }
  }

  if (firstTokenAt > 0) {
    const elapsed = now - firstTokenAt
    if (elapsed >= 1000) return (stepTokens * 1000) / elapsed
  }
  return null
}

function contextBar(percent: number | null): string {
  const filled = percent === null ? 0 : Math.max(0, Math.min(10, Math.round((percent / 100) * 10)))
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec))
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${String(m).padStart(2, '0')}:${s}`
}

function padded(values: number[]): number[] {
  const missing = Math.max(0, HISTORY_MAX - values.length)
  return missing > 0
    ? [...new Array(missing).fill(0), ...values]
    : values.slice(-HISTORY_MAX)
}

function blockSpark(values: number[]): string {
  const all = padded(values)
  const cols = 36
  const size = all.length / cols
  let out = ''
  for (let i = 0; i < cols; i += 1) {
    const a = Math.floor(i * size)
    const b = Math.max(a + 1, Math.floor((i + 1) * size))
    let sum = 0
    for (let j = a; j < b; j += 1) sum += all[j] ?? 0
    const v = sum / (b - a)
    out += BLOCKS[Math.max(0, Math.min(7, Math.round((v / SCALE_MAX) * 7)))]
  }
  return out
}

function smoothPath(points: { x: number; y: number }[]): string {
  const head = points[0]
  if (!head) return ''
  let d = `M ${head.x.toFixed(2)} ${head.y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i]
    const p2 = points[i + 1]
    if (!p1 || !p2) break
    const p0 = points[i - 1] ?? p1
    const p3 = points[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = Math.max(PAD, Math.min(CHART_H - PAD, p1.y + (p2.y - p0.y) / 6))
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = Math.max(PAD, Math.min(CHART_H - PAD, p2.y - (p3.y - p1.y) / 6))
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

function renderSvg(values: number[], active: boolean): string {
  const all = padded(values)
  const points = all.map((v, i) => ({
    x: PAD + (i / (all.length - 1)) * (CHART_W - PAD * 2),
    y: PAD + (1 - Math.max(0, Math.min(SCALE_MAX, v)) / SCALE_MAX) * (CHART_H - PAD * 2),
  }))
  const line = smoothPath(points)
  const area = `${line} L ${CHART_W - PAD} ${CHART_H - PAD} L ${PAD} ${CHART_H - PAD} Z`
  const last = points[points.length - 1]
  if (!last) return ''
  const opacity = active ? 1 : 0.55
  const fillOpacity = active ? 0.22 : 0.12
  const dot = active
    ? `<circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="1.3" fill="${ACCENT}"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_W}" height="${CHART_H}" viewBox="0 0 ${CHART_W} ${CHART_H}">
<defs><linearGradient id="ts-area" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="${ACCENT}" stop-opacity="${fillOpacity}"/>
<stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
</linearGradient></defs>
<path d="${area}" fill="url(#ts-area)"/>
<path d="${line}" fill="none" stroke="${ACCENT}" stroke-opacity="${opacity}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${last.x.toFixed(2)}" cy="${last.y.toFixed(2)}" r="3.2" fill="none" stroke="${ACCENT}" stroke-opacity="${opacity}" stroke-width="1.4"/>
${dot}
</svg>`
}

async function writeSnapshot($: EngineInterface, now?: number): Promise<void> {
  const at = now ?? (await $.clock.now())
  const elapsed = isActive && turnStartedAt > 0
    ? Math.max(0, Math.floor((at - turnStartedAt) / 1000))
    : lastTurnSec
  const next: TokenSpeedSnapshot = {
    version: 1,
    speed,
    history: history.slice(),
    cacheHit: cacheHitPercent(),
    contextPercent,
    elapsedSec: elapsed,
    isActive,
    hasData,
  }
  await update($, snap, () => next)
}

async function tick($: EngineInterface): Promise<void> {
  if (!hasData) return

  const now = await $.clock.now()
  const active = isActive && turnStartedAt > 0
  const live = active ? liveSpeed(now) : null
  history.push(active ? (live ?? 0) : 0)
  if (history.length > HISTORY_MAX) history.shift()

  const rolling = rollingSpeed()
  if (rolling !== null) speed = rolling
  else if (active) speed = live

  if (active) lastTurnSec = Math.max(0, Math.floor((now - turnStartedAt) / 1000))

  tickCount += 1
  if (tickCount % 2 === 0) {
    try {
      const usage = await $.session.usage()
      contextPercent = typeof usage.context.percent === 'number' ? usage.context.percent : null
    } catch {
      // keep the last reading
    }
  }

  await writeSnapshot($, now)
}

function ensureTimer($: EngineInterface): void {
  if (timer) return
  timer = $.clock.every(TICK_MS, () => {
    void tick($)
  })
}

function cancelTimer(): void {
  if (timer) {
    timer.cancel()
    timer = null
  }
}

function resetSession(): void {
  turnStartedAt = 0
  lastTurnSec = 0
  isActive = false
  hasData = false
  speed = null
  history = []
  cacheTotals = { input: 0, read: 0, write: 0 }
  contextPercent = null
  calls = []
  stepStartedAt = 0
  firstTokenAt = 0
  stepTokens = 0
  samples = []
  tickCount = 0
}

async function observe($: EngineInterface, chunk: TurnStepChunk): Promise<void> {
  if (chunk.kind === 'stop') {
    const now = await $.clock.now()
    const usage = chunk.usage
    const tokens = usage?.output_tokens ?? Math.round(stepTokens)
    const ms = stepStartedAt > 0 ? Math.max(1, now - stepStartedAt) : 0

    if (tokens > 0 && ms > 0) {
      calls.push({ tokens, ms })
      if (calls.length > CALLS_MAX) calls.shift()
    }
    if (usage) {
      cacheTotals.input += usage.input_tokens
      cacheTotals.read += usage.cache_read_input_tokens
      cacheTotals.write += usage.cache_creation_input_tokens
    }

    stepTokens = tokens
    const rolling = rollingSpeed()
    if (rolling !== null) speed = rolling
    else if (firstTokenAt > 0) {
      const elapsed = now - firstTokenAt
      if (elapsed > 0) speed = (tokens * 1000) / elapsed
    }

    await writeSnapshot($, now)
    return
  }

  let added = 0
  if (chunk.kind === 'text' || chunk.kind === 'thinking') {
    added = estimateTokens(chunk.text)
  } else if (chunk.kind === 'input') {
    added = estimateTokens(chunk.json)
  } else {
    return
  }
  if (added <= 0) return

  const now = await $.clock.now()
  if (firstTokenAt === 0) firstTokenAt = now
  stepTokens += added
  samples.push({ at: now, tokens: stepTokens })
  while (samples.length > 1) {
    const head = samples[0]
    if (!head || now - head.at <= WINDOW_MS) break
    samples.shift()
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.ui.status(undefined)
    resetSession()
    ensureTimer($)
    await writeSnapshot($)
    return next(e)
  })

  on('session.end', ($, e, next) => {
    cancelTimer()
    resetSession()
    $.ui.status(undefined)
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    $.ui.status(undefined)
    turnStartedAt = 0
    lastTurnSec = 0
    isActive = false
    await writeSnapshot($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      ensureTimer($)
      turnStartedAt = await $.clock.now()
      lastTurnSec = 0
      isActive = true
      hasData = true
      await writeSnapshot($, turnStartedAt)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    stepStartedAt = await $.clock.now()
    firstTokenAt = 0
    stepTokens = 0
    samples = []

    const stream = next(e)
    while (true) {
      const item = await stream.next()
      if (item.done) return item.value
      await observe($, item.value)
      yield item.value
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const now = await $.clock.now()
      if (turnStartedAt > 0) {
        lastTurnSec = Math.max(0, Math.floor((now - turnStartedAt) / 1000))
      }
      turnStartedAt = 0
      isActive = false

      const rolling = rollingSpeed()
      if (rolling !== null) speed = rolling

      try {
        const usage = await $.session.usage()
        contextPercent = typeof usage.context.percent === 'number' ? usage.context.percent : null
      } catch {
        // keep the last reading
      }

      await writeSnapshot($, now)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, snap)
    if (s.version !== 1 || !s.hasData) return next(e)

    const speedText = s.speed === null ? '—' : s.speed.toFixed(1)
    const cacheText = s.cacheHit === null ? '—' : `${Math.round(s.cacheHit)}%`
    const ctxText = s.contextPercent === null ? '—' : `${Math.round(s.contextPercent)}%`
    const ctxBar = contextBar(s.contextPercent)
    const timerText = formatTime(s.elapsedSec)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box width="100%" justifyContent="flex-end" alignItems="center" gap="sm">
          <Text color={ACCENT} dimColor={!s.isActive}>⚡ {speedText} t/s</Text>
          <Text dimColor>{blockSpark(s.history)}</Text>
          <Text dimColor>◎ {cacheText}</Text>
          <Text dimColor>[{ctxBar}] {ctxText}</Text>
          <Text dimColor>{timerText}</Text>
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box width="100%" justifyContent="flex-end" alignItems="center" gap="sm">
        <Text color={ACCENT} dimColor={!s.isActive}>⚡ {speedText} t/s</Text>
        <Svg
          source={renderSvg(s.history, s.isActive)}
          alt={`Token speed over the last 3 minutes; current ${speedText} tokens per second`}
          width={CHART_W}
          height={CHART_H}
        />
        <Text dimColor>◎ {cacheText}</Text>
        <Text dimColor>[{ctxBar}] {ctxText}</Text>
        <Text dimColor>{timerText}</Text>
      </Box>
    )
  })
}
