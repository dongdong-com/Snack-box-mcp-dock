# 🍱 Snack-box MCP Dock

Claude Code / Gemini CLI 에서 Jira, Google Workspace, Figma, Axure를  
**단 한 번의 설치**로 모두 사용할 수 있는 MCP 통합 패키지입니다.

---

## 포함 MCP 및 도구

### 📋 Jira (`jira`) — [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) (Python · uvx 실행)
- 이슈 조회·생성·업데이트·전환
- 스프린트·프로젝트·댓글 관리

> ⚠️ `mcp-atlassian` 은 **Python 패키지**입니다 (npm 미등록). `uv` 가 설치되어 있어야 합니다.
> 설치: `brew install uv` · `curl -LsSf https://astral.sh/uv/install.sh | sh` · `winget install astral-sh.uv`

### 🎨 Figma (`figma`)
- 디자인 파일·컴포넌트·변수 조회
- 코드 연결(Code Connect) 지원

### 📊 Google Sheets (`google-sheets`)
- 스프레드시트 읽기·쓰기

### ⚙️ Custom MCP (`custom`) — 통합 커스텀 서버
| 그룹 | 도구 |
|------|------|
| Google Drive | `gdrive_search` `gdrive_read_file` `gdrive_create_file` `gdrive_update_file` `gdrive_delete_file` `gdrive_create_folder` |
| Google Calendar | `calendar_list_events` `calendar_create_event` `calendar_update_event` `calendar_delete_event` |
| Google Tasks | `tasks_list_tasklists` `tasks_list` `tasks_create` `tasks_complete` `tasks_delete` |
| Google Docs | `docs_append_text` |
| Google Slides | `slides_create` `slides_get` `slides_add_slide` |
| Google Meet | `meet_create_space` |
| Axure | `axure_scan_projects` `axure_list_pages` `axure_get_page` `axure_search` `axure_get_summary` `axure_get_flow` |

---

## 사전 요구사항

- **Node.js** v18 이상
- **Python** 3.8 이상 (Google 최초 인증 시 1회만 필요)
- **uv** (Astral) — Jira MCP (`mcp-atlassian` Python 패키지) 의 `uvx` 런타임용
  - macOS: `brew install uv`
  - Linux: `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - Windows: `winget install astral-sh.uv`
- **Claude Code** 또는 **Gemini CLI**
- 기업 내부망 사용 시: Zscaler 루트 인증서 → [docs/zscaler-setup.md](docs/zscaler-setup.md)

---

## 설치

### 1. 레포지토리 클론

```bash
git clone https://github.com/dongdong-com/mcp-dock.git
cd mcp-dock
```

### 2. 자동 설치 (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
```

### 3. 수동 설치

```bash
npm install
cp .env.example .env
mkdir credentials
```

> `npm install` 로 Google SDK(`googleapis`), Axure 파서(`cheerio`), MCP SDK 가 설치됩니다.
> Jira MCP(`mcp-atlassian`) 는 Python 패키지라 `uvx` 가 런타임 시 자동으로 끌어옵니다 (`uv` 사전 설치 필요).

---

## API 토큰 설정

`.env` 파일을 열고 각 토큰을 입력합니다.  
**각 토큰 발급 방법**: [docs/token-guide.md](docs/token-guide.md)

```env
# Jira
JIRA_URL=https://your-company.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=...               # https://id.atlassian.com/manage-profile/security/api-tokens

# Figma
FIGMA_ACCESS_TOKEN=figd_...      # Figma → Settings → Security → Personal access tokens

# Google (OAuth 키 파일 경로)
GOOGLE_OAUTH_PATH=./credentials/gcp-oauth.keys.json
GOOGLE_TOKEN_PATH=./credentials/google-token.json
```

---

## Google 인증 (최초 1회)

### Step 1 — GCP OAuth 키 다운로드

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID 생성 (데스크톱 앱)
3. JSON 다운로드 → `credentials/gcp-oauth.keys.json` 으로 저장

> 필요한 API: Drive, Calendar, Tasks, Docs, Sheets, Slides, Meet  
> 상세 가이드: [docs/token-guide.md#3-google-workspace--drive--sheets--oauth-20](docs/token-guide.md)

### Step 2 — OAuth 인증 실행

```bash
pip install google-auth-oauthlib
python scripts/auth-google.py
```

브라우저가 열리면 Google 계정으로 로그인 → `credentials/google-token.json` 자동 생성됩니다.

---

## Claude Code 설정 적용

`config/settings.example.json` 내용을 Claude Code 설정 파일에 추가합니다.

**프로젝트 설정** (`.vscode/settings.json` 의 `claude.mcpServers`):

```json
{
  "claude.mcpServers": {
    "jira": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "${env:JIRA_URL}",
        "JIRA_USERNAME": "${env:JIRA_USERNAME}",
        "JIRA_API_TOKEN": "${env:JIRA_API_TOKEN}",
        "NODE_EXTRA_CA_CERTS": "${env:NODE_EXTRA_CA_CERTS}"
      }
    },
    "figma": {
      "command": "npx",
      "args": ["-y", "mcp-figma"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "${env:FIGMA_ACCESS_TOKEN}"
      }
    },
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "mcp-google-sheets"],
      "env": {
        "CREDENTIALS_PATH": "${env:GOOGLE_OAUTH_PATH}",
        "TOKEN_PATH": "${env:GOOGLE_TOKEN_PATH}"
      }
    },
    "custom": {
      "command": "node",
      "args": ["./servers/custom-mcp-server.mjs"],
      "env": {
        "GOOGLE_OAUTH_PATH": "${env:GOOGLE_OAUTH_PATH}",
        "GOOGLE_TOKEN_PATH": "${env:GOOGLE_TOKEN_PATH}",
        "AXURE_DEFAULT_DIR": "${env:AXURE_DEFAULT_DIR}",
        "NODE_EXTRA_CA_CERTS": "${env:NODE_EXTRA_CA_CERTS}"
      }
    }
  }
}
```

> 💡 **Windows 한정**: `npx` 명령어가 인식되지 않으면 `"npx"` → `"npx.cmd"` 로 변경하세요.
> `uvx` 는 `.exe` 라 변환 불필요합니다.

---

## Gemini CLI 설정 적용

`~/.gemini/settings.json` 에 동일한 방식으로 추가합니다:

```json
{
  "mcpServers": {
    "jira": {
      "command": "uvx",
      "args": ["mcp-atlassian"],
      "env": {
        "JIRA_URL": "${JIRA_URL}",
        "JIRA_USERNAME": "${JIRA_USERNAME}",
        "JIRA_API_TOKEN": "${JIRA_API_TOKEN}",
        "NODE_EXTRA_CA_CERTS": "${NODE_EXTRA_CA_CERTS}"
      }
    },
    "custom": {
      "command": "node",
      "args": ["./servers/custom-mcp-server.mjs"],
      "env": {
        "GOOGLE_OAUTH_PATH": "${GOOGLE_OAUTH_PATH}",
        "GOOGLE_TOKEN_PATH": "${GOOGLE_TOKEN_PATH}",
        "AXURE_DEFAULT_DIR": "${AXURE_DEFAULT_DIR}",
        "NODE_EXTRA_CA_CERTS": "${NODE_EXTRA_CA_CERTS}"
      }
    }
  }
}
```

> 💡 Gemini CLI는 `${VAR}` 형식, Claude Code는 `${env:VAR}` 형식을 사용합니다.

---

## 기업 환경 (Zscaler) 설정

SSL 인증서 오류가 발생하는 경우 → [docs/zscaler-setup.md](docs/zscaler-setup.md)

```env
# .env 에 추가
NODE_EXTRA_CA_CERTS=./certs/zscaler-root-ca.pem
```

---

## 디렉터리 구조

```
mcp-dock/
├── README.md
├── .env.example              # 환경변수 템플릿 (값은 직접 입력)
├── .gitignore
├── package.json
├── servers/
│   └── custom-mcp-server.mjs # 통합 커스텀 MCP (Google + Axure)
├── config/
│   └── settings.example.json # Claude Code / Gemini 설정 템플릿
├── scripts/
│   ├── setup.ps1             # Windows 자동 설치
│   └── auth-google.py        # Google OAuth 인증
├── docs/
│   ├── token-guide.md        # API 토큰 발급 방법
│   └── zscaler-setup.md      # Zscaler 기업 SSL 설정
└── credentials/              # ← gitignore (직접 생성)
    ├── gcp-oauth.keys.json   # GCP 다운로드 파일
    └── google-token.json     # auth-google.py 실행 후 자동 생성
```

---

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` | [docs/zscaler-setup.md](docs/zscaler-setup.md) 참고 |
| `GOOGLE_OAUTH_PATH not found` | `credentials/gcp-oauth.keys.json` 파일 확인 |
| `GOOGLE_TOKEN_PATH not found` | `python scripts/auth-google.py` 재실행 |
| Jira 401 오류 | `JIRA_API_TOKEN` 재발급 후 `.env` 업데이트 |
| `uvx: command not found` 또는 jira MCP 미연결 | `uv` 미설치 → `brew install uv` / `winget install astral-sh.uv` |
| `404 Not Found: @sooperset/mcp-atlassian` | npm 미등록 패키지. `.mcp.json`/`settings.json` 의 `command` 를 `uvx`, `args` 를 `["mcp-atlassian"]` 으로 변경 |
| Figma `Unauthorized` | `FIGMA_ACCESS_TOKEN` 재발급 |
| Axure 기획서 못 찾음 | `AXURE_DEFAULT_DIR` 경로 확인 |
| `npx` 명령어 오류 (Windows) | `npx` → `npx.cmd` 로 변경 |

---

## 라이선스

MIT
