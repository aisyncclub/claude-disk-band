import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Bytes, Disk, Mem, Raw, Stats } from '../types'

// 'reading', not the 0.3 'stats': a value of the old shape left in the session is never read
const stats = atom({ plugin: 'disk-band', key: 'reading' } as const, null)

const REFRESH_MS = 15_000
const BAR = 5
const ABOUT_URL = 'https://aisyncclub.com/about'
const GB = 1024 * 1024 * 1024
const DEV = /^(node|bun|deno|python|ruby|php|vite|next|esbuild|remotion)/

type Lang = 'ko' | 'en'
const TEXT = {
  disk: { ko: '디스크', en: 'Disk' },
  free: { ko: '남음', en: 'free' },
  mem: { ko: '메모리', en: 'Memory' },
  sessions: { ko: '로컬 세션', en: 'Local sessions' },
  servers: { ko: '로컬 서버', en: 'Local servers' },
  unit: { ko: '개', en: '' },
  show: { ko: '포트', en: 'ports' },
  about: { ko: 'AI 싱크클럽 소개', en: 'About AI Sync Club' },
  net: { ko: '인터넷', en: 'Internet' },
  online: { ko: '연결됨', en: 'Online' },
  offline: { ko: '끊김', en: 'Offline' },
  unknown: { ko: '알 수 없음', en: 'unknown' },
} as const

export const parseDisk = (out: string | null): Disk | null => {
  const cols = out?.trim().split('\n')[1]?.trim().split(/\s+/)
  if (!cols || cols.length < 4) return null
  const total = Number(cols[1])
  const free = Number(cols[3])
  if (!total || Number.isNaN(free)) return null
  return { freeGB: free / 1024 / 1024, totalGB: total / 1024 / 1024, pct: Math.round((1 - free / total) * 100) }
}

export const parseMem = (vm: string | null, total: number): Mem | null => {
  if (!vm || !total) return null
  const page = Number(/page size of (\d+) bytes/.exec(vm)?.[1] ?? 16384)
  const pages = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(vm)?.[1] ?? 0)
  const used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page
  return { usedGB: used / GB, totalGB: total / GB, pct: Math.round((used / total) * 100) }
}

export const parseCpu = (top: string | null) => {
  const lines = (top ?? '').split('\n').filter(l => l.startsWith('CPU usage'))
  const idle = Number(/([\d.]+)% idle/.exec(lines[lines.length - 1] ?? '')?.[1])
  return Number.isNaN(idle) ? null : Math.round(100 - idle)
}

export const parseSessions = (ps: string | null) =>
  ps === null ? null : ps.split('\n').filter(l => l.trim().split('/').pop() === 'claude').length

export const parsePorts = (lsof: string | null) => {
  if (lsof === null) return null
  const ports = new Set<number>()
  for (const line of lsof.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/)
    if (!cols[0] || !DEV.test(cols[0])) continue
    const port = Number(cols[8]?.split(':').pop())
    if (port) ports.add(port)
  }
  return [...ports].sort((a, b) => a - b)
}

const rate = (bps: number) =>
  bps >= 1024 * 1024 ? `${(bps / 1024 / 1024).toFixed(1)}MB/s` : `${Math.round(bps / 1024)}KB/s`

export const parseBytes = (out: string | null): Bytes | null => {
  const line = out?.split('\n').find(l => l.includes('<Link#'))
  const cols = line?.trim().split(/\s+/)
  if (!cols || cols.length < 10) return null
  return { rx: Number(cols[cols.length - 5]), tx: Number(cols[cols.length - 2]) }
}

// What the PowerShell script prints (scripts/stats-windows.ps1); each part may be null.
export const parseWindows = (out: string | null): Raw | null => {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(out ?? '') as Record<string, unknown>
  } catch {
    return null
  }
  if (!j || typeof j !== 'object') return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
  const disk = obj(j.disk)
  const freeB = num(disk.free)
  const totalB = num(disk.total)
  const mem = obj(j.mem)
  const memTotal = num(mem.total)
  const memFree = num(mem.free)
  const bytes = obj(j.bytes)
  const rx = num(bytes.rx)
  const tx = num(bytes.tx)
  const cpu = num(j.cpu)
  const sessions = num(j.sessions)
  const ports = Array.isArray(j.ports) ? j.ports : typeof j.ports === 'number' ? [j.ports] : null
  return {
    disk: totalB && freeB !== null ? { freeGB: freeB / GB, totalGB: totalB / GB, pct: Math.round((1 - freeB / totalB) * 100) } : null,
    mem:
      memTotal && memFree !== null
        ? { usedGB: (memTotal - memFree) / GB, totalGB: memTotal / GB, pct: Math.round(((memTotal - memFree) / memTotal) * 100) }
        : null,
    cpuPct: cpu === null ? null : Math.round(cpu),
    sessions,
    ports: ports === null ? null : ports.map(Number).filter(p => p > 0).sort((a, b) => a - b),
    isOnline: typeof j.online === 'boolean' ? j.online : null,
    pingMs: num(j.pingMs) ?? 0,
    bytes: rx !== null && tx !== null ? { rx, tx } : null,
  }
}

// What the plugins beneath answer when none of them draws: nothing, or a Box with nothing in it.
const isEmpty = (tree: unknown) => {
  if (!tree || typeof tree !== 'object') return true
  const { type, children } = tree as { type?: unknown; children?: unknown }
  return type === 'Box' && (!Array.isArray(children) || children.length === 0)
}

type Run = (argv: string[], timeoutMs?: number) => Promise<{ exitCode: number; stdout: string } | null>

const readMac = async (run: Run): Promise<Raw> => {
  const out = (r: { stdout: string } | null) => r?.stdout ?? null
  const [disk, vm, mem, top, ps, lsof, route] = await Promise.all([
    run(['df', '-k', '/System/Volumes/Data']),
    run(['vm_stat']),
    run(['sysctl', '-n', 'hw.memsize']),
    run(['top', '-l', '2', '-n', '0', '-s', '1']),
    run(['ps', '-axo', 'comm=']),
    run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN']),
    run(['route', '-n', 'get', 'default']),
  ])
  const iface = /interface:\s+(\S+)/.exec(route?.stdout ?? '')?.[1]
  const [ping, bytes] = await Promise.all([
    run(['ping', '-c', '1', '-W', '1500', '1.1.1.1']),
    iface ? run(['netstat', '-ib', '-I', iface]) : Promise.resolve(null),
  ])
  return {
    disk: parseDisk(out(disk)),
    mem: parseMem(out(vm), Number(out(mem)?.trim())),
    cpuPct: parseCpu(out(top)),
    sessions: parseSessions(out(ps)),
    ports: parsePorts(out(lsof)),
    isOnline: ping ? ping.exitCode === 0 : null,
    pingMs: Number(/time=([\d.]+) ms/.exec(ping?.stdout ?? '')?.[1] ?? 0),
    bytes: parseBytes(out(bytes)),
  }
}

const readWindows = async (run: Run, script: string): Promise<Raw> => {
  const r = await run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], 20_000)
  return (
    parseWindows(r?.stdout ?? null) ?? {
      disk: null,
      mem: null,
      cpuPct: null,
      sessions: null,
      ports: null,
      isOnline: null,
      pingMs: 0,
      bytes: null,
    }
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    let isBusy = false
    let prev: { rx: number; tx: number; at: number } | null = null
    const isWindows = (await $.env.get('OS')) === 'Windows_NT' || /^[A-Za-z]:[\\/]/.test($.plugin.root)
    const script = `${$.plugin.root}/scripts/stats-windows.ps1`

    // A command that cannot start or overruns is null: its cell reads "unknown", the rest still show.
    const run: Run = (argv, timeoutMs = 8000) => $.process.run(argv, { timeoutMs }).catch(() => null)

    const refresh = async () => {
      if (isBusy) return
      isBusy = true
      try {
        const raw = isWindows ? await readWindows(run, script) : await readMac(run)
        const at = await $.clock.now()
        const cur = raw.bytes
        let downBps: number | null = cur ? 0 : null
        let upBps: number | null = cur ? 0 : null
        if (cur && prev && at > prev.at) {
          const sec = (at - prev.at) / 1000
          downBps = Math.max(0, (cur.rx - prev.rx) / sec)
          upBps = Math.max(0, (cur.tx - prev.tx) / sec)
        }
        if (cur) prev = { ...cur, at }
        const reading: Stats = {
          disk: raw.disk,
          mem: raw.mem,
          cpuPct: raw.cpuPct,
          sessions: raw.sessions,
          ports: raw.ports,
          isOnline: raw.isOnline,
          pingMs: raw.pingMs,
          downBps,
          upBps,
        }
        await update($, stats, () => reading)
      } catch {
        // keep the last reading
      } finally {
        isBusy = false
      }
    }

    void refresh()
    $.clock.every(REFRESH_MS, refresh)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, stats)
    if (e.props.hasSurvey || s === null) return next(e)

    // Another mod may draw in this same place (a row of buttons, say). Ask what the
    // plugins beneath drew and keep it under this band, so neither hides the other.
    const below = await next(e).catch(() => null)

    const isSpeedHidden = (await $.store.get('disk-band.speedHidden')) === true
    const isAboutOpen = (await $.store.get('disk-band.about')) === true
    const isPortsOpen = (await $.store.get('disk-band.ports')) === true
    const lang: Lang = (await $.store.get('disk-band.lang')) === 'en' ? 'en' : 'ko'
    const t = (k: keyof typeof TEXT) => TEXT[k][lang]

    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const color = (pct: number) => (pct >= 90 ? 'red' : pct >= 75 ? 'yellow' : 'green')
    const bar = (pct: number) => {
      const filled = Math.max(0, Math.min(BAR, Math.round((pct / 100) * BAR)))
      return '█'.repeat(filled) + '░'.repeat(BAR - filled)
    }
    const empty = '░'.repeat(BAR)
    const diskColor = !s.disk ? undefined : s.disk.freeGB < 20 ? 'red' : s.disk.freeGB < 50 ? 'yellow' : 'green'
    const count = (n: number | null) => (n === null ? t('unknown') : `${n}${t('unit')}`)

    const band = (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={5}>
          <Box gap={1}>
            <Text>⛁</Text>
            <Text dimColor>{t('disk')}</Text>
            {s.disk ? <Text color={diskColor}>{bar(s.disk.pct)}</Text> : <Text dimColor>{empty}</Text>}
            <Text dimColor>
              {s.disk ? `${s.disk.pct}% · ${s.disk.freeGB.toFixed(0)}GB ${t('free')}` : t('unknown')}
            </Text>
          </Box>
          <Box gap={1}>
            <Text>▦</Text>
            <Text dimColor>{t('mem')}</Text>
            {s.mem ? <Text color={color(s.mem.pct)}>{bar(s.mem.pct)}</Text> : <Text dimColor>{empty}</Text>}
            <Text dimColor>
              {s.mem ? `${s.mem.pct}% · ${s.mem.usedGB.toFixed(1)}/${s.mem.totalGB.toFixed(0)}GB` : t('unknown')}
            </Text>
          </Box>
          <Box gap={1}>
            <Text>{'⚙\uFE0E'}</Text>
            <Text dimColor>CPU</Text>
            {s.cpuPct === null ? <Text dimColor>{empty}</Text> : <Text color={color(s.cpuPct)}>{bar(s.cpuPct)}</Text>}
            <Text dimColor>{s.cpuPct === null ? t('unknown') : `${s.cpuPct}%`}</Text>
          </Box>
        </Box>
        <Box gap={5}>
          <Box gap={1}>
            {s.isOnline === null ? <Text dimColor>●</Text> : <Text color={s.isOnline ? 'green' : 'red'}>●</Text>}
            <Text dimColor>
              {s.isOnline === null
                ? `${t('net')} ${t('unknown')}`
                : s.isOnline
                  ? `${t('net')} ${Math.round(s.pingMs)}ms`
                  : `${t('net')} ${t('offline')}`}
            </Text>
            {isSpeedHidden || s.downBps === null || s.upBps === null ? null : (
              <Text dimColor>
                ↓{rate(s.downBps)} ↑{rate(s.upBps)}
              </Text>
            )}
            <Button
              key="speed"
              label={isSpeedHidden ? '▾' : '▴'}
              onPress={() => $.store.set('disk-band.speedHidden', !isSpeedHidden)}
            />
          </Box>
          <Box gap={1}>
            <Text>◈</Text>
            <Text dimColor>
              {t('sessions')} {count(s.sessions)}
            </Text>
          </Box>
          <Box gap={1}>
            <Text>⬡</Text>
            <Text dimColor>
              {t('servers')} {count(s.ports === null ? null : s.ports.length)}
            </Text>
            <Button
              key="ports"
              label={isPortsOpen ? '▴' : '▾'}
              onPress={() => $.store.set('disk-band.ports', !isPortsOpen)}
            />
          </Box>
          <Button
            key="lang"
            label={lang === 'ko' ? '한→EN' : 'EN→한'}
            onPress={() => $.store.set('disk-band.lang', lang === 'ko' ? 'en' : 'ko')}
          />
          <Button
            key="about"
            label="About"
            onPress={() => $.store.set('disk-band.about', !isAboutOpen)}
          />
        </Box>
        {isAboutOpen ? (
          <Box gap={1}>
            <Text dimColor>{'  '}{t('about')}</Text>
            <Link href={ABOUT_URL}>{ABOUT_URL}</Link>
          </Box>
        ) : null}
        {isPortsOpen ? (
          <Text dimColor>
            {'  '}{t('show')}: {s.ports === null ? t('unknown') : s.ports.length ? s.ports.join('  ') : '-'}
          </Text>
        ) : null}
      </Box>
    )

    return isEmpty(below) ? band : (
      <Box flexDirection="column">
        {band}
        {below}
      </Box>
    )
  })
}
