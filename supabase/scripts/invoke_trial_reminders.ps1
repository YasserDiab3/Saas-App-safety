# invoke_trial_reminders.ps1 — daily cron ping for trial email reminders
# Requires: CRON_SECRET set in Supabase Edge Function secrets
param(
    [string]$ProjectRef = "tbkajjarkqhsdiabufjv",
    [string]$CronSecret = $env:CRON_SECRET
)

if (-not $CronSecret) {
    Write-Error "Set CRON_SECRET env var (must match Supabase function secret)"
    exit 1
}

$url = "https://$ProjectRef.supabase.co/functions/v1/trial-reminders"
$headers = @{
    "x-cron-secret" = $CronSecret
    "Content-Type"  = "application/json"
}

$res = Invoke-RestMethod -Method POST -Uri $url -Headers $headers -Body "{}"
$res | ConvertTo-Json -Depth 5
