# SOC 2 / ISO 27001 — HSEHub 360 readiness

## What the product provides

| Control area | In product |
|--------------|------------|
| Multi-tenant isolation (RLS) | Postgres RLS + `require_tenant` patterns |
| MFA (TOTP) | Supabase Auth MFA + in-app setup |
| Audit evidence export | Settings → Evidence CSV |
| Encrypted backup | Client-side `.hsebackup` (passphrase never leaves browser) |
| SSO / SCIM readiness | Enterprise settings + Edge SCIM pilot |
| Compliance readiness UI | Settings → Security & Compliance center |

## What certification still requires (outside the app)

- Independent auditor / assessor engagement
- Written policies (AUP, incident response, vendor risk, HR security)
- Evidence of operational cadence (access reviews, DR tests, change management)
- Legal entity scope, trust services criteria mapping, Statement of Applicability (ISO 27001)

**HSEHub does not issue SOC 2 or ISO 27001 certificates.** The in-app center tracks technical readiness and exports evidence for your auditor.
