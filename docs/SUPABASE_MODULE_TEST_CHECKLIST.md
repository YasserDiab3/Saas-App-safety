# Checklist اختبار المديولات على Supabase

> استخدم هذا الملف قبل الإطلاق التجاري. ضع ✅ / ❌ / ⏭️ (تخطي) في عمود **الحالة**.
> البيئة: `useSupabaseBackend=true` · مشروع `tbkajjarkqhsdiabufjv`

---

## 0) المتطلبات المسبقة

| # | التحقق | الحالة |
|---|--------|--------|
| P1 | الهجرات 0001–0011 مطبّقة (`supabase migration list` — Local = Remote) | ☐ |
| P2 | `supabase/scripts/verify_migrations.sql` — كل `ok = true` | ☐ |
| P3 | حساب اختبار A (owner) + حساب B (tenant منفصل) | ☐ |
| P4 | `saas-test.html`: signup → provision → upsert → read → عزل RLS | ☐ |
| P5 | `login.html` → `index.html` → Dashboard يظهر | ☐ |
| P6 | DevTools → Network: طلبات `rpc/` بدون 401/403 غير متوقعة | ☐ |

**أوامر سريعة:**
```bash
supabase link --project-ref tbkajjarkqhsdiabufjv
supabase migration list
supabase db push --yes   # إن وُجدت هجرات معلّقة
cd frontend && npm ci && npm run build
npx serve ../dist
```

---

## 1) اختبارات عامة (مرة واحدة)

| # | السيناريو | الخطوات | متوقّع | الحالة |
|---|-----------|---------|--------|--------|
| G1 | عزل RLS | A يُدرج سجل في `UserTasks` · B يقرأ نفس الورقة | B يرى `[]` | ☐ |
| G2 | Read-only tenant | `tenants.status = 'past_due'` (SQL) · محاولة حفظ | رسالة قراءة فقط | ☐ |
| G3 | الأدوار | عضو `user` vs `owner` | صلاحيات nav مختلفة (`api_me`) | ☐ |
| G4 | Plan gating | tenant على `free` · مديول غير مسموح | عنصر nav مخفي | ☐ |
| G5 | Refresh | حفظ → F5 | البيانات من Supabase (ليس localStorage فقط) | ☐ |
| G6 | i18n | تغيير اللغة أثناء PTW | لا hang / لا loop | ☐ |

---

## 2) legend

| الرمز | المعنى |
|-------|--------|
| **P0** | حرج — يمنع الإطلاق إن فشل |
| **P1** | مهم — CRUD أساسي |
| **P2** | ثانوي / إعدادات / AI |
| **BL** | يستخدم RPC منطق أعمال (0007) وليس CRUD عام |

**أعمدة الاختبار:**
- **Load**: فتح المديول بدون crash JS
- **Read**: تحميل قائمة/بيانات
- **Write**: إنشاء أو تعديل سجل
- **Persist**: Refresh → البيانات باقية
- **RLS**: tenant B لا يرى بيانات A

---

## 3) المديولات — checklist

### Core / إدارة

| المديول | data-section | أوراق Supabase الرئيسية | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|-------------------------|-----|------|------|-------|---------|-----|---------|--------|
| Dashboard | `dashboard` | (مجمّع) | P0 | ☐ | ☐ | — | — | — | بطاقات KPI بدون خطأ | ☐ |
| Profile | `profile` | — | P2 | ☐ | ☐ | ☐ | ☐ | — | | ☐ |
| Users | `users` | Users (config) | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| User Tasks | `user-tasks` | UserTasks | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | BL: `getUserTasksByUserId`, `updateTaskCompletionRate` | ☐ |
| Settings | `settings` | ModuleManagement, SafetyTeamMembers | P1 | ☐ | ☐ | ☐ | ☐ | — | إعدادات شركة/شعار | ☐ |
| App Tester | `apptester` | — | P2 | ☐ | ☐ | — | — | — | أدوات داخلية | ☐ |

### السلامة والحوادث

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| Incidents | `incidents` | Incidents | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | مرفقات قد تحتاج Storage | ☐ |
| Near Miss | `nearmiss` | NearMiss | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Violations | `violations` | Violations | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| HSE | `hse` | HSEMonitoringPlans, HSENonConformities | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Emergency | `emergency` | EmergencyPlans, EmergencyAlerts, AppEmergencyNumbers | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Daily Observations | `daily-observations` | DailyObservations | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Action Tracking | `action-tracking` | ActionTrackingRegister | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Issue Tracking | — | (issuetracking.js) | P2 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Change Management | `change-management` | — | P2 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |

### تصاريح ومخاطر

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| **PTW** | `ptw` | PTW, PTWRegistry, PTWIdMapping | **P0** | ☐ | ☐ | ☐ | ☐ | ☐ | Gate 4 — sequences/id mapping | ☐ |
| Risk Assessment | `risk-assessment` | RiskAssessments | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Risk Matrix | — | (riskmatrix.js) | P2 | ☐ | ☐ | — | — | — | UI فقط | ☐ |
| SOP/JHA | `sop-jha` | SOPJHA | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Issuing Authorities | `issuing-authorities` | — | P2 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |

### موارد بشرية وتدريب

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| Employees | `employees` | Employees, ExternalWorkforceMonthly | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Training | `training` | Training, TrainingCertificates, AnnualTrainingPlans, ContractorTrainings | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | ملف كبير — انتظر تحميل | ☐ |

### مقاولون

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| Contractors | `contractors` | Contractors, ApprovedContractors, Blacklist_Register, … | P0 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Behavior Monitoring | `behavior-monitoring` | BehaviorMonitoring, ContractorBehaviorMonitoring | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |

### معدات وفحوص

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| Fire Equipment | `fire-equipment` | FireEquipment, FireEquipmentAssets | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| PPE | `ppe` | PPE, PPE_Stock, PPEStock, PPE_Transactions | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | alias sheets | ☐ |
| Periodic Inspections | `periodic-inspections` | PeriodicInspectionRecords, DailySafetyCheckList, … | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Chemical Safety | `chemical-safety` | ChemicalSafety | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |

### عيادة (Business Logic)

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| **Clinic** | `clinic` | ClinicVisits, ClinicContractorVisits, Medications, Injuries, SickLeave, ClinicInventory | **P0** | ☐ | ☐ | ☐ | ☐ | ☐ | **BL:** `addClinicVisit` + خصم أدوية ذرّي | ☐ |

### امتثال وأداء

| المديول | data-section | أوراق Supabase | Pri | Load | Read | Write | Persist | RLS | ملاحظات | الحالة |
|---------|--------------|----------------|-----|------|------|-------|---------|-----|---------|--------|
| ISO | `iso` | ISODocuments, DocumentCodes, DocumentVersions | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Legal Documents | `legal-documents` | LegalDocuments | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Safety Budget | `safety-budget` | SafetyBudgets | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Safety KPIs | `safety-performance-kpis` | SafetyPerformanceKPIs, KPIAnnualPlans | P1 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Sustainability | `sustainability` | Sustainability | P2 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Safety Health Mgmt | `safety-health-management` | — | P2 | ☐ | ☐ | ☐ | ☐ | ☐ | | ☐ |
| Reports | — | (reports.js) | P1 | ☐ | ☐ | — | — | — | تقارير/تصدير | ☐ |

### AI

| المديول | data-section | Pri | Load | Read | Write | ملاحظات | الحالة |
|---------|--------------|-----|------|------|-------|---------|--------|
| AI Assistant | `ai-assistant` | P2 | ☐ | ☐ | ☐ | يعتمد API خارجي | ☐ |
| User AI Assistant | — | P2 | ☐ | ☐ | ☐ | | ☐ |

---

## 4) اختبار Business RPCs (0007) — تفصيلي

| Action | RPC | خطوات | متوقّع | الحالة |
|--------|-----|-------|--------|--------|
| `addClinicVisit` | `api_add_clinic_visit` | زيارة + دواء بكمية محددة | خصم مخزون Medications | ☐ |
| `getAllClinicVisits` | `api_get_all_clinic_visits` | فتح مديول العيادة | دمج موظف + مقاول | ☐ |
| `updateTaskCompletionRate` | `api_update_task_completion` | slider تقدّم مهمة | يُحفظ في UserTasks | ☐ |
| `getUserTasksByUserId` | `api_get_user_tasks` | مهام مستخدم محدد | فلترة صحيحة | ☐ |

**اكتشاف actions غير مدعومة:** DevTools → Console → ابحث عن:
`action غير معروف في محوّل SaaS` — سجّل اسم الـ action في جدول المشاكل أدناه.

---

## 5) الفوترة (بعد نشر Stripe)

| # | السيناريو | الحالة |
|---|-----------|--------|
| B1 | `billing.html` → عرض الخطط | ☐ |
| B2 | Checkout Pro → webhook → `tenants.plan_id` | ☐ |
| B3 | `plan-gating.js` يخفي مديولات غير المسموحة | ☐ |
| B4 | `past_due` → write مرفوض (DB + UX) | ☐ |

---

## 6) سجل المشاكل

| # | المديول | Action / الخطأ | Severity | Ticket | الحالة |
|---|---------|----------------|----------|--------|--------|
| 1 | | | | | |
| 2 | | | | | |

---

## 7) معايير Go / No-Go

### Go (إطلاق beta مغلق)
- [ ] P0 modules: Load + Read + Write + Persist ✅
- [ ] G1 عزل RLS ✅
- [ ] Clinic BL (addClinicVisit + خصم أدوية) ✅
- [ ] PTW Load + Read + Write ✅
- [ ] لا أخطاء JS قاتلة في Console عند smoke test

### Go (إطلاق عام)
- [ ] كل ما سبق +
- [ ] Confirm email مفعّل
- [ ] Vercel production build منشور (`dist/`)
- [ ] Stripe live (إن كانت الفوترة مطلوبة)
- [ ] ≥ 90% P1 modules ✅

---

## 8) توقيع

| الدور | الاسم | التاريخ | قرار |
|-------|-------|---------|------|
| QA | | | Go / No-Go |
| Dev | | | Go / No-Go |
| Product | | | Go / No-Go |

---

## مراجع

- `docs/STATUS.md` — حالة الهجرات والمراحل
- `supabase/scripts/verify_migrations.sql` — تحقق DB
- `frontend/ACCEPTANCE_GATES.md` — بوابات UI (Gate 4 = PTW)
- `frontend/saas-test.html` — E2E معزول
