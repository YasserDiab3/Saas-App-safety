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

    // Actions that REQUIRE server-side business logic (ported via Edge Function
    // in Phase 2b). Listed so the app fails loudly & traceably, not silently.
    const BUSINESS_ACTIONS = new Set([
        'addClinicVisit', 'updateClinicVisit',        // medication deduction (atomic + LockService)
        'updateTaskCompletionRate',                   // per-user progress merge
        'getUserTasksByUserId',                       // access-filtered read
        'getAllClinicVisits'                          // merges employee+contractor sheets
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

    async function handle(action, data) {
        data = data || {};

        // ---- generic transport ----
        switch (action) {
            case 'login': {
                const r = await global.SaaS.signIn(data.email, data.password);
                if (r.error) return { success: false, message: r.error.message };
                return { success: true, data: { user: r.data?.user || null } };
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
            return { success: false, message: `action '${action}' يتطلب منطق الخادم (Edge Function) — لم يُنقل بعد (Phase 2b)`, _needsEdgeFunction: true };
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
