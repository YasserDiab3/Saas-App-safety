# Power BI / ERP connectors — HSEHub 360

Outbound data foundations — **not** native SAP/Oracle/Dynamics connectors.

## 1) Edge snapshot: `bi-export`

```
GET|POST https://<project>.supabase.co/functions/v1/bi-export
Headers:
  x-cron-secret: <CRON_SECRET>
  # or Authorization: Bearer <CRON_SECRET|BI_EXPORT_SECRET>
Query / JSON body:
  tenant_id=uuid          (required)
  sheets=Incidents,PTW,Training,NearMiss,HSECorrectiveActions
  format=json|csv         (csv uses first sheet only)
  limit=500               (max 2000)
```

### Power BI

1. Get Data → Web (JSON) or Text/CSV for a single sheet.
2. Pass the secret header via a data gateway / Power Automate proxy if the UI cannot set custom headers.
3. Schedule refresh against the same URL.

### ERP middleware

Poll `bi-export` on a schedule, or consume webhooks below and upsert into the ERP staging tables.

## 2) Outbound webhooks

Configure URLs in Settings → Enterprise → Webhooks.

Documented event keys (also used by notify outbox fan-out):

| Event | When |
|-------|------|
| `incident.created` | New incident saved |
| `capa.closed` | CAPA moved to Closed |
| `ptw.approved` | PTW approved |
| `training.due` | Training expiry reminder |
| `*` | All events |

Payload shape:

```json
{
  "event": "incident.created",
  "at": "2026-07-30T00:00:00.000Z",
  "app": "HSEHub 360",
  "data": {}
}
```

Optional header: `X-HSEHub-Secret` when a secret is stored on the endpoint.

## Limits

- Row cap per sheet on `bi-export` (default 500).
- No OData feed and no certified Power BI custom connector in this release.
