# API 토큰 발급 가이드

각 MCP 서비스에서 토큰/키를 발급받는 방법을 안내합니다.

---

## 1. Jira — Atlassian API Token

**용도**: Jira 이슈 조회·생성·업데이트

### 발급 방법
1. [https://id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) 접속
2. **Create API token** 클릭
3. 토큰 이름 입력 (예: `saramin-mcp`) → Create
4. 생성된 토큰 복사 (다시 볼 수 없음!)

### .env 설정
```env
JIRA_URL=https://your-company.atlassian.net
JIRA_USERNAME=your-email@company.com
JIRA_API_TOKEN=여기에_복사한_토큰
```

> ⚠️ 회사 Atlassian 계정 기준입니다. 개인 Atlassian 계정과 다를 수 있습니다.

---

## 2. Figma — Personal Access Token

**용도**: Figma 디자인 파일 조회, 컴포넌트 분석, 코드 연결

### 발급 방법
1. Figma 앱 또는 [figma.com](https://figma.com) 접속 후 로그인
2. 우측 상단 프로필 이미지 클릭 → **Settings**
3. 왼쪽 메뉴 **Security** 탭 클릭
4. **Personal access tokens** 섹션 → **Generate new token**
5. 토큰 이름 입력 → 만료일 설정 (No expiration 권장) → Generate
6. 생성된 토큰 복사 (다시 볼 수 없음!)

### .env 설정
```env
FIGMA_ACCESS_TOKEN=figd_여기에_복사한_토큰
```

---

## 3. Google Workspace / Drive / Sheets — OAuth 2.0

**용도**: Google Drive 파일 관리, Calendar, Tasks, Docs, Slides, Sheets

Google API는 API Key 대신 OAuth 2.0을 사용합니다.  
최초 1회 브라우저 인증이 필요하며, 이후는 자동 갱신됩니다.

### Step 1 — GCP 프로젝트 생성 및 API 활성화

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **API 및 서비스 → 라이브러리** 에서 다음 API를 모두 활성화:

| API | 용도 |
|-----|------|
| Google Drive API | 파일 관리 |
| Google Calendar API | 일정 |
| Tasks API | 할일 |
| Google Docs API | 문서 |
| Google Sheets API | 스프레드시트 |
| Google Slides API | 프레젠테이션 |
| Google Meet API | 회의 링크 |

### Step 2 — OAuth 2.0 클라이언트 ID 생성

1. **API 및 서비스 → 사용자 인증 정보** 이동
2. **사용자 인증 정보 만들기 → OAuth 클라이언트 ID** 클릭
3. 애플리케이션 유형: **데스크톱 앱** 선택
4. 이름 입력 (예: `saramin-mcp`) → 만들기
5. **JSON 다운로드** → `credentials/gcp-oauth.keys.json` 으로 저장

### Step 3 — OAuth 동의 화면 설정

1. **API 및 서비스 → OAuth 동의 화면**
2. 사용자 유형: **내부** (회사 Google Workspace) 또는 **외부** 선택
3. 앱 이름, 이메일 입력 후 저장

### Step 4 — 최초 인증 실행

```powershell
# 의존성 설치
pip install google-auth-oauthlib

# 인증 스크립트 실행 → 브라우저 창이 열립니다
python scripts/auth-google.py
```

브라우저에서 Google 계정으로 로그인하면 `credentials/google-token.json` 이 자동 생성됩니다.

### .env 설정
```env
GOOGLE_OAUTH_PATH=./credentials/gcp-oauth.keys.json
GOOGLE_TOKEN_PATH=./credentials/google-token.json
```

---

## 4. 토큰 보안 주의사항

| 규칙 | 내용 |
|------|------|
| ❌ git 커밋 금지 | `.env`, `credentials/` 폴더는 `.gitignore`에 포함됨 |
| 🔄 주기적 갱신 | Atlassian/Figma 토큰은 주기적으로 rotate 권장 |
| 👤 최소 권한 | Google API는 필요한 스코프만 활성화 |
| 🏢 계정 구분 | 개인 계정이 아닌 업무 계정으로 발급 권장 |
