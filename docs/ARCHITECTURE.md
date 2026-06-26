# المعمارية — HSE SaaS

## 1. النموذج العام

```
                  ┌─────────────────────────────┐
   المستخدم  ───► │  Frontend SPA (Vercel)      │
                  │  - 38 مديول (يُعاد استخدامها)│
                  │  - backend-client.js        │
                  │  - saas-adapter.js          │  ← طبقة النقل (Supabase)
                  └──────────────┬──────────────┘
                                 │  fetch {action, data} + JWT
                                 ▼
                  ┌─────────────────────────────┐
                  │ Supabase Edge Function /api │  ← موجّه actions
                  │  - يتحقق من JWT → tenant_id  │
                  │  - يحوّل action → SQL        │
                  └──────────────┬──────────────┘
                                 │  (service role + tenant filter)
                                 ▼
                  ┌─────────────────────────────┐
                  │ Postgres (Supabase)         │
                  │  - كل جدول فيه tenant_id     │
                  │  - RLS مفعّل                 │
                  │  - Storage للمرفقات          │
                  └─────────────────────────────┘

   Stripe ──webhook──► /stripe-webhook ──► تحديث subscriptions/tenant.plan
```

## 2. عقد طبقة النقل (الثابت الذي يجب الحفاظ عليه)

الواجهة تستدعي حصراً:
```js
Backend.sendRequest({ action: '<name>', data: {…} })
  → SaaSAdapter → Supabase RPC
  → Promise<{ success: boolean, data?: any, message?: string }>
```
أي backend يحترم هذا العقد يُشغّل المديولات الـ38 دون تعديل. هذا أساس استراتيجية
**Strangler-Fig**: `sendRequest` يُوجَّه إلى Supabase RPC بدل أي خادم قديم.

## 3. تعدد المستأجرين (Multi-Tenancy)

- **النموذج:** Postgres مشترك + عمود `tenant_id (uuid)` على كل جدول بيانات.
- **العزل:** سياسات **RLS** على كل جدول:
  ```sql
  create policy tenant_isolation on <table>
    using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
    with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
  ```
- **الـ JWT:** عند الدخول يُحقن `tenant_id` كـ custom claim (عبر Auth Hook / app_metadata).
- **لا ثقة بالعميل:** `/api` يستخرج `tenant_id` من الـ JWT فقط، لا من جسم الطلب.

## 4. جداول الـ SaaS الأساسية

| الجدول | الغرض |
|--------|-------|
| `tenants` | المؤسسة (id, name, logo, plan, status, trial_ends_at, created_at) |
| `tenant_users` | عضوية مستخدم في مؤسسة + الدور (owner/admin/safety_officer/user) |
| `plans` | الخطط وحدودها (max_users, modules[], storage_mb, price_id) |
| `subscriptions` | حالة الاشتراك (Stripe sub id, status, current_period_end) |
| `invitations` | دعوات الانضمام للمؤسسة |
| `audit_log` | سجل العمليات الحساسة لكل مستأجر |

ثم ~40 جدول أعمال (مُحوّلة من أوراق Sheets) كلها بـ `tenant_id`:
`users, clinic_visits, clinic_contractor_visits, medications, injuries,
sick_leave, incidents, near_miss, ptw, training, ppe, ppe_stock, violations,
contractors, employees, daily_observations, daily_safety_checklist,
periodic_inspection_records, user_tasks, chemical_register, safety_budget, …`

## 5. الفوترة (Stripe)

- خطط معرّفة في Stripe + جدول `plans` المحلي.
- Checkout → عند النجاح ينشئ/يحدّث `subscriptions`.
- **Webhook** (`/stripe-webhook`) يستمع لـ
  `customer.subscription.created|updated|deleted`, `invoice.payment_failed`
  → يحدّث `subscriptions.status` و `tenants.plan/status`.
- **plan-gating**: يُعاد استخدام مديول `ModuleManagement` الحالي لتفعيل/تعطيل
  المديولات حسب `plans.modules`. تجاوز الحدود → رسالة ترقية. فشل الدفع → وضع قراءة-فقط.

## 6. مسار الهجرة (Strangler-Fig)

1. الـ actions العامة أولاً (`readFromSheet/saveToSheet/appendToSheet/
   updateSingleRowInSheet/batchReadSheets/login`) — تُشغّل غالبية الوحدات.
2. ثم منطق العمل الخاص دفعة-بدفعة (خصم أدوية العيادة، مهام المستخدمين، تسلسل DSC…).
3. كل مديول يُتحقق منه تعاقدياً (نفس شكل الاستجابة القديم) قبل اعتماده.

## 7. ضمانات العزل عن الإنتاج

- مستودع Git منفصل (بلا remote للإنتاج).
- مشروع Supabase + Vercel + Stripe خاص.
- لا `clasp` ولا spreadsheet مشترك.
- `clinic-repo` مرجع للقراءة فقط — لا يُمَس.
