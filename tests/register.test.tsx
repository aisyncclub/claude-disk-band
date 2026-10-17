import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseWindows } from '../hooks/register'

const SURFACES = ['terminal', 'desktop'] as const

const BAND = {
  plugin: 'disk-band',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 160,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
} as const

// Real output captured on a Mac (macOS 26), trimmed.
const MAC: Record<string, string> = {
  df: `Filesystem   1024-blocks      Used Available Capacity iused     ifree %iused  Mounted on
/dev/disk3s5   971350180 857808176  67468900    93% 8236678 674689000    1%   /System/Volumes/Data
`,
  vm_stat: `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                                    79830.
Pages active:                                1207057.
Pages inactive:                              1229552.
Pages wired down:                             402536.
Pages occupied by compressor:                 100000.
`,
  sysctl: '68719476736\n',
  top: `CPU usage: 25.11% user, 13.69% sys, 61.19% idle
CPU usage: 27.95% user, 20.64% sys, 51.39% idle
`,
  ps: '/Users/me/.local/bin/claude\n/Applications/Claude.app/Contents/MacOS/Claude\n/usr/bin/login\n/Users/me/.local/bin/claude\n',
  lsof: `COMMAND     PID       USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
rapportd   1341 me   10u  IPv4 0x43337c7479a20651      0t0  TCP *:49152 (LISTEN)
node       2001 me   21u  IPv4 0x43337c7479a20652      0t0  TCP 127.0.0.1:3000 (LISTEN)
python3    2002 me   5u   IPv4 0x43337c7479a20653      0t0  TCP *:8000 (LISTEN)
`,
  route: '   route to: default\n  interface: en0\n',
  ping: '64 bytes from 1.1.1.1: icmp_seq=0 ttl=54 time=5.005 ms\n',
  netstat: `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
en0        1500  <Link#21>   1c:1d:d3:f0:30:b3 676607012     0 422166537641 1665703030     0 1974984831988     0
`,
}

const WIN = {
  disk: { free: 40 * 1024 ** 3, total: 128 * 1024 ** 3 },
  mem: { total: 8 * 1024 ** 3, free: 2 * 1024 ** 3 },
  cpu: 12,
  sessions: 1,
  ports: [5173, 3000],
  online: true,
  pingMs: 23,
  bytes: { rx: 1000, tx: 500 },
}

type Answer = { exitCode: number; stdout: string } | 'fail'

const answer = (on: On, pick: (argv: readonly string[]) => Answer) => {
  const calls: string[][] = []
  on('process.run', async (_$, e) => {
    calls.push([...e.argv])
    const a = pick(e.argv)
    if (a === 'fail') return { deny: 'cannot start' }
    return { value: { exitCode: a.exitCode, stdout: a.stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return calls
}

const mac = (fail: string[] = []) => (argv: readonly string[]): Answer => {
  const name = argv[0] ?? ''
  if (fail.includes(name)) return 'fail'
  return { exitCode: 0, stdout: MAC[name] ?? '' }
}

const start = async ($: Engine, on: On, clock: ReturnType<typeof mock.clock>) => {
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await clock.settle()
}

const texts = async ($: Engine, surface: (typeof SURFACES)[number]) => {
  const ui = await $.ui.mount({ ...BAND, surface })
  return (await ui.findAll({ type: 'Text' })).map(t => t.text).join(' | ')
}

describe('parseWindows', () => {
  test('reads every part', () => {
    const r = parseWindows(JSON.stringify(WIN))
    expect(r?.disk?.pct).toBe(69)
    expect(Math.round(r?.disk?.freeGB ?? 0)).toBe(40)
    expect(r?.mem?.pct).toBe(75)
    expect(r?.cpuPct).toBe(12)
    expect(r?.sessions).toBe(1)
    expect(r?.ports).toEqual([3000, 5173])
    expect(r?.isOnline).toBe(true)
    expect(r?.bytes).toEqual({ rx: 1000, tx: 500 })
  })

  test('one port comes out of PowerShell as a number, not a list', () => {
    expect(parseWindows(JSON.stringify({ ...WIN, ports: 3000 }))?.ports).toEqual([3000])
  })

  test('a part that failed is null, the rest still read', () => {
    const r = parseWindows(JSON.stringify({ ...WIN, cpu: null, ports: null, mem: null }))
    expect(r?.cpuPct).toBe(null)
    expect(r?.ports).toBe(null)
    expect(r?.mem).toBe(null)
    expect(r?.disk?.pct).toBe(69)
  })

  test('output that is not JSON is no reading', () => {
    expect(parseWindows('')).toBe(null)
    expect(parseWindows('powershell.exe : not recognized')).toBe(null)
    expect(parseWindows(null)).toBe(null)
  })
})

describe('on Windows', () => {
  test('runs the PowerShell script and draws its values', async ($, on) => {
    mock.env(on, { OS: 'Windows_NT' })
    mock.store(on)
    const clock = mock.clock(on)
    const calls = answer(on, argv =>
      argv[0] === 'powershell.exe' ? { exitCode: 0, stdout: JSON.stringify(WIN) } : 'fail',
    )
    await start($, on, clock)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe('powershell.exe')
    expect(calls[0]?.at(-1)).toMatch(/scripts\/stats-windows\.ps1$/)
    for (const surface of SURFACES) {
      const all = await texts($, surface)
      expect(all).toContain('69% · 40GB 남음')
      expect(all).toContain('75% · 6.0/8GB')
      expect(all).toContain('12%')
      expect(all).toContain('인터넷 23ms')
      expect(all).toContain('로컬 세션 1개')
      expect(all).toContain('로컬 서버 2개')
      expect(all).not.toContain('알 수 없음')
    }
  })

  test('a part the script could not read shows as unknown, only there', async ($, on) => {
    mock.env(on, { OS: 'Windows_NT' })
    mock.store(on)
    const clock = mock.clock(on)
    answer(on, () => ({ exitCode: 0, stdout: JSON.stringify({ ...WIN, cpu: null, ports: null }) }))
    await start($, on, clock)
    for (const surface of SURFACES) {
      const all = await texts($, surface)
      expect(all).toContain('69% · 40GB 남음')
      expect(all).toContain('로컬 세션 1개')
      expect(all).toContain('로컬 서버 알 수 없음')
      expect(all).toMatch(/CPU \| ░░░░░ \| 알 수 없음/)
    }
  })

  test('PowerShell that cannot start still draws the band, every cell unknown', async ($, on) => {
    mock.env(on, { OS: 'Windows_NT' })
    mock.store(on)
    const clock = mock.clock(on)
    answer(on, () => 'fail')
    await start($, on, clock)
    const all = await texts($, 'terminal')
    expect(all).toContain('디스크')
    expect(all).toContain('인터넷 알 수 없음')
    expect(all).toContain('로컬 세션 알 수 없음')
  })

  test('reads again every 15 seconds', async ($, on) => {
    mock.env(on, { OS: 'Windows_NT' })
    mock.store(on)
    const clock = mock.clock(on)
    const calls = answer(on, () => ({ exitCode: 0, stdout: JSON.stringify(WIN) }))
    await start($, on, clock)
    await clock.advance(15_000)
    await clock.advance(15_000)
    expect(calls).toHaveLength(3)
  })
})

describe('on macOS', () => {
  test('reads with the macOS commands as before', async ($, on) => {
    mock.env(on, {})
    mock.store(on)
    const clock = mock.clock(on)
    const calls = answer(on, mac())
    await start($, on, clock)
    expect(calls.map(c => c[0])).not.toContain('powershell.exe')
    expect(calls.map(c => c[0])).toContain('vm_stat')
    for (const surface of SURFACES) {
      const all = await texts($, surface)
      expect(all).toContain('93% · 64GB 남음')
      expect(all).toContain('49%')
      expect(all).toContain('인터넷 5ms')
      expect(all).toContain('로컬 세션 2개')
      expect(all).toContain('로컬 서버 2개')
      expect(all).not.toContain('알 수 없음')
    }
  })

  test('a command that fails shows unknown in its cell only', async ($, on) => {
    mock.env(on, {})
    mock.store(on)
    const clock = mock.clock(on)
    answer(on, mac(['lsof', 'top']))
    await start($, on, clock)
    const all = await texts($, 'terminal')
    expect(all).toContain('93% · 64GB 남음')
    expect(all).toContain('로컬 서버 알 수 없음')
    expect(all).toMatch(/CPU \| ░░░░░ \| 알 수 없음/)
    expect(all).toContain('로컬 세션 2개')
  })

  test('English labels after the language button', async ($, on) => {
    mock.env(on, {})
    mock.store(on, { 'disk-band.lang': 'en' })
    const clock = mock.clock(on)
    answer(on, mac(['ps']))
    await start($, on, clock)
    const all = await texts($, 'terminal')
    expect(all).toContain('Local sessions unknown')
    expect(all).toContain('64GB free')
  })
})
