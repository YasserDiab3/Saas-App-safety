# set-stripe-secrets.ps1 — reads .env from repo root and pushes Stripe secrets to Supabase.
# Usage:  cd clinic-saas ; .\supabase\scripts\set-stripe-secrets.ps1
# Requires: Supabase CLI linked (supabase link --project-ref tbkajjarkqhsdiabufjv)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$envFile = Join-Path $root '.env'

if (-not (Test-Path $envFile)) {
    Write-Host "No .env found. Copy .env.example to .env and fill Stripe keys." -ForegroundColor Yellow
    Write-Host "  copy .env.example .env"
    exit 1
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

$required = @(
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_ENTERPRISE',
    'APP_URL'
)
$missing = @($required | Where-Object { -not $vars.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($vars[$_]) })
if ($missing.Count) {
    Write-Host "Missing in .env:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

if ($vars['STRIPE_SECRET_KEY'] -match 'XXXX|YOUR_|example') {
    Write-Host "STRIPE_SECRET_KEY still looks like a placeholder — edit .env first." -ForegroundColor Red
    exit 1
}

Write-Host "Setting Supabase Edge Function secrets (Stripe + APP_URL)..." -ForegroundColor Cyan
Push-Location $root

$args = @(
    'secrets', 'set',
    "STRIPE_SECRET_KEY=$($vars['STRIPE_SECRET_KEY'])",
    "STRIPE_WEBHOOK_SECRET=$($vars['STRIPE_WEBHOOK_SECRET'])",
    "STRIPE_PRICE_PRO=$($vars['STRIPE_PRICE_PRO'])",
    "STRIPE_PRICE_ENTERPRISE=$($vars['STRIPE_PRICE_ENTERPRISE'])",
    "APP_URL=$($vars['APP_URL'].TrimEnd('/'))"
)

# Optional explicit Supabase vars (create-checkout uses anon for user JWT)
if ($vars.ContainsKey('SUPABASE_URL') -and $vars['SUPABASE_URL']) {
    $args += "SUPABASE_URL=$($vars['SUPABASE_URL'])"
}
if ($vars.ContainsKey('SUPABASE_ANON_KEY') -and $vars['SUPABASE_ANON_KEY']) {
    $args += "SUPABASE_ANON_KEY=$($vars['SUPABASE_ANON_KEY'])"
}
if ($vars.ContainsKey('SUPABASE_SERVICE_ROLE_KEY') -and $vars['SUPABASE_SERVICE_ROLE_KEY']) {
    $args += "SUPABASE_SERVICE_ROLE_KEY=$($vars['SUPABASE_SERVICE_ROLE_KEY'])"
}

& supabase @args
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }

Pop-Location
Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Run sync_stripe_prices.sql in Supabase SQL Editor"
Write-Host "  2. node supabase/scripts/verify_stripe_setup.mjs"
Write-Host "  3. Test billing.html with card 4242 4242 4242 4242"
