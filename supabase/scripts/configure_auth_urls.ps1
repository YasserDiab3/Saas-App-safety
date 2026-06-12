# configure_auth_urls.ps1 — set Site URL + redirect URLs via Management API.
# Requires SUPABASE_ACCESS_TOKEN in .env (https://supabase.com/dashboard/account/tokens)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$envFile = Join-Path $root '.env'
$vars = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $vars[$matches[1]] = $matches[2].Trim().Trim('"') }
  }
}
$token = $vars['SUPABASE_ACCESS_TOKEN']
if (-not $token) { Write-Host 'Missing SUPABASE_ACCESS_TOKEN in .env' -ForegroundColor Red; exit 1 }
$appUrl = ($vars['APP_URL'] -replace '/$','')
$body = @{
  site_url = $appUrl
  uri_allow_list = "$appUrl/**,$appUrl/login,$appUrl/signup,http://localhost:3000/**"
  mailer_autoconfirm = $false
  external_email_enabled = $true
} | ConvertTo-Json
$headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
Invoke-RestMethod -Method Patch -Uri 'https://api.supabase.com/v1/projects/tbkajjarkqhsdiabufjv/config/auth' -Headers $headers -Body $body
Write-Host "Auth URLs updated for $appUrl" -ForegroundColor Green
