# ضبط Stripe Secrets — دليل خطوة بخطوة

> المشروع: `tbkajjarkqhsdiabufjv`  
> Edge Functions منشورة: `create-checkout`, `stripe-webhook`

---

## 1) ما الذي تحتاجه؟

| Secret | من أين | مطلوب لـ |
|--------|--------|----------|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → **Secret key** (`sk_test_...`) | checkout + webhook |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → endpoint → **Signing secret** (`whsec_...`) | webhook فقط |
| `STRIPE_PRICE_PRO` | Stripe → Products → Pro → Price ID (`price_...`) | checkout + تعيين الخطة |
| `STRIPE_PRICE_ENTERPRISE` | Stripe → Products → Enterprise → Price ID | checkout + تعيين الخطة |
| `APP_URL` | رابط Vercel (بدون `/` في النهاية) | redirect بعد Checkout |

> Supabase يحقن تلقائياً: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — لا حاجة لإعادة ضبطها إلا للتأكيد.

---

## 2) Stripe Dashboard — إعداد المنتجات

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Test mode** (للتجربة).
2. **Product catalog** → **Add product**:
   - **Pro** — اشتراك شهري → انسخ `price_...`
   - **Enterprise** — اشتراك شهري → انسخ `price_...`
3. **Developers → Webhooks → Add endpoint**:
   - URL:
     ```
     https://tbkajjarkqhsdiabufjv.supabase.co/functions/v1/stripe-webhook
     ```
   - Events:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `checkout.session.completed`
     - `invoice.payment_failed`
   - انسخ **Signing secret** → `whsec_...`

---

## 3) ملف `.env` محلي (لا يُرفع إلى Git)

```powershell
cd "d:\App\Cluda Ai\clinic-saas"
copy .env.example .env
# عدّل .env وضع مفاتيح Stripe الحقيقية + APP_URL
```

مثال `.env`:

```env
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_1...
STRIPE_PRICE_ENTERPRISE=price_1...
APP_URL=https://saas-app-safety.vercel.app
```

---

## 4) رفع الأسرار إلى Supabase

```powershell
cd "d:\App\Cluda Ai\clinic-saas"
.\supabase\scripts\set-stripe-secrets.ps1
```

أو يدوياً:

```powershell
supabase secrets set `
  STRIPE_SECRET_KEY="sk_test_..." `
  STRIPE_WEBHOOK_SECRET="whsec_..." `
  STRIPE_PRICE_PRO="price_..." `
  STRIPE_PRICE_ENTERPRISE="price_..." `
  APP_URL="https://YOUR-VERCEL-URL.vercel.app"
```

---

## 5) مزامنة `price_id` في قاعدة البيانات

في **Supabase SQL Editor** — عدّل ثم Run:

```sql
-- supabase/scripts/sync_stripe_prices.sql
update app.plans set price_id = 'price_XXXX_PRO'     where id = 'pro';
update app.plans set price_id = 'price_XXXX_ENT'     where id = 'enterprise';
```

---

## 6) التحقق

```powershell
node supabase/scripts/verify_stripe_setup.mjs
```

**اختبار يدوي:**
1. سجّل دخول → `/billing.html`
2. اضغط **اشترك** على Pro → Stripe Checkout (test card `4242 4242 4242 4242`)
3. بعد النجاح → `tenants.plan_id` = `pro` في Supabase Table Editor

---

## 7) استكشاف الأخطاء

| العرض | السبب المحتمل | الحل |
|-------|---------------|------|
| `checkout failed: unknown plan` | `STRIPE_PRICE_*` غير مضبوط | `set-stripe-secrets.ps1` |
| Webhook 400 signature | `STRIPE_WEBHOOK_SECRET` خاطئ | أعد نسخ `whsec_` من Stripe |
| الخطة لا تتغير بعد الدفع | webhook لا يصل | تحقق من URL + events في Stripe |
| redirect خاطئ بعد الدفع | `APP_URL` خاطئ | طابق رابط Vercel |

---

## 8) Live mode (بعد الاختبار)

1. Stripe → Live mode → منتجات + أسعار جديدة
2. `sk_live_...` + webhook live + `whsec_` جديد
3. `supabase secrets set` بالمفاتيح live
4. حدّث `sync_stripe_prices.sql` بـ price IDs live
