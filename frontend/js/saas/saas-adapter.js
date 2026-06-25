/**
 * saas-adapter.js
 * Implements the legacy backend contract on top of Supabase:
 *
 *     sendRequest({ action, data }) -> Promise<{ success, data?, message? }>
 *
 * Strategy (Strangler-Fig): the 38 frontend modules talk only through this
 * contract. We translate each action to a Supabase RPC (RLS-enforced).
 *
 *  - Generic transport actions (readFromSheet/saveToSheet/appendToSheet/
 *    updateSingleRowInSheet/batchReadSheets/login) → direct RPC/auth.
 *  - Named CRUD actions (getAllX/addX/updateX/deleteX) → resolved to a sheet
 *    via ACTION_MAP, then the matching generic RPC.
 *  - Business-logic actions (server-side rules: medication deduction,
 *    per-user task progress, DSC sequence, PTW id, Stripe, …) are listed in
 *    BUSINESS_ACTIONS and (for now) return a clear "needs Edge Function"
 *    error so we port them deliberately in Phase 2b.
 *
 * window.SaaSAdapter.sendRequest(req) is the single entry point.
 */
(function (global) {
    const rpc = async (fn, args) => {
        await global.SaaS.ready;
        const client = global.SaaS.client();
        if (!client) return { success: false, message: 'Supabase client not ready' };
        const { data, error } = await client.rpc(fn, args);
        if (error) return { success: false, message: error.message || String(error) };
        return data; // RPCs already return {success,...} or arrays
    };

    // -------- named action → {op, sheet, ...} resolution --------
    // Sheet names match the registry in supabase/migrations/0003_seed.sql.
    const SHEET_BY_ENTITY = {
        Medications: 'Medications', ClinicVisits: 'ClinicVisits',
        ClinicContractorVisits: 'ClinicContractorVisits', SickLeave: 'SickLeave',
        Injuries: 'Injuries', UserTasks: 'UserTasks', Violations: 'Violations',
        Incidents: 'Incidents', NearMiss: 'NearMiss', Training: 'Training',
        PPE: 'PPE', Contractors: 'Contractors', Employees: 'Employees',
        DailyObservations: 'DailyObservations', PTW: 'PTW',
        ChemicalSafety: 'ChemicalSafety', SafetyBudgets: 'SafetyBudgets',
        PeriodicInspectionRecords: 'PeriodicInspectionRecords',
        DailySafetyCheckList: 'DailySafetyCheckList'
    };

    // Explicit map for the highest-frequency named actions.
    const ACTION_MAP = {
        // reads
        getAllMedications:    { op: 'read',   sheet: 'Medications' },
        getAllUserTasks:      { op: 'read',   sheet: 'UserTasks' },
        getAllSickLeaves:     { op: 'read',   sheet: 'SickLeave' },
        getAllInjuries:       { op: 'read',   sheet: 'Injuries' },
        getAllViolations:     { op: 'read',   sheet: 'Violations' },
        getAllIncidents:      { op: 'read',   sheet: 'Incidents' },
        // writes (UserTasks — already atomic via dedicated actions)
        addUserTask:          { op: 'upsert', sheet: 'UserTasks', idFrom: 'id' },
        updateUserTask:       { op: 'patch',  sheet: 'UserTasks', idFrom: 'taskId', patchFrom: 'updateData' },
        deleteUserTask:       { op: 'delete', sheet: 'UserTasks', idFrom: 'taskId' }
        // … extend incrementally. Unmapped CRUD falls through to convention.
    };

    // Business-logic actions — now handled by atomic Postgres RPCs (0007).
    function clinicSheetFor(data) {
        const pt = String((data && data.personType) || '').toLowerCase();
        return (pt === 'contractor' || pt === 'external') ? 'ClinicContractorVisits' : 'ClinicVisits';
    }
    async function handleBusiness(action, data) {
        switch (action) {
            case 'addClinicVisit': {
                const visit = { ...data }; const adj = data.medicationAdjustments || [];
                return await rpc('api_add_clinic_visit', { p_sheet: clinicSheetFor(data), p_visit: visit, p_adjustments: adj });
            }
            case 'updateClinicVisit': {
                const ud = data.updateData || data;
                const visit = { ...ud, id: data.visitId || ud.id };
                const adj = ud.medicationAdjustments || data.medicationAdjustments || [];
                return await rpc('api_add_clinic_visit', { p_sheet: clinicSheetFor(visit), p_visit: visit, p_adjustments: adj });
            }
            case 'getAllClinicVisits':
                return wrapArray(await rpc('api_get_all_clinic_visits', {}));
            case 'updateTaskCompletionRate':
                return await rpc('api_update_task_completion', {
                    p_task_id: data.taskId || data.task_id,
                    p_rate: Number(data.completionRate ?? data.completion_rate)
                });
            case 'getUserTasksByUserId':
                return wrapArray(await rpc('api_get_user_tasks', { p_user_id: data.userId || data.user_id }));
        }
        return null;
    }
    const BUSINESS_ACTIONS = new Set([
        'addClinicVisit', 'updateClinicVisit', 'updateTaskCompletionRate',
        'getUserTasksByUserId', 'getAllClinicVisits'
    ]);

    // convention fallback: getAllX / addX / updateX / deleteX
    function resolveByConvention(action) {
        let m;
        if ((m = action.match(/^getAll([A-Za-z]+)$/))) {
            const sheet = SHEET_BY_ENTITY[m[1]] || m[1];
            return { op: 'read', sheet };
        }
        return null;
    }

    // Write actions blocked when the tenant is read-only (frozen/past_due).
    // The DB enforces this too (records RLS, migration 0009); this is the
    // friendly UX layer so the user sees a clear message, not an RLS error.
    const WRITE_RE = /^(save|append|update|add|create|delete|remove|patch|set|upsert)/i;
    function isWriteAction(action) {
        if (action === 'login' || action === 'logout') return false;
        if (/^updateSingleRowInSheet$/.test(action)) return true;
        return WRITE_RE.test(action);
    }

    async function handle(action, data) {
        data = data || {};

        // read-only (frozen / past_due) tenants may not write
        if (isWriteAction(action) && global.SaaSGating &&
            typeof global.SaaSGating.isReadOnly === 'function' && global.SaaSGating.isReadOnly()) {
            return { success: false, message: 'الحساب في وضع القراءة فقط (الاشتراك متوقف أو الدفع متعذّر). يرجى تحديث الاشتراك.' };
        }

        // ---- generic transport ----
        switch (action) {
            case 'login': {
                const r = await global.SaaS.signIn(data.email, data.password);
                if (r.error) return { success: false, message: r.error.message };
                // Legacy auth.js reads loginResult.user (NOT .data.user). Role is
                // resolved SERVER-SIDE from tenant_users (api_me) — never assumed.
                const su = (r.data && r.data.user) || {};
                const role = (global.SaaSSession && global.SaaSSession.resolveRole)
                    ? await global.SaaSSession.resolveRole()
                    : 'user';
                const isAdmin = (role === 'admin');
                const user = {
                    id: su.id,
                    email: su.email,
                    name: (su.user_metadata && su.user_metadata.full_name) || su.email,
                    role: role,
                    department: '',
                    permissions: isAdmin ? { admin: true, 'manage-modules': true } : {},
                    active: true,
                    passwordChanged: true
                };
                return { success: true, user: user, data: { user: user } };
            }
            case 'readFromSheet':
                return wrapArray(await rpc('api_read_sheet', { p_sheet: data.sheetName }));
            case 'batchReadSheets':
                return wrapObj(await rpc('api_batch_read', { p_sheets: data.sheetNames || [] }));
            case 'saveToSheet':
                return await rpc('api_replace_sheet', { p_sheet: data.sheetName, p_rows: data.data || [] });
            case 'appendToSheet':
                return await rpc('api_upsert', { p_sheet: data.sheetName, p_id: (data.data && data.data.id) || cryptoId(), p_data: data.data || {} });
            case 'updateSingleRowInSheet':
                return await rpc('api_patch', { p_sheet: data.sheetName, p_id: data.recordId, p_patch: data.updateData || {} });
        }

        // ---- mapped / convention named actions ----
        const spec = ACTION_MAP[action] || resolveByConvention(action);
        if (spec) {
            if (spec.op === 'read')
                return wrapArray(await rpc('api_read_sheet', { p_sheet: spec.sheet }));
            if (spec.op === 'upsert')
                return await rpc('api_upsert', { p_sheet: spec.sheet, p_id: data[spec.idFrom] || (data.id || cryptoId()), p_data: data });
            if (spec.op === 'patch')
                return await rpc('api_patch', { p_sheet: spec.sheet, p_id: data[spec.idFrom], p_patch: data[spec.patchFrom] || data });
            if (spec.op === 'delete')
                return await rpc('api_delete', { p_sheet: spec.sheet, p_id: data[spec.idFrom] });
        }

        if (BUSINESS_ACTIONS.has(action)) {
            const br = await handleBusiness(action, data);
            if (br) return br;
        }

        if (action === 'getCompanySettings') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'CompanySettings' });
            if (rows && rows.success === false) return rows;
            const arr = Array.isArray(rows) ? rows : [];
            const row = arr.find(r => String(r.id) === 'default') || arr[0] || {};
            return { success: true, data: row };
        }
        if (action === 'saveCompanySettings') {
            const id = 'default';
            const payload = Object.assign({}, data || {}, { id });
            return await rpc('api_upsert', {
                p_sheet: 'CompanySettings',
                p_id: id,
                p_data: payload
            });
        }

        if (action === 'reportUserVersion') {
            return await rpc('api_report_user_version', { p_payload: data || {} });
        }
        if (action === 'getAllUserVersions') {
            const latest = (data && data.latestVersion) ? String(data.latestVersion) : '';
            const res = await rpc('api_list_user_versions', { p_latest_version: latest });
            if (res && res.success === false) return res;
            const rows = (res && Array.isArray(res.data)) ? res.data : [];
            return { success: true, data: rows };
        }
        if (action === 'getUserVersionStats') {
            const latest = (data && data.latestVersion) ? String(data.latestVersion) : '';
            const res = await rpc('api_user_version_stats', { p_latest_version: latest });
            if (res && res.success === false) return res;
            return Object.assign({ success: true }, res || {});
        }

        return { success: false, message: `action غير معروف في محوّل SaaS: '${action}'`, _unmapped: true };
    }

    function wrapArray(res) {
        if (res && res.success === false) return res;
        return { success: true, data: Array.isArray(res) ? res : [] };
    }
    function wrapObj(res) {
        if (res && res.success === false) return res;
        return { success: true, data: res || {} };
    }
    function cryptoId() {
        return 'REC-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }

    global.SaaSAdapter = {
        async sendRequest(req) {
            try {
                return await handle(req && req.action, req && req.data);
            } catch (e) {
                return { success: false, message: (e && e.message) || String(e) };
            }
        },
        // introspection helpers (for the test page / debugging)
        _ACTION_MAP: ACTION_MAP,
        _BUSINESS_ACTIONS: BUSINESS_ACTIONS
    };
})(window);
