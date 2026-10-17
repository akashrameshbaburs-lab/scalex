# ScaleX one-command demo.
# Brings the stack up and smoke-tests every endpoint end-to-end.
# Usage: .\scripts\demo.ps1

$ErrorActionPreference = "Stop"
$Base = "http://localhost:8080"

Write-Host "[1/4] Starting ScaleX (db, redis, 3x api, nginx)..." -ForegroundColor Cyan
docker compose up --build -d

Write-Host "[2/4] Waiting for readiness..." -ForegroundColor Cyan
$deadline = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Seconds 3
    try {
        $ready = (Invoke-RestMethod -Uri "$Base/healthz/ready" -TimeoutSec 3).status
    } catch { $ready = "down" }
    Write-Host "  status: $ready"
} while ($ready -ne "ready" -and (Get-Date) -lt $deadline)

if ($ready -ne "ready") { throw "Stack did not become ready in time" }
Write-Host "  ready." -ForegroundColor Green

Write-Host "[3/4] Smoke test..." -ForegroundColor Cyan

$created = Invoke-RestMethod -Uri "$Base/api/shorten" -Method Post `
    -ContentType "application/json" `
    -Body (@{ url = "https://github.com/scalex" } | ConvertTo-Json)
Write-Host "  shortUrl  : $($created.shortUrl)"

$resp = Invoke-WebRequest -Uri "$($created.shortUrl)" -MaximumRedirection 0 `
    -UseBasicParsing -ErrorAction SilentlyContinue
Write-Host "  redirect  : $($resp.StatusCode) (X-Cache: $($resp.Headers['X-Cache']))"

$stats = Invoke-RestMethod -Uri "$Base/api/stats/$($created.code)"
Write-Host "  stats     : $($stats.clicks) clicks -> $($stats.originalUrl)"

Write-Host "[4/4] Load test (k6 via Docker)..." -ForegroundColor Cyan
docker run --rm -v "${PWD}:/app" -w /app --network scalex_default `
    grafana/k6 run k6/load-test.js --env BASE_URL=http://nginx `
    --env RATE=200 --env DURATION=10s --env CODES="$($created.code)"

Write-Host "`nDone. Dashboard/health: $Base/healthz" -ForegroundColor Green
