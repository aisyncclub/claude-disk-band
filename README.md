# disk-band

Claude 입력창 위에 내 컴퓨터 상태를 보여주는 작은 띠입니다. · A small status band above the Claude prompt.

```
⛁ 디스크 █████ 87% · 123GB 남음     ▦ 메모리 ███░░ 64% · 41.2/64GB     ⚙ CPU ██░░░ 38%
● 인터넷 12ms ↓1.2MB/s ↑85KB/s [▴]     ◈ 로컬 세션 28개     ⬡ 로컬 서버 6개 [▾]     [한→EN] [About]
```

## 보여주는 것

| 항목 | 내용 |
| --- | --- |
| 디스크 | 사용률 막대와 남은 용량. 50GB 미만이면 노랑, 20GB 미만이면 빨강 |
| 메모리 | 사용률 막대, 퍼센트, 사용량/전체 GB |
| CPU | 사용률 막대와 퍼센트 |
| 인터넷 | 연결 여부(●), 응답 시간, 다운로드/업로드 속도. `▴`/`▾` 버튼으로 속도 숨김·표시 |
| 로컬 세션 | 이 컴퓨터에서 도는 `claude` 프로세스 수 |
| 로컬 서버 | node·bun·python 등 개발용 프로그램이 열어 둔 포트 수. `▾` 버튼으로 포트 번호 펼침 |
| 한→EN | 한국어/영어 전환 (선택은 저장됨) |
| About | AI 싱크클럽 소개 링크 표시 |

막대는 75% 이상이면 노랑, 90% 이상이면 빨강으로 바뀝니다. 15초마다 새로 읽습니다.

## 설치

Claude Code 터미널 세션에서:

```
/plugin install disk-band --marketplace aisyncclub/claude-disk-band
```

`Add marketplace?`에 `y`를 누르고 범위를 고르면 끝입니다. 이후 시작하는 세션부터 띠가 뜹니다.

### 데스크톱 앱 / 직접 폴더로 쓰기

```bash
git clone https://github.com/aisyncclub/claude-disk-band.git ~/.claude/mods/disk-band
```

그다음 `~/.claude/settings.json`의 `env`에 폴더를 적습니다.

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/Users/<내 이름>/.claude/mods/disk-band"
  }
}
```

터미널에서 한 번만 써 보려면 `claude --plugin-dir ~/.claude/mods/disk-band`.

## 사용법

- 띠 안의 `[한→EN]`을 누르면 글자가 영어로 바뀝니다. 다시 누르면 한국어입니다.
- 인터넷 옆 `▴`를 누르면 속도가 숨고, `▾`를 누르면 다시 보입니다.
- 로컬 서버 옆 `▾`를 누르면 열린 포트 번호가 아래 줄에 펼쳐집니다.
- `[About]`을 누르면 AI 싱크클럽 소개 링크가 나옵니다.

## 요구 사항과 알아둘 점

- **macOS 전용**입니다. `df`, `vm_stat`, `top`, `netstat`, `route`, `lsof`, `ping`을 씁니다.
- 인터넷 상태는 `1.1.1.1`에 핑을 한 번 보내 확인합니다. 속도는 속도 측정이 아니라, 지금 쓰는 네트워크 장치가 15초 동안 실제로 주고받은 양입니다.
- 메모리는 활성 + 고정 + 압축된 메모리를 합친 값이라 활동 상태 보기와 몇 GB 다를 수 있습니다.
- 로컬 세션 수에는 열려만 있고 대화하지 않는 세션도 포함됩니다.
- 터미널은 글자 크기를 바꿀 수 없습니다. 크기는 터미널 설정의 폰트 크기로 조절하세요.

## 고치기

모양과 문구는 [`hooks/register.tsx`](hooks/register.tsx)에 있습니다.

- 갱신 주기: `REFRESH_MS`
- 막대 칸 수: `BAR`
- 색 기준: `color()`, `diskColor`
- 문구(한/영): `TEXT`

고친 뒤 `claude plugin validate <폴더>`로 확인하세요.

## English

A status band above the Claude Code prompt for macOS: disk, memory, CPU, internet (latency and live up/down throughput), number of local `claude` sessions and local dev servers. A button toggles Korean/English; others hide the speed, expand the port list, or show the AI Sync Club link.

```
/plugin install disk-band --marketplace aisyncclub/claude-disk-band
```

Or clone the repo to `~/.claude/mods/disk-band` and set `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` to that path. macOS only.

## 만든 곳 · About

[AI 싱크클럽](https://aisyncclub.com/about) · MIT License
