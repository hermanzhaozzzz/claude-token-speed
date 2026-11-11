export type TokenSpeedSnapshot = {
  version: 1
  speed: number | null
  history: number[]
  cacheHit: number | null
  contextPercent: number | null
  peak60m: number | null
  percentOfPeak: number | null
  elapsedSec: number
  isActive: boolean
  hasData: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'token-speed': { snap: TokenSpeedSnapshot }
  }
}
