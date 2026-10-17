import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Stats } from '../types'

const stats = atom({ plugin: 'disk-band', key: 'stats' } as const, null)

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
} as const

const parseDisk = (out: string) => {
  const cols = out.trim().split('\n')[1]?.trim().split(/\s+/)
  if (!cols || cols.length < 4) return null
  const total = Number(cols[1])
  const free = Number(cols[3])
  if (!total || Number.isNaN(free)) return null
  return { freeGB: free / 1024 / 1024, totalGB: total / 1024 / 1024, diskPct: Math.round((1 - free / total) * 100) }
}

const parseMem = (vm: string, total: number) => {
  const page = Number(/page size of (\d+) bytes/.exec(vm)?.[1] ?? 16384)
  const pages = (label: string) => Number(new RegExp(`${label}:\\s+(\\d+)`).exec(vm)?.[1] ?? 0)
  const used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page
  return { memUsedGB: used / GB, memTotalGB: total / GB, memPct: Math.round((used / total) * 100) }
}

const parseCpu = (top: string) => {
  const lines = top.split('\n').filter(l => l.startsWith('CPU usage'))
  const idle = Number(/([\d.]+)% idle/.exec(lines[lines.length - 1] ?? '')?.[1])
  return Number.isNaN(idle) ? 0 : Math.round(100 - idle)
}

const parseSessions = (ps: string) => ps.split('\n').filter(l => l.trim().split('/').pop() === 'claude').length

const parsePorts = (lsof: string) => {
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

const parseBytes = (out: string) => {
  const line = out.split('\n').find(l => l.includes('<Link#'))
  const cols = line?.trim().split(/\s+/)
  if (!cols || cols.length < 10) return null
  return { rx: Number(cols[cols.length - 5]), tx: Number(cols[cols.length - 2]) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    let isBusy = false
    let prev: { rx: number; tx: number; at: number } | null = null

    const refresh = async () => {
      if (isBusy) return
      isBusy = true
      try {
        const run = (argv: string[]) => $.process.run(argv, { timeoutMs: 8000 })
        const [disk, vm, mem, top, ps, lsof] = await Promise.all([
          run(['df', '-k', '/System/Volumes/Data']),
          run(['vm_stat']),
          run(['sysctl', '-n', 'hw.memsize']),
          run(['top', '-l', '2', '-n', '0', '-s', '1']),
          run(['ps', '-axo', 'comm=']),
          run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN']),
        ])
        const route = await run(['route', '-n', 'get', 'default'])
        const iface = /interface:\s+(\S+)/.exec(route.stdout)?.[1]
        const [ping, bytes] = await Promise.all([
          run(['ping', '-c', '1', '-W', '1500', '1.1.1.1']),
          iface ? run(['netstat', '-ib', '-I', iface]) : Promise.resolve(null),
        ])
        const at = await $.clock.now()
        const cur = bytes ? parseBytes(bytes.stdout) : null
        let downBps = 0
        let upBps = 0
        if (cur && prev && at > prev.at) {
          const sec = (at - prev.at) / 1000
          downBps = Math.max(0, (cur.rx - prev.rx) / sec)
          upBps = Math.max(0, (cur.tx - prev.tx) / sec)
        }
        if (cur) prev = { ...cur, at }
        const d = parseDisk(disk.stdout)
        if (!d) return
        const reading: Stats = {
          ...d,
          ...parseMem(vm.stdout, Number(mem.stdout.trim())),
          cpuPct: parseCpu(top.stdout),
          sessions: parseSessions(ps.stdout),
          ports: parsePorts(lsof.stdout),
          isOnline: ping.exitCode === 0,
          pingMs: Number(/time=([\d.]+) ms/.exec(ping.stdout)?.[1] ?? 0),
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
    const diskColor = s.freeGB < 20 ? 'red' : s.freeGB < 50 ? 'yellow' : 'green'

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box gap={5}>
          <Box gap={1}>
            <Text>⛁</Text>
            <Text dimColor>{t('disk')}</Text>
            <Text color={diskColor}>{bar(s.diskPct)}</Text>
            <Text dimColor>{s.diskPct}% · {s.freeGB.toFixed(0)}GB {t('free')}</Text>
          </Box>
          <Box gap={1}>
            <Text>▦</Text>
            <Text dimColor>{t('mem')}</Text>
            <Text color={color(s.memPct)}>{bar(s.memPct)}</Text>
            <Text dimColor>{s.memPct}% · {s.memUsedGB.toFixed(1)}/{s.memTotalGB.toFixed(0)}GB</Text>
          </Box>
          <Box gap={1}>
            <Text>{'⚙\uFE0E'}</Text>
            <Text dimColor>CPU</Text>
            <Text color={color(s.cpuPct)}>{bar(s.cpuPct)}</Text>
            <Text dimColor>{s.cpuPct}%</Text>
          </Box>
        </Box>
        <Box gap={5}>
          <Box gap={1}>
            <Text color={s.isOnline ? 'green' : 'red'}>●</Text>
            <Text dimColor>
              {s.isOnline ? `${t('net')} ${Math.round(s.pingMs)}ms` : `${t('net')} ${t('offline')}`}
            </Text>
            {isSpeedHidden ? null : (
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
              {t('sessions')} {s.sessions}{t('unit')}
            </Text>
          </Box>
          <Box gap={1}>
            <Text>⬡</Text>
            <Text dimColor>
              {t('servers')} {s.ports.length}{t('unit')}
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
            {'  '}{t('show')}: {s.ports.length ? s.ports.join('  ') : '-'}
          </Text>
        ) : null}
      </Box>
    )
  })
}
