export type Stats = {
  freeGB: number
  totalGB: number
  diskPct: number
  memUsedGB: number
  memTotalGB: number
  memPct: number
  cpuPct: number
  sessions: number
  ports: number[]
  isOnline: boolean
  pingMs: number
  downBps: number
  upBps: number
}

declare module 'claude-code' {
  interface PluginState {
    'disk-band': { stats: Stats | null }
  }
}
