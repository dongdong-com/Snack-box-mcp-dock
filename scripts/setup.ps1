# Saramin AI MCP — Windows 자동 설치 스크립트
# 실행: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Saramin AI MCP Setup (Windows)"        -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ── 1. Node.js 버전 확인 ──────────────────────────────────────────────────────
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "❌ Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 설치하세요." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green

# ── 2. npm 의존성 설치 ────────────────────────────────────────────────────────
Write-Host "`n📦 npm 패키지 설치 중..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "❌ npm install 실패" -ForegroundColor Red; exit 1 }
Write-Host "✅ npm 패키지 설치 완료" -ForegroundColor Green

# ── 3. .env 파일 생성 ─────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "`n📝 .env 파일 생성됨 → 값을 채워주세요:" -ForegroundColor Yellow
    Write-Host "   ATLASSIAN_API_TOKEN, FIGMA_ACCESS_TOKEN, GOOGLE_OAUTH_PATH 등" -ForegroundColor Gray
} else {
    Write-Host "✅ .env 파일 이미 존재" -ForegroundColor Green
}

# ── 4. credentials 폴더 생성 ──────────────────────────────────────────────────
if (-not (Test-Path "credentials")) {
    New-Item -ItemType Directory -Path "credentials" | Out-Null
    Write-Host "✅ credentials/ 폴더 생성됨" -ForegroundColor Green
}

# ── 5. Google 인증 안내 ───────────────────────────────────────────────────────
Write-Host "`n🔐 Google 인증 설정:" -ForegroundColor Yellow
Write-Host "   1. credentials/ 폴더에 gcp-oauth.keys.json 파일 복사"
Write-Host "   2. python scripts/auth-google.py 실행 → 브라우저에서 로그인"
Write-Host "   3. google-token.json 자동 생성됨"

# ── 6. 완료 안내 ──────────────────────────────────────────────────────────────
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  설치 완료! 다음 단계:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  1. .env 파일에 API 토큰 입력"
Write-Host "  2. credentials/gcp-oauth.keys.json 복사"
Write-Host "  3. python scripts/auth-google.py (Google 인증)"
Write-Host "  4. config/settings.example.json → Claude/Gemini 설정에 적용"
Write-Host "`n  📖 자세한 내용: README.md"
