# HSEHub 360 — System Architecture Document

> **منصة SaaS متعددة المستأجرين (multi-tenant)** لإدارة السلامة والصحة والبيئة (HSE).  
> تدعم 42 وحدة وظيفية، دخول موحد، صلاحيات تفصيلية، تقارير، لوحات تحكم، وإدارة اشتراكات.

---

## 1. Technologies

| Layer | Technology |
|-------|-----------|
| Frontend | HTML/CSS/JS خالص (zero framework) — Tailwind CSS via CDN, FontAwesome 6, Cairo font |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions) |
| Auth | Supabase Auth + custom JWT مع `tenant_id` في `app_metadata` |
| Database | PostgreSQL — multi-tenant schema with generic `app.records` table (sheet system) |
| Deployment | Vercel (SPA + rewrites + CSP headers) |
| Build | esbuild (`scripts/build-frontend-prod.mjs`) |
| Storage | Supabase Storage (files, photos) |
| Billing | Stripe (via Edge Functions, optional) |
| Service Worker | Cache management — version bump on every commit |
| RTL | Full Arabic support (`dir="rtl"`, `lang="ar"`) |

---

## 2. Project Structure

```
saas-app-safety/
├── frontend/
│   ├── index.html                    # Entry point (~13700 lines — contains everything)
│   ├── login.html                    # Standalone login page
│   ├── service-worker.js             # Service Worker
│   ├── manifest.json                 # PWA manifest
│   ├── version.json                  # Auto-bumped on commit
│   ├── vercel.json                   # Vercel deploy config + CSP
│   ├── package.json                  # esbuild build script
│   ├── css/
│   ├── assets/                       # Brand, images, icons
│   ├── js/
│   │   ├── app-bootstrap.js          # Bootstrap — start(), init(), phases
│   │   ├── modules/
│   │   │   ├── modules-loader.js     # Dynamic module loader (32+ modules)
│   │   │   ├── app-utils.js          # Utils, AppState, permissions (~9368 lines)
│   │   │   ├── app-ui.js             # Global UI (~11184 lines)
│   │   │   ├── app-services.js       # Service aggregator
│   │   │   ├── app-events.js         # App events
│   │   │   ├── auth.js               # Authentication system
│   │   │   ├── dashboard.js          # Dashboard
│   │   │   ├── i18n-core.js          # Translation system (~4491 lines)
│   │   │   ├── dynamic-module-loader.js
│   │   │   ├── dom-safety-utils.js
│   │   │   ├── realtime-sync-manager.js
│   │   │   ├── error-handling.js
│   │   │   ├── lazy-loader.js
│   │   │   ├── enhanced-loader.js
│   │   │   ├── backup-ui.js
│   │   │   ├── services/
│   │   │   │   ├── data-manager.js           # Data management + sync queue
│   │   │   │   ├── backend-client.js         # Backend RPC client
│   │   │   │   ├── approval-circuits.js      # Approval workflow circuits
│   │   │   │   ├── audit-log.js
│   │   │   │   ├── user-activity-log.js
│   │   │   │   ├── workflow.js               # Workflow engine
│   │   │   │   ├── smart-cache.js
│   │   │   │   ├── cloud-storage-integration.js
│   │   │   │   ├── user-version-tracker.js
│   │   │   │   ├── ai-assistant.js
│   │   │   │   └── issue-tracking.js
│   │   │   └── modules/               # 42 modules
│   │   │       ├── ppe.js             # (~6404 lines)
│   │   │       ├── clinic.js
│   │   │       ├── incidents.js
│   │   │       ├── training.js
│   │   │       ├── employees.js
│   │   │       ├── ... (42 files total)
│   │   │       └── apptester.js
│   │   └── saas/                      # SaaS / Supabase layer
│   │       ├── saas-config.js
│   │       ├── saas-adapter.js        # Contract adapter between modules & Supabase
│   │       ├── supabase-bootstrap.js
│   │       ├── saas-auth-*.js         # Auth storage, gate, fields
│   │       ├── saas-session.js
│   │       ├── saas-tenant-cache.js
│   │       ├── plan-gating.js         # Plan restrictions
│   │       ├── saas-mfa.js
│   │       ├── saas-billing*.js
│   │       └── ...
│   └── scripts/
│       └── build-frontend-prod.mjs
├── supabase/
│   └── migrations/                    # 46 sequential SQL files
│       ├── 0001_saas_core.sql
│       ├── 0002_records_store.sql
│       ├── 0003_seed.sql
│       ├── ...
│       └── 0046_*.sql
```

---

## 3. Database Schema (PostgreSQL / Supabase)

### 3.1 Core schema (`app` namespace)

| Table | Purpose |
|-------|---------|
| `app.plans` | Subscription plans (free, pro, enterprise) |
| `app.tenants` | Organizations (multi-tenant) |
| `app.profiles` | User accounts (1-1 with `auth.users`) |
| `app.tenant_users` | User-tenant membership (role, permissions) |
| `app.tenant_modules` | Module enable/disable per tenant |
| `app.sheets` | Logical sheet registry (48 sheets) |
| `app.records` | **The universal generic store** — `(tenant_id, sheet, id, data jsonb)` |
| `app.subscriptions` | Subscriptions |
| `app.billing_*` | Billing / invoices |
| `app.storage_*` | Storage tracking |

### 3.2 The Records Store (architectural core)

**Innovation**: One generic table `app.records` instead of 48 separate tables.

```sql
CREATE TABLE app.records (
  tenant_id  UUID NOT NULL REFERENCES app.tenants(id) ON DELETE CASCADE,
  sheet      TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, sheet, id)
);
```

- 48 "sheets" registered in `app.sheets` (PPE, Incidents, ClinicVisits, Employees, Training, ...)
- GIN index on `data` enables search/filter inside JSONB
- Single RLS policy: `tenant_id = app.current_tenant_id()`

### 3.3 Registered Sheets (from `0003_seed.sql`)

| Sheet | Module |
|-------|--------|
| ActionTrackingRegister | action-tracking |
| AnnualTrainingPlans | training |
| ApprovedContractors | contractors |
| BehaviorMonitoring | behavior-monitoring |
| ChemicalSafety | chemical-safety |
| ClinicVisits | clinic |
| ClinicContractorVisits | clinic |
| Contractors | contractors |
| DailyObservations | daily-observations |
| Employees | employees |
| FireEquipment | fire-equipment |
| Incidents | incidents |
| Injuries | clinic |
| LegalDocuments | legal-documents |
| Medications | clinic |
| NearMiss | nearmiss |
| PPE | ppe |
| PPEStock | ppe |
| PPE_Transactions | ppe |
| PTW | ptw |
| RiskAssessments | risk-assessment |
| SafetyBudgets | safety-budget |
| Training | training |
| Violations | violations |
| *... 48 total* | |

### 3.4 RLS (Row Level Security)

- One policy for all records: `tenant_id = app.current_tenant_id()`
- `tenant_id` extracted from JWT (`app_metadata → tenant_id`)
- Helper functions: `app.current_tenant_id()`, `app.current_user_id()`

---

## 4. Frontend Architecture

### 4.1 Script Load Order (index.html)

```
 1. uploadmanager-suppressor.js      # Browser extension noise suppression
 2. saas-config.js                    # Supabase config
 3. saas-auth-storage.js             # Session storage
 4. saas-auth-gate.js                # Auth gate
 5. enhanced-loader.js + lazy-loader.js
 6. saas-config, saas-auth-storage, saas-brand, saas-version
 7. supabase-bootstrap.js, saas-adapter.js, saas-tenant-cache.js
 8. saas-session.js, plan-gating.js, saas-trial-notify.js
 9. app-utils.js                     # Utils, AppState, MODULE_DETAILED_PERMISSIONS
10. dom-safety-utils.js
11. Data Manager + services (8 files)
12. app-services.js                  # Service aggregator
13. i18n-core.js                     # Translation
14. training.js                      # (heavy module — preloaded)
15. app-ui.js                        # UI
16. auth.js                          # Auth
17. dashboard.js                     # Dashboard
18. users.js → apptester.js          # 42 modules
19. app-events.js                    # Events
20. app-bootstrap.js                 # Bootstrap
21. dynamic-module-loader.js
22. backup-ui.js
23. dashboard-enhancements.js
```

### 4.2 Module Pattern

Every module follows this pattern:

```javascript
const ModuleName = {
  state: {
    activeTab: '...',
    /* per-module state, cache, filters */
  },
  _t(key, fallback) { /* translate */ },
  applyModuleI18n(root) { /* apply translations to DOM */ },
  load(container) { /* render UI into container */ },
  /* ... other methods */
};

// Export
(function() {
  if (typeof window !== 'undefined') window.ModuleName = ModuleName;
})();
```

### 4.3 Global Objects

| Object | Role | Key Methods |
|--------|------|-------------|
| `AppState` | Global state | `appData`, `currentUser`, `debugMode` |
| `UI` | User interface | `showMainApp()`, `navigateTo()`, `showLoginScreen()` |
| `Utils` | Utilities | `escapeHTML()`, `safeLog()`, `safeError()`, `hashPassword()` |
| `Notification` | Notifications | `success()`, `error()`, `info()` |
| `Loading` | Loading screen | `show()`, `hide()` |
| `DataManager` | Data persistence | `save()`, `load()`, `syncQueue` |
| `Backend` | Server communication | `sendToAppsScript(action, data)` |
| `Auth` | Authentication | `login()`, `logout()`, `checkRememberedUser()` |
| `SaaSAdapter` | Supabase adapter | `sendRequest(req)` — single entry point |

### 4.4 Common UI Patterns

- **Modal**: `modal-overlay` + `modal-content` + `modal-header` + `modal-body`
- **Forms**: Section cards with 4px colored left border (indigo, emerald, amber)
- **Tables**: Sortable + filters + inline search
- **Export**: PDF via `jspdf` + `html2canvas`, Excel via sheet export
- **Search**: Input with dropdown (client-side matching)
- **Cache**: TTL-based in module state (2 min for lists, 5 min for stock)

### 4.5 App Bootstrap Phases

```
INIT → CORE → SERVICES → UI → MODULES → READY
```

Each phase in `AppBootstrap.start()` with timing and fallback logic.

---

## 5. Backend Layer (saas-adapter.js)

### 5.1 Single Contract

```javascript
SaasAdapter.sendRequest({ action, data }) → Promise<{ success, data?, message? }>
```

### 5.2 Action Types

1. **Generic transport**: `readFromSheet`, `saveToSheet`, `appendToSheet`, `updateSingleRowInSheet`, `batchReadSheets`, `login`
2. **Named CRUD**: `getAllX`, `addX`, `updateX`, `deleteX` → resolved to sheet via `ACTION_MAP`
3. **Business logic**: `deductMedication`, `processApproval`, `generateSequence` → handled by RPC

### 5.3 Entity-to-Sheet Mapping (73 entities)

```javascript
SHEET_BY_ENTITY = {
  Incidents: 'Incidents', NearMiss: 'NearMiss', Training: 'Training',
  PPE: 'PPE', Employees: 'Employees', ClinicVisits: 'ClinicVisits',
  Medications: 'Medications', Violations: 'Violations',
  FireEquipment: 'FireEquipment', PTW: 'PTW',
  Contractors: 'Contractors', RiskAssessments: 'RiskAssessments',
  // ... 73 total
}
```

---

## 6. Authentication System

- **Provider**: Supabase Auth (email/password)
- **JWT Claims**: `app_metadata.tenant_id`
- **Storage**: `SaaSAuthStorage` (localStorage + sessionStorage)
- **Remember me**: localStorage persistence
- **MFA**: via `saas-mfa.js`
- **Session tracking**: multi-device via `platform_device_sessions`
- **Offline support**: Service Worker + background sync

---

## 7. Permissions System

### 7.1 Roles
Admin, User, Viewer, Approver (defined per tenant)

### 7.2 Module Permissions (`MODULE_DETAILED_PERMISSIONS` in app-utils.js)

**Examples:**

| Module | Permission Keys |
|--------|----------------|
| `employees` | `employees-list`, `external-workforce` |
| `incidents` | `registry`, `detailed-log`, `incidents-list`, `annual-log`, `analysis`, `approvals`, `safety-alerts` |
| `clinic` | `visits`, `medications`, `sickLeave`, `dispensed-medications`, `injuries`, `supply-request`, `approvals`, `data-analysis` |
| `training` | `training-list`, `training-matrix`, `annual-plan`, `analysis`, `contractor-training` |
| `fire-equipment` | `database`, `register`, `inspections`, `analytics`, `approval-requests` |
| `daily-observations` | `observations-registry`, `observations-view-department`, `data-analysis`, `observations-specialist-review`, `observations-manager-approve`, `observations-view-all` |

### 7.3 Approval Workflow
- `approval-circuits.js` — configurable approval chains per module
- `workflow.js` — workflow engine with states and transitions

---

## 8. Module List (42 total)

| # | File | Description |
|---|------|-------------|
| 1 | `users.js` | User management |
| 2 | `user-versions-admin.js` | User version admin |
| 3 | `incidents.js` | Incidents — registry, analysis, approvals |
| 4 | `nearmiss.js` | Near misses |
| 5 | `ptw.js` | Permits to Work |
| 6 | `reports.js` | Reporting |
| 7 | `settings.js` | System settings |
| 8 | `clinic.js` | Clinic — visits, medications, sick leave, injuries |
| 9 | `fireequipment.js` | Fire equipment inspection |
| 10 | `ppe.js` | PPE — receipts, stock control, analysis |
| 11 | `periodicinspections.js` | Periodic inspections |
| 12 | `contractors.clean.js` / `contractors.js` | Contractors management |
| 13 | `violations.js` | Violations |
| 14 | `employees.js` | Employee database |
| 15 | `behaviormonitoring.js` | Behavior monitoring |
| 16 | `chemicalsafety.js` | Chemical safety |
| 17 | `dailyobservations.js` | Daily observations |
| 18 | `iso.js` | ISO management |
| 19 | `emergency.js` | Emergency alerts |
| 20 | `safety-calendar-seeds.js` | Safety calendar seeds |
| 21 | `safety-calendar-feed.js` | Safety calendar feed |
| 22 | `safety-calendar.js` | Safety calendar |
| 23 | `safetybudget.js` | Safety budget |
| 24 | `actiontrackingregister.js` | Action tracking |
| 25 | `hse.js` | HSE monitoring |
| 26 | `safetyperformancekpis.js` | Safety KPIs |
| 27 | `sustainability.js` | Sustainability |
| 28 | `riskassessment.js` | Risk assessment |
| 29 | `riskmatrix.js` | Risk matrix |
| 30 | `legaldocuments.js` | Legal documents |
| 31 | `safetyhealthmanagement.js` | Safety health management |
| 32 | `usertasks.js` | User tasks |
| 33 | `sopjha.js` | SOP / JHA |
| 34 | `aiassistant.js` | AI assistant |
| 35 | `useraiassistant.js` | User AI assistant |
| 36 | `issuetracking.js` | Issue tracking |
| 37 | `changemanagement.js` | Change management |
| 38 | `apptester.js` | App tester |
| 39 | `help.js` | Help system |
| 40 | `issuingauthorities.js` | Issuing authorities |
| 41 | `training.js` | Training management |
| 42 | `user-versions-admin.js` | User versions admin |

---

## 9. Internationalization (i18n)

- **`i18n-core.js`** (~4491 lines) — contains all translation keys
- Each module has `_t(key, fallback)` for translation
- `AppI18n.t(key, fallback)` — global translation function
- `applyModuleI18n(el)` — apply translations to DOM subtree
- Bilingual: Arabic (primary) + English

---

## 10. Caching Strategy

| Cache | Location | TTL |
|-------|----------|-----|
| Bootstrap cache | `AppBootstrap._BOOTSTRAP_CACHE_TTL` | 5–15 min per data type |
| PPE items list | `PPE.state.ppeItemsListCache` | 2 min |
| PPE stock | `PPE.state.stockItemsCache` | 5 min |
| Smart cache | `services/smart-cache.js` | Configurable |
| Service Worker | `service-worker.js` | On version change |

---

## 11. Key Conventions

- **No JS frameworks** — vanilla JS with string templates (`innerHTML`)
- **Event delegation** — use `addEventListener('change', handler)` on container
- **Modal pattern** — create `div.modal-overlay` → set `innerHTML` → append to body
- **Form pattern** — `<form id="X-form">` with fields + submit handler
- **Table pattern** — `<table>` with `thead`/`tbody` + sort/filter/search
- **RTL** — all forms RTL-aware, margins use `ml-*` / `mr-*` correctly
- **Console suppression** — multi-layer suppression of extension errors in production

---

## 12. Build & Deploy

- **`npm run build:prod`** — runs `scripts/build-frontend-prod.mjs` (esbuild minification)
- **`npm run pre-commit-bump`** — auto-bumps version + service worker
- **Vercel** — SPA deployment with rewrites + CSP headers
- **CSP** — strict policy via `vercel.json` headers

---

## 13. Implementation Phases (for rebuild)

### Phase 1: Infrastructure
1. New Supabase project + run all 46 migrations in order
2. New Vercel project with `vercel.json`
3. `index.html` shell with script load order + login screen

### Phase 2: Core
4. `saas-config.js`, `saas-adapter.js`, `supabase-bootstrap.js`
5. `app-utils.js` (Utils, AppState, permissions)
6. `auth.js` + UI login flow
7. `app-ui.js` (navigation, sidebar, theme)

### Phase 3: Data layer
8. Data Manager + Backend Client + services
9. `i18n-core.js` translations

### Phase 4: Modules (priority order)
10. Dashboard, Users
11. Employees, Incidents, Near Miss (HSE core)
12. Clinic, PPE, Training (large modules)
13. All remaining 32 modules

### Phase 5: Polish
14. Approval circuits, Workflow, Audit log
15. Reports, PDF/Excel export
16. Service Worker, PWA

---

> **Important Note**: This is a large system. `index.html` ~13,700 lines, `app-utils.js` ~9,368 lines, `app-ui.js` ~11,184 lines, `ppe.js` ~6,404 lines. Full rebuild requires significant team effort. Practical alternative: clone the existing repository directly.
