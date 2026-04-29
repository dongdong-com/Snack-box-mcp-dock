"""
Google OAuth 최초 인증 스크립트
실행하면 브라우저가 열리고, 로그인 후 google-token.json 이 생성됩니다.
이후 MCP 서버가 토큰을 자동 갱신합니다.

사용법:
  pip install google-auth-oauthlib
  python scripts/auth-google.py
"""

import os
import json
import sys
from pathlib import Path

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("❌ 의존성 누락: pip install google-auth-oauthlib")
    sys.exit(1)

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent.parent
OAUTH_PATH  = Path(os.environ.get("GOOGLE_OAUTH_PATH", BASE_DIR / "credentials" / "gcp-oauth.keys.json"))
TOKEN_PATH  = Path(os.environ.get("GOOGLE_TOKEN_PATH", BASE_DIR / "credentials" / "google-token.json"))

# ── 필요한 Google API 권한 범위 ────────────────────────────────────────────────
SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/presentations",
    "https://www.googleapis.com/auth/meetings.space.created",
]

def main():
    if not OAUTH_PATH.exists():
        print(f"❌ OAuth 키 파일 없음: {OAUTH_PATH}")
        print("→ GCP Console에서 OAuth 2.0 클라이언트 ID를 생성하고 JSON을 다운로드하세요.")
        print("→ 자세한 방법: docs/token-guide.md")
        sys.exit(1)

    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"🔐 OAuth 인증 시작...")
    print(f"   OAuth 파일: {OAUTH_PATH}")
    print(f"   토큰 저장: {TOKEN_PATH}")

    flow = InstalledAppFlow.from_client_secrets_file(str(OAUTH_PATH), SCOPES)
    creds = flow.run_local_server(port=0)

    # 토큰을 JSON으로 저장 (MCP 서버가 읽을 수 있는 형식)
    token_data = {
        "token":         creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri":     creds.token_uri,
        "client_id":     creds.client_id,
        "client_secret": creds.client_secret,
        "scopes":        list(creds.scopes) if creds.scopes else SCOPES,
    }
    if creds.expiry:
        token_data["expiry_date"] = int(creds.expiry.timestamp() * 1000)

    with open(TOKEN_PATH, "w") as f:
        json.dump(token_data, f, indent=2)

    print(f"\n✅ 인증 완료! 토큰 저장됨: {TOKEN_PATH}")
    print("   이제 MCP 서버를 시작할 수 있습니다.")

if __name__ == "__main__":
    main()
