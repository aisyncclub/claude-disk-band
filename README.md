# disk-band

> **클로드 모드 상태 표시줄**: Claude 입력창 위에 내 컴퓨터(맥·윈도우)의 디스크·메모리·CPU·인터넷·세션 상태를 늘 보여줍니다.
> A status bar mod for Claude: your computer's disk, memory, CPU, network and sessions, right above the prompt. macOS and Windows.

![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![license](https://img.shields.io/badge/license-MIT-blue)
![claude mod](https://img.shields.io/badge/Claude-mod-orange)

```
⛁ 디스크 █████ 87% · 123GB 남음     ▦ 메모리 ███░░ 64% · 41.2/64GB     ⚙ CPU ██░░░ 38%
● 인터넷 12ms ↓1.2MB/s ↑85KB/s [▴]     ◈ 로컬 세션 28개     ⬡ 로컬 서버 6개 [▾]     [한→EN] [About]
```

작업하다가 "디스크가 꽉 찼나?", "지금 렌더링 때문에 느린가?", "개발 서버 몇 개 켜뒀지?"가 궁금할 때 터미널을 따로 열 필요가 없습니다.

## 목차

- [주요 기능](#주요-기능)
- [빠른 시작](#빠른-시작)
- [사용법](#사용법)
- [설정 바꾸기](#설정-바꾸기)
- [동작 방식](#동작-방식)
- [요구 사항](#요구-사항)
- [자주 묻는 질문](#자주-묻는-질문)
- [English](#english)
- [라이선스](#라이선스)

## 주요 기능

| 항목 | 보여주는 것 |
| --- | --- |
| ⛁ 디스크 | 사용률 막대와 남은 용량. 50GB 미만 노랑, 20GB 미만 빨강 |
| ▦ 메모리 | 사용률 막대, 퍼센트, 사용량/전체 GB |
| ⚙ CPU | 사용률 막대와 퍼센트 |
| ● 인터넷 | 연결 여부, 응답 시간, 다운로드/업로드 속도 |
| ◈ 로컬 세션 | 이 컴퓨터에서 도는 `claude` 프로세스 수 (데스크톱 앱 본체는 세지 않음) |
| ⬡ 로컬 서버 | node·bun·python 등 개발용 프로그램이 열어 둔 포트 수 |

- 막대는 75% 이상이면 노랑, 90% 이상이면 빨강으로 바뀝니다.
- 한국어/영어 전환 버튼이 있고, 고른 언어는 저장됩니다.
- 15초마다 새로 읽고, 읽는 동안에도 입력창은 멈추지 않습니다.
- 어떤 값을 못 읽으면 그 칸에만 `알 수 없음`이 뜨고 나머지는 그대로 보입니다.
- 설치 후 설정할 것이 없습니다.

## 빠른 시작

Claude Code 터미널 세션에서 한 줄:

```
/plugin install disk-band --marketplace aisyncclub/claude-disk-band
```

`Add marketplace?`에 `y`를 누르고 범위를 고르면 끝입니다. 이후 시작하는 세션부터 띠가 뜹니다.

### 데스크톱 앱에서 쓰기 / 폴더로 직접 쓰기

맥:

```bash
git clone https://github.com/aisyncclub/claude-disk-band.git ~/.claude/mods/disk-band
```

윈도우(PowerShell):

```powershell
git clone https://github.com/aisyncclub/claude-disk-band.git $env:USERPROFILE\.claude\mods\disk-band
```

`~/.claude/settings.json`(윈도우는 `C:\Users\<내 이름>\.claude\settings.json`)의 `env`에 그 폴더를 적으면 새 세션마다 자동으로 로드됩니다.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/<내 이름>/.claude/mods/disk-band"
  }
}
```

윈도우는 `"C:\\Users\\<내 이름>\\.claude\\mods\\disk-band"`처럼 적습니다.

터미널에서 한 번만 써 보려면: `claude --plugin-dir ~/.claude/mods/disk-band`

## 사용법

띠 안의 버튼을 누르면 됩니다.

| 버튼 | 하는 일 |
| --- | --- |
| `[한→EN]` / `[EN→한]` | 글자를 영어/한국어로 바꿉니다 |
| 인터넷 옆 `▴` / `▾` | 다운로드·업로드 속도를 숨기거나 보입니다 |
| 로컬 서버 옆 `▾` / `▴` | 열린 포트 번호를 아래 줄에 펼치거나 접습니다 |
| `[About]` | AI 싱크클럽 소개 링크를 보입니다 |

## 설정 바꾸기

모양과 문구는 모두 [`hooks/register.tsx`](hooks/register.tsx) 한 파일에 있습니다.

| 바꾸고 싶은 것 | 찾을 곳 |
| --- | --- |
| 갱신 주기 | `REFRESH_MS` (기본 15초) |
| 막대 칸 수 | `BAR` (기본 5칸) |
| 색 기준 | `color()`, `diskColor` |
| 한/영 문구 | `TEXT` |
| 개발 서버로 볼 프로그램 | `DEV` (윈도우는 [`scripts/stats-windows.ps1`](scripts/stats-windows.ps1)의 `$dev`도 같이) |
| 윈도우에서 값을 읽는 방법 | [`scripts/stats-windows.ps1`](scripts/stats-windows.ps1) |

고친 뒤에는 `claude plugin validate <폴더>`로 확인하세요.

## 동작 방식

Claude의 모드(플러그인) 기능으로 입력창 위 자리(`AbovePrompt`)에 띠를 그립니다. 15초마다 값을 새로 읽습니다. 맥은 기본 명령을 따로따로 부르고, 윈도우는 PowerShell 스크립트([`scripts/stats-windows.ps1`](scripts/stats-windows.ps1)) 하나를 불러 한 번에 읽습니다. 윈도우 쪽은 명령 출력 대신 .NET·CIM 값을 읽어서 한국어 윈도우든 영어 윈도우든 똑같이 나옵니다.

| 값 | 맥 | 윈도우 |
| --- | --- | --- |
| 디스크 | `df` (데이터 볼륨) | `System.IO.DriveInfo` (시스템 드라이브, 보통 `C:`) |
| 메모리 | `vm_stat`, `sysctl hw.memsize` | `Win32_OperatingSystem` (전체에서 남은 메모리를 뺀 값) |
| CPU | `top` (1초 동안) | `Win32_PerfRawData_PerfOS_Processor` (1초 간격 두 번 읽기) |
| 인터넷 | `ping 1.1.1.1`, `netstat -ib` | `System.Net.NetworkInformation.Ping`, 게이트웨이가 있는 네트워크 장치의 주고받은 양 |
| 세션 | `ps` | `Win32_Process`의 `claude.exe` (데스크톱 앱 본체와 그 도우미는 뺌) |
| 서버 | `lsof` | `Get-NetTCPConnection -State Listen` + 프로세스 이름 |

인터넷 속도는 두 방식 모두 15초 동안 실제로 주고받은 양입니다.

외부 서버로 보내는 데이터는 없습니다. 인터넷 상태 확인용 핑 한 번만 `1.1.1.1`로 나갑니다.

## 요구 사항

- macOS, 또는 Windows 10·11 (기본으로 깔린 Windows PowerShell 5.1을 씁니다)
- 모드를 지원하는 Claude Code (터미널 또는 데스크톱 앱)

## 자주 묻는 질문

**윈도우에서도 되나요?** 됩니다(0.4.0부터). 설치 방법은 맥과 같습니다. 처음 값이 뜨기까지 몇 초 걸릴 수 있습니다.

**리눅스에서도 되나요?** 아직 아닙니다.

**윈도우에서 칸이 전부 `알 수 없음`이에요.** 회사 PC처럼 PowerShell 스크립트 실행이 정책으로 막혀 있으면 값을 못 읽습니다. 띠는 그대로 뜨고, 막힌 값만 비어 보입니다.

**속도가 속도 테스트 결과와 달라요.** 속도 측정이 아니라, 지금 쓰는 네트워크 장치가 15초 동안 실제로 주고받은 양입니다. 아무것도 안 하면 0에 가깝게 나옵니다.

**메모리가 활동 상태 보기와 달라요.** 맥은 활성 + 고정 + 압축된 메모리를 합친 값이라 몇 GB 차이가 날 수 있습니다. 윈도우는 작업 관리자의 "사용 중"과 거의 같습니다.

**로컬 세션 수가 생각보다 많아요.** 대화 중이 아니라 열려만 있는 세션도 셉니다.

**글자 크기를 줄일 수 있나요?** 터미널은 글자 크기를 바꿀 수 없습니다. 터미널 설정의 폰트 크기로 조절하세요.

## English

A status bar mod for Claude Code on macOS and Windows. It draws one small band above the prompt: disk, memory, CPU, internet (latency and live up/down throughput), the number of local `claude` sessions and local dev servers.

```
/plugin install disk-band --marketplace aisyncclub/claude-disk-band
```

Buttons in the band switch Korean/English, hide the speed, expand the port list and show an About link. Or clone the repo to `~/.claude/mods/disk-band` and set `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` to that path. The band is in `hooks/register.tsx`; on macOS it reads `df`, `vm_stat`, `top`, `ping`, `netstat`, `ps` and `lsof`, on Windows one PowerShell script, `scripts/stats-windows.ps1`, that reads .NET and CIM values (so any Windows display language works). A value it cannot read shows as unknown in its own cell.

## 라이선스

MIT. 만든 곳: [AI 싱크클럽](https://aisyncclub.com/about)
