# SSO / SAML / SCIM — HSEHub 360

## ما يوفّره المنتج الآن

| طبقة | الحالة |
|------|--------|
| واجهة إعدادات المستأجر (نطاقات، Provider ID، ACS) | جاهزة |
| زر **دخول عبر SSO** في `/login` | جاهز (`signInWithSSO`) |
| تسجيل IdP على Supabase Auth | يدوي عبر CLI / Dashboard (خطة Team+) |
| SCIM 2.0 تجريبي | Edge `scim-v2` — إنشاء/حذف مستخدم (pilot) |

## متطلبات المنصة

1. مشروع Supabase على خطة تدعم **SAML SSO** (Team / Enterprise عادةً).
2. تسجيل مزوّد الهوية:

```bash
npx supabase sso add --type saml --project-ref tbkajjarkqhsdiabufjv \
  --metadata-url "https://YOUR_IDP/.../federationmetadata.xml" \
  --domains company.com
```

3. انسخ `provider id` الناتج إلى الإعدادات → Enterprise → Provider ID.
4. في IdP عيّن:
   - **ACS URL:** `https://tbkajjarkqhsdiabufjv.supabase.co/auth/v1/sso/saml/acs`
   - **Entity ID:** حسب وثائق Supabase للمشروع

## تدفق الدخول (SP-initiated)

1. المستخدم يدخل بريده `user@company.com` في `/login`.
2. يضغط **دخول عبر SSO المؤسسي**.
3. التطبيق يستدعي `SaaS.signInWithSSO({ domain: 'company.com' })`.
4. التحويل إلى IdP ثم العودة لـ `/` بجلسة Supabase.

## SCIM التجريبي

```bash
npx supabase functions deploy scim-v2 --no-verify-jwt --project-ref tbkajjarkqhsdiabufjv
npx supabase secrets set SCIM_BEARER_TOKEN="long-random-token" --project-ref tbkajjarkqhsdiabufjv
```

- Base: `https://tbkajjarkqhsdiabufjv.supabase.co/functions/v1/scim-v2`
- Auth: `Authorization: Bearer <SCIM_BEARER_TOKEN>`
- مدعوم حالياً: `ServiceProviderConfig`, `Schemas`, `POST /Users`, `DELETE /Users/{id}`
- غير مكتمل: Groups، فلترة متقدمة، ربط تلقائي بالمستأجر — مرحلة لاحقة

## حدود صريحة

- بدون تسجيل IdP على المشروع، زر SSO يعرض خطأ من Auth (متوقع).
- SCIM التجريبي **منصّة واحدة** (رمز واحد) — ليس SCIM متعدد المستأجرين كاملاً.
- الإبقاء على حساب owner بكلمة مرور للطوارئ إلزامي.
