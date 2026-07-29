# notify-dispatch cron

Hourly (or daily) schedule recommended:

```bash
# Supabase Dashboard → Edge Functions → notify-dispatch → Cron Jobs
# Or curl from an external scheduler:
curl -X POST "$SUPABASE_URL/functions/v1/notify-dispatch" \
  -H "x-cron-secret: $CRON_SECRET"
```

Required secrets: `CRON_SECRET`, `SMTP_*` (email). Optional: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`.
