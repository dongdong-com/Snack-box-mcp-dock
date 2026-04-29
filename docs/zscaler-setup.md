# Zscaler 기업 SSL 인증서 설정 가이드

기업 환경에서 Zscaler(또는 기타 SSL 인터셉트 프록시)를 사용하는 경우,  
외부 API 호출 시 `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` 같은 SSL 오류가 발생할 수 있습니다.

---

## 증상

```
Error: unable to get local issuer certificate
  code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
```

Jira API, Google API, Figma API 호출 시 위 오류가 나타나면 이 가이드를 따르세요.

---

## 1. Zscaler 루트 인증서 내보내기 (Windows)

### 방법 A — 브라우저에서 내보내기 (권장)
1. Chrome → `chrome://settings/security` → 인증서 관리
2. 신뢰할 수 있는 루트 인증 기관 탭
3. `Zscaler Root CA` 선택 → 내보내기
4. 형식: **Base-64 encoded X.509 (.CER)** 선택
5. 파일명: `zscaler-root-ca.pem` 으로 저장

### 방법 B — PowerShell
```powershell
# Zscaler 인증서를 PEM 형식으로 내보내기
$cert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like "*Zscaler*" } | Select-Object -First 1
if ($cert) {
    $certPem = "-----BEGIN CERTIFICATE-----`n" + [Convert]::ToBase64String($cert.RawData, 'InsertLineBreaks') + "`n-----END CERTIFICATE-----"
    $certPem | Out-File -FilePath ".\certs\zscaler-root-ca.pem" -Encoding ascii
    Write-Host "✅ 인증서 내보내기 완료"
} else {
    Write-Host "❌ Zscaler 인증서를 찾을 수 없습니다."
}
```

---

## 2. 인증서 파일 배치

내보낸 인증서 파일을 프로젝트 `certs/` 폴더에 복사합니다.

```
saramin-ai-mcp/
└── certs/
    └── zscaler-root-ca.pem   ← 여기에 저장 (gitignore에 포함됨)
```

---

## 3. 환경변수 설정

`.env` 파일에 다음을 추가합니다:

```env
NODE_EXTRA_CA_CERTS=./certs/zscaler-root-ca.pem
```

---

## 4. Jira (mcp-atlassian) Zscaler 설정

`settings.json`의 jira MCP에 다음 env를 추가합니다:

```json
"jira": {
  "command": "node",
  "args": ["./node_modules/.bin/mcp-atlassian"],
  "env": {
    "ATLASSIAN_BASE_URL": "${env:ATLASSIAN_BASE_URL}",
    "ATLASSIAN_EMAIL": "${env:ATLASSIAN_EMAIL}",
    "ATLASSIAN_API_TOKEN": "${env:ATLASSIAN_API_TOKEN}",
    "NODE_EXTRA_CA_CERTS": "${env:NODE_EXTRA_CA_CERTS}",
    "NODE_TLS_REJECT_UNAUTHORIZED": "0"
  }
}
```

> ⚠️ `NODE_TLS_REJECT_UNAUTHORIZED=0` 은 마지막 수단입니다.  
> 가능하면 `NODE_EXTRA_CA_CERTS` 로 인증서를 등록하는 방식을 사용하세요.

---

## 5. 적용 확인

```powershell
# 테스트: Atlassian API 연결 확인
$env:NODE_EXTRA_CA_CERTS = ".\certs\zscaler-root-ca.pem"
node -e "const https = require('https'); https.get('https://your-company.atlassian.net', r => console.log('✅ 연결 성공:', r.statusCode)).on('error', e => console.error('❌', e.message))"
```
