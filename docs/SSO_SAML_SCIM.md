# SSO / SAML / SCIM — HSEHub 360

## الحالة التشغيلية (محدَّثة)

| فحص | نتيجة |
|------|--------|
| نقاط SP (`sso info`) | متاحة (ACS + Entity ID) |
| تفعيل `saml_enabled` على Auth | **معطّل** — API يرجع `402`: يحتاج خطة **Pro فأعلى** |
| IdP مسجّل | لا — بعد ترقية الخطة + `--register` |
| IdP المفضّل | **Microsoft Entra ID** |
| SCIM Edge `scim-v2` | منشور + سر `SCIM_BEARER_TOKEN` مضبوط |

**حاجز الإنتاج الحالي:** ارفع مشروع Supabase إلى Pro (أو أعلى)، ثم:

```bash
node supabase/scripts/sso-activate.mjs
# يحاول تفعيل saml_enabled تلقائياً
```

ملف الحالة: [`docs/SSO_ACTIVATION_STATUS.json`](SSO_ACTIVATION_STATUS.json).

## ما يوفّره المنتج

| طبقة | الحالة |
|------|--------|
| واجهة إعدادات المستأجر (نطاقات، Provider ID، ACS، org_code، قائمة تفعيل) | جاهزة |
| زر **دخول عبر SSO** في `/login` | جاهز (`signInWithSSO` + `providerId` اختياري من `SAAS_CONFIG.sso`) |
| تسجيل IdP على Supabase Auth | سكربت: `node supabase/scripts/sso-activate.mjs --register` |
| SCIM 2.0 تجريبي | Edge `scim-v2` |

## الرمز المؤسسي ≠ SSO

`org_code` معرّف للمستأجر (دعم/فوترة). **لا** يفعّل SAML ولا يُستخدم كدخول.

## نقاط SP (للصق في IdP)

```
ACS URL:    https://tbkajjarkqhsdiabufjv.supabase.co/auth/v1/sso/saml/acs
Entity ID:  https://tbkajjarkqhsdiabufjv.supabase.co/auth/v1/sso/saml/metadata
```

## تفعيل IdP (Entra)

1. في Entra: تطبيق Enterprise → SAML → انسخ Federation Metadata URL.
2. سجّل على Supabase:

```bash
# Windows PowerShell
$env:SSO_METADATA_URL="https://login.microsoftonline.com/<TENANT_ID>/federationmetadata/2007-06/federationmetadata.xml"
$env:SSO_DOMAINS="company.com"
node supabase/scripts/sso-activate.mjs --register
```

أو:

```bash
npx supabase sso add --type saml --project-ref tbkajjarkqhsdiabufjv \
  --metadata-url "https://login.microsoftonline.com/<TENANT_ID>/federationmetadata/2007-06/federationmetadata.xml" \
  --domains company.com
```

3. انسخ `provider id` من `npx supabase sso list --project-ref tbkajjarkqhsdiabufjv` إلى:
   - الإعدادات → Enterprise → Provider ID، و/أو
   - `SAAS_CONFIG.sso.providerId` في [`frontend/js/saas/saas-config.js`](../frontend/js/saas/saas-config.js)
4. في IdP عيّن ACS + Entity ID أعلاه.
5. تحقق: `node supabase/scripts/sso-activate.mjs --smoke`

## تدفق الدخول (SP-initiated)

1. المستخدم يدخل بريده `user@company.com` في `/login`.
2. يضغط **دخول عبر SSO المؤسسي**.
3. التطبيق يستدعي `SaaS.signInWithSSO({ domain, providerId? })`.
4. التحويل إلى IdP ثم العودة لـ `/` بجلسة Supabase.

## SCIM التجريبي

```bash
npx supabase functions deploy scim-v2 --no-verify-jwt --project-ref tbkajjarkqhsdiabufjv
npx supabase secrets set SCIM_BEARER_TOKEN="long-random-token" --project-ref tbkajjarkqhsdiabufjv
```

- Base: `https://tbkajjarkqhsdiabufjv.supabase.co/functions/v1/scim-v2`
- Auth: `Authorization: Bearer <SCIM_BEARER_TOKEN>`
- مدعوم: `ServiceProviderConfig`, `Schemas`, `POST /Users`, `DELETE /Users/{id}`
- غير مكتمل: Groups، فلترة متقدمة، ربط تلقائي بالمستأجر

## حدود صريحة

- بدون تسجيل IdP، زر SSO يعرض خطأ من Auth (متوقع) — السكربت `--smoke` يتحقق من ذلك.
- SCIM التجريبي **منصّة واحدة** (رمز واحد).
- الإبقاء على حساب owner بكلمة مرور للطوارئ إلزامي.
