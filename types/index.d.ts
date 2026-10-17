export type Disk = { freeGB: number; totalGB: number; pct: number }
export type Mem = { usedGB: number; totalGB: number; pct: number }
export type Bytes = { rx: number; tx: number }

// One reading as the platform reader returns it; a part it could not read is null.
export type Raw = {
  disk: Disk | null
  mem: Mem | null
  cpuPct: number | null
  sessions: number | null
  ports: number[] | null
  isOnline: boolean | null
  pingMs: number
  bytes: Bytes | null
}

// What the band draws; null shows as "unknown" in that cell only.
export type Stats = {
  disk: Disk | null
  mem: Mem | null
  cpuPct: number | null
  sessions: number | null
  ports: number[] | null
  isOnline: boolean | null
  pingMs: number
  downBps: number | null
  upBps: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'disk-band': { reading: Stats | null }
  }
}
