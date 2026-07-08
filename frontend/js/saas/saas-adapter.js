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
        DailySafetyCheckList: 'DailySafetyCheckList',
        ApprovedContractors: 'ApprovedContractors',
        BehaviorMonitoring: 'BehaviorMonitoring',
        ContractorBehaviorMonitoring: 'ContractorBehaviorMonitoring',
        ContractorEvaluations: 'ContractorEvaluations',
        ContractorTrainings: 'ContractorTrainings',
        ContractorApprovalRequests: 'ContractorApprovalRequests',
        ContractorDeletionRequests: 'ContractorDeletionRequests',
        DocumentCodes: 'DocumentCodes', DocumentVersions: 'DocumentVersions',
        EmergencyAlerts: 'EmergencyAlerts', EmergencyPlans: 'EmergencyPlans',
        EmergencyPlansUpdates: 'EmergencyPlansUpdates',
        ExternalWorkforceMonthly: 'ExternalWorkforceMonthly',
        FireEquipment: 'FireEquipment', FireEquipmentAssets: 'FireEquipmentAssets',
        HSEMonitoringPlans: 'HSEMonitoringPlans', HSENonConformities: 'HSENonConformities',
        ISODocuments: 'ISODocuments',
        KPIAnnualPlans: 'KPIAnnualPlans', SafetyPerformanceKPIs: 'SafetyPerformanceKPIs',
        LegalDocuments: 'LegalDocuments',
        Notifications: 'Notifications', ModuleManagement: 'ModuleManagement',
        PPEStock: 'PPEStock', PPE_Transactions: 'PPE_Transactions',
        PeriodicInspectionCategories: 'PeriodicInspectionCategories',
        PeriodicInspectionSchedules: 'PeriodicInspectionSchedules',
        PTWIdMapping: 'PTWIdMapping', PTWRegistry: 'PTWRegistry',
        RiskAssessments: 'RiskAssessments', SOPJHA: 'SOPJHA',
        SafetyTeamAttendance: 'SafetyTeamAttendance',
        SafetyTeamMembers: 'SafetyTeamMembers',
        Sustainability: 'Sustainability',
        TrainingCertificates: 'TrainingCertificates',
        UserActivityLog: 'UserActivityLog',
        ActionTrackingRegister: 'ActionTrackingRegister',
        AnnualTrainingPlans: 'AnnualTrainingPlans',
        AppEmergencyNumbers: 'AppEmergencyNumbers'
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
        deleteUserTask:       { op: 'delete', sheet: 'UserTasks', idFrom: 'taskId' },
        addContractorApprovalRequest:       { op: 'upsert', sheet: 'ContractorApprovalRequests', idFrom: 'id' },
        updateContractorApprovalRequest:    { op: 'patch',  sheet: 'ContractorApprovalRequests', idFrom: 'requestId', patchFrom: 'updateData' },
        rejectContractorApprovalRequest:    { op: 'patch',  sheet: 'ContractorApprovalRequests', idFrom: 'requestId' }
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
            case 'approveContractorApprovalRequest': {
                const { requestId, userData } = data || {};
                if (!requestId) return { success: false, message: 'requestId مطلوب' };
                // 1) قراءة الطلب
                const all = await rpc('api_read_sheet', { p_sheet: 'ContractorApprovalRequests' });
                if (all && all.success === false) return all;
                const rows = Array.isArray(all) ? all : [];
                const req = rows.find(r => String(r.id) === String(requestId));
                if (!req) return { success: false, message: `طلب الاعتماد غير موجود في Backend (id=${requestId})` };
                // 2) تكوين approvedEntity
                const code = req.licenseNumber || req.code || `APR-${Date.now().toString(36).toUpperCase()}`;
                const approvedEntity = {
                    id: cryptoId(),
                    companyName: req.companyName || '',
                    serviceType: req.serviceType || '',
                    entityType: req.requestType === 'contractor' ? 'contractor' : 'supplier',
                    code,
                    isoCode: code,
                    contractorId: req.contractorId || req.id || '',
                    requestId: req.id,
                    status: 'active',
                    approvedAt: new Date().toISOString(),
                    approvedBy: (userData && userData.id) || '',
                    approvedByName: (userData && userData.name) || '',
                    createdAt: new Date().toISOString()
                };
                // 3) حفظ في ApprovedContractors
                const upserted = await rpc('api_upsert', { p_sheet: 'ApprovedContractors', p_id: approvedEntity.id, p_data: approvedEntity });
                if (upserted && upserted.success === false) return upserted;
                // 4) تحديث حالة الطلب
                const patch = await rpc('api_patch', {
                    p_sheet: 'ContractorApprovalRequests',
                    p_id: requestId,
                    p_patch: { status: 'approved', approvedAt: approvedEntity.approvedAt, approvedBy: approvedEntity.approvedBy, approvedByName: approvedEntity.approvedByName, updatedAt: approvedEntity.approvedAt }
                });
                if (patch && patch.success === false) return patch;
                // 5) البحث عن المقاول المرتبط
                let contractor = null;
                if (req.contractorId) {
                    const cAll = await rpc('api_read_sheet', { p_sheet: 'Contractors' });
                    if (cAll && cAll.success === false) return cAll;
                    const cRows = Array.isArray(cAll) ? cAll : [];
                    contractor = cRows.find(c => String(c.id) === String(req.contractorId)) || null;
                }
                return { success: true, approvedEntity, contractor, message: 'تم اعتماد الطلب بنجاح' };
            }
        }
        return null;
    }
    const BUSINESS_ACTIONS = new Set([
        'addClinicVisit', 'updateClinicVisit', 'updateTaskCompletionRate',
        'getUserTasksByUserId', 'getAllClinicVisits',
        'approveContractorApprovalRequest'
    ]);

    // convention fallback: getAllX / addX / updateX / deleteX
    function resolveSheet(entityKey) {
        return SHEET_BY_ENTITY[entityKey]
            || { ClinicVisit:'ClinicVisits', Incident:'Incidents', Injury:'Injuries',
                 Medication:'Medications', Violation:'Violations', NearMiss:'NearMiss',
                 Employee:'Employees', Contractor:'Contractors',
                 Observation:'DailyObservations', PeriodicInspection:'PeriodicInspectionRecords',
                 ActionTracking:'ActionTrackingRegister', ChangeRequest:'ActionTrackingRegister',
                 Behavior:'BehaviorMonitoring', ContractorBehavior:'ContractorBehaviorMonitoring',
                 FireEquipment:'FireEquipment', FireEquipmentAsset:'FireEquipmentAssets',
                 FireEquipmentInspection:'FireEquipmentAssets',
                 SafetyTeamMember:'SafetyTeamMembers', SafetyAlert:'EmergencyAlerts',
                 ApprovedContractor:'ApprovedContractors',
                 ContractorApprovalRequest:'ContractorApprovalRequests',
                 ContractorTraining:'ContractorTrainings',
                 ViolationApprovalRequest:'Violations',
                 MedicationDeletionRequest:'Medications',
                 ClinicVisitDeletionRequest:'ClinicVisits',
                 FireEquipmentApprovalRequest:'FireEquipmentAssets',
                 SupplyRequest:'Notifications', IncidentNotification:'Notifications',
                 CustomKPI:'SafetyPerformanceKPIs'
            }[entityKey] || entityKey;
    }
    function resolveByConvention(action) {
        let m;
        if ((m = action.match(/^(?:getAll|get)([A-Za-z]+)$/))) {
            return { op: 'read', sheet: resolveSheet(m[1]) };
        }
        if ((m = action.match(/^add([A-Za-z]+)$/))) {
            return { op: 'upsert', sheet: resolveSheet(m[1]), idFrom: 'id' };
        }
        if ((m = action.match(/^update([A-Za-z]+)$/))) {
            return { op: 'patch', sheet: resolveSheet(m[1]), idFrom: m[1] + 'Id', patchFrom: 'updateData' };
        }
        if ((m = action.match(/^delete([A-Za-z]+)$/))) {
            return { op: 'delete', sheet: resolveSheet(m[1]), idFrom: m[1] + 'Id' };
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

    async function tryExplicitHandler(action, data) {
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
            return await rpc('api_upsert', { p_sheet: 'CompanySettings', p_id: id, p_data: payload });
        }
        if (action === 'getFormSettings') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'FormSettings' });
            if (rows && rows.success === false) return rows;
            const arr = Array.isArray(rows) ? rows : [];
            const row = arr.find(r => String(r.id) === 'FORM-SETTINGS-1')
                || arr.find(r => String(r.id) === 'default')
                || arr[0] || {};
            const parseField = (val, fallback) => {
                if (Array.isArray(val)) return val;
                if (typeof val === 'string' && val.trim()) { try { return JSON.parse(val); } catch (_e) { return fallback; } }
                return fallback;
            };
            return { success: true, data: { sites: parseField(row.sites, []), departments: parseField(row.departments, []), safetyTeam: parseField(row.safetyTeam, []) } };
        }
        if (action === 'saveFormSettings') {
            return await rpc('api_upsert', { p_sheet: 'FormSettings', p_id: String((data && data.id) || 'FORM-SETTINGS-1'), p_data: { id: String((data && data.id) || 'FORM-SETTINGS-1'), sites: Array.isArray(data && data.sites) ? data.sites : [], departments: Array.isArray(data && data.departments) ? data.departments : [], safetyTeam: Array.isArray(data && data.safetyTeam) ? data.safetyTeam : [], updatedAt: new Date().toISOString() } });
        }
        if (action === 'reportUserVersion') {
            return await rpc('api_report_user_version', { p_payload: data || {} });
        }
        if (action === 'getHelpCenter') {
            const res = await rpc('api_get_help_center', {});
            if (res && res.success === false) return res;
            return { success: true, data: (res && res.data) || res || {} };
        }
        if (action === 'saveHelpCenter') {
            return await rpc('api_save_help_center', { p_data: data || {} });
        }
        if (action === 'updateMyProfile') {
            return await rpc('api_update_my_profile', { p_patch: data.patch || data.updateData || data || {} });
        }
        if (action === 'updateUser') {
            return await rpc('api_patch', { p_sheet: 'Users', p_id: data.userId || data.id, p_patch: data.updateData || data.patch || {} });
        }
        if (action === 'addUser') {
            const payload = data || {}; const id = payload.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'Users', p_id: id, p_data: Object.assign({}, payload, { id }) });
        }
        if (action === 'getAllUserVersions') {
            const latest = (data && data.latestVersion) ? String(data.latestVersion) : '';
            const res = await rpc('api_list_user_versions', { p_latest_version: latest });
            if (res && res.success === false) return res;
            return { success: true, data: (res && Array.isArray(res.data)) ? res.data : [] };
        }
        if (action === 'getUserVersionStats') {
            const latest = (data && data.latestVersion) ? String(data.latestVersion) : '';
            const res = await rpc('api_user_version_stats', { p_latest_version: latest });
            if (res && res.success === false) return res;
            return Object.assign({ success: true }, res || {});
        }
        // ---- PPE actions ----
        if (action === 'addOrUpdatePPEStockItem') {
            const itemId = data.itemId || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'PPEStock', p_id: itemId, p_data: Object.assign({}, data, { itemId }) });
        }
        if (action === 'getAllPPEStockItems') {
            return wrapArray(await rpc('api_read_sheet', { p_sheet: 'PPEStock' }));
        }
        if (action === 'getAllPPETransactions') {
            return wrapArray(await rpc('api_read_sheet', { p_sheet: 'PPE_Transactions' }));
        }
        if (action === 'addPPE') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'PPE', p_id: id, p_data: Object.assign({}, data, { id }) });
        }
        if (action === 'updatePPE') {
            return await rpc('api_patch', { p_sheet: 'PPE', p_id: data.ppeId || data.id, p_patch: data.updateData || data });
        }
        if (action === 'deletePPE') {
            return await rpc('api_delete', { p_sheet: 'PPE', p_id: data.ppeId || data.id });
        }
        if (action === 'getPPEItemsList') {
            return wrapArray(await rpc('api_read_sheet', { p_sheet: 'PPEStock' }));
        }
        if (action === 'addPPETransaction') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'PPE_Transactions', p_id: id, p_data: Object.assign({}, data, { id }) });
        }
        if (action === 'deletePPEStockItem') {
            return await rpc('api_delete', { p_sheet: 'PPEStock', p_id: data.itemId || data.id });
        }
        // ---- Training / Employees / Contractors ----
        if (action === 'deleteTraining') {
            return await rpc('api_delete', { p_sheet: 'Training', p_id: data.trainingId || data.id });
        }
        if (action === 'deleteUser') {
            return await rpc('api_delete', { p_sheet: 'Users', p_id: data.userId || data.id });
        }
        if (action === 'deactivateEmployee') {
            return await rpc('api_patch', { p_sheet: 'Employees', p_id: data.employeeId || data.id, p_patch: { active: false, updatedAt: new Date().toISOString() } });
        }
        if (action === 'deleteEmployee') {
            return await rpc('api_delete', { p_sheet: 'Employees', p_id: data.employeeId || data.id });
        }
        if (action === 'deleteApprovedContractor') {
            return await rpc('api_delete', { p_sheet: 'ApprovedContractors', p_id: data.approvedContractorId || data.id });
        }
        if (action === 'updateApprovedContractor') {
            return await rpc('api_patch', { p_sheet: 'ApprovedContractors', p_id: data.approvedContractorId || data.id, p_patch: data.updateData || data });
        }
        if (action === 'deleteContractor') {
            return await rpc('api_delete', { p_sheet: 'Contractors', p_id: data.contractorId || data.id });
        }
        // ---- ISO / HSE ----
        if (action === 'addHSEObjective') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'HSEMonitoringPlans', p_id: id, p_data: Object.assign({}, data, { id, type: 'objective' }) });
        }
        if (action === 'addEnvironmentalAspect') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'HSEMonitoringPlans', p_id: id, p_data: Object.assign({}, data, { id, type: 'environmental_aspect' }) });
        }
        if (action === 'addHSEAudit') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'HSEMonitoringPlans', p_id: id, p_data: Object.assign({}, data, { id, type: 'audit' }) });
        }
        if (action === 'addHSENonConformity') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'HSENonConformities', p_id: id, p_data: Object.assign({}, data, { id }) });
        }
        if (action === 'addHSECorrectiveAction') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'HSENonConformities', p_id: id, p_data: Object.assign({}, data, { id, type: 'corrective_action' }) });
        }
        // ---- Incidents cleanup ----
        if (action === 'cleanupIncidentsRegistry') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'Incidents' });
            if (rows && rows.success === false) return rows;
            return { success: true, removed: 0, kept: Array.isArray(rows) ? rows.length : 0 };
        }
        // ---- User Activity Log ----
        if (action === 'getPublicIP') {
            try { const resp = await fetch('https://api.ipify.org?format=json'); const json = await resp.json(); return { success: true, ip: json.ip, data: { ip: json.ip } }; }
            catch (_e) { return { success: true, ip: '0.0.0.0', data: { ip: '0.0.0.0' } }; }
        }
        if (action === 'addUserActivityLog') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'UserActivityLog', p_id: id, p_data: Object.assign({}, data, { id }) });
        }
        if (action === 'getAllUserActivityLogs') {
            return wrapArray(await rpc('api_read_sheet', { p_sheet: 'UserActivityLog' }));
        }
        if (action === 'getDailyUserSessionActivityReport') {
            const all = await rpc('api_read_sheet', { p_sheet: 'UserActivityLog' });
            if (all && all.success === false) return all;
            const arr = Array.isArray(all) ? all : [];
            const dateStr = (data && data.date) || new Date().toISOString().slice(0, 10);
            return { success: true, data: arr.filter(r => r && String(r.timestamp || r.createdAt || '').startsWith(dateStr)) };
        }
        // ---- Daily Observations PPT ----
        if (action === 'getDailyObservationsPptTemplateId') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'CompanySettings' });
            if (rows && rows.success === false) return rows;
            const row = (Array.isArray(rows) ? rows : []).find(r => String(r.id) === 'default') || (Array.isArray(rows) ? rows[0] : {}) || {};
            return { success: true, templateId: row.dailyObservationsPptTemplateId || null };
        }
        if (action === 'setDailyObservationsPptTemplateId') {
            return await rpc('api_patch', { p_sheet: 'CompanySettings', p_id: 'default', p_patch: { dailyObservationsPptTemplateId: data.templateId || null, updatedAt: new Date().toISOString() } });
        }
        if (action === 'exportDailyObservationsPptReport') {
            return { success: false, message: 'تصدير PPT يتطلب Edge Function — غير مفعّل حالياً' };
        }
        // ---- Password reset ----
        if (action === 'resetUserPassword') {
            return { success: false, message: 'إعادة تعيين كلمة المرور تتطلب Edge Function — يرجى استخدام لوحة التحكم في Supabase' };
        }
        // ---- AI features ----
        if (action === 'processAIQuestion') {
            return { success: false, message: 'المساعد الذكي يتطلب Edge Function — غير مفعّل حالياً' };
        }
        if (action === 'logAIQuestion') { return { success: true }; }
        if (action === 'getSmartRecommendations') { return { success: true, recommendations: [] }; }
        if (action === 'getEmployeeTrainingMatrix') {
            return wrapArray(await rpc('api_read_sheet', { p_sheet: 'Training' }));
        }
        if (action === 'getPPEMatrix') {
            return wrapArray(await rpc('api_read_sheet', { p_sheet: 'PPE' }));
        }
        // ---- File upload ----
        if (action === 'uploadFileToDrive') {
            return { success: false, message: 'رفع الملفات يتطلب Supabase Storage — غير مفعّل حالياً' };
        }
        // ---- Generic sheet operations ----
        if (action === 'deleteFromSheet') {
            return await rpc('api_delete', { p_sheet: data.sheetName, p_id: data.id || data.recordId });
        }
        if (action === 'testConnection') {
            return { success: true, message: 'Supabase connected' };
        }
        // ---- Single-item reads ----
        if (action === 'getTraining') {
            return wrapObj(await rpc('api_read_sheet', { p_sheet: 'Training' }));
        }
        if (action === 'getSafetyTeamMember') {
            return wrapObj(await rpc('api_read_sheet', { p_sheet: 'SafetyTeamMembers' }));
        }
        if (action === 'getEmployeeByCode') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'Employees' });
            if (rows && rows.success === false) return rows;
            const code = (data.code || data.employeeCode || '').toString().trim().toLowerCase();
            const match = (Array.isArray(rows) ? rows : []).find(r => String(r.employeeCode || r.code || '').trim().toLowerCase() === code);
            return { success: true, data: match || null };
        }
        if (action === 'getIssue') { return wrapObj(await rpc('api_read_sheet', { p_sheet: 'Incidents' })); }
        if (action === 'getChangeRequest') { return wrapObj(await rpc('api_read_sheet', { p_sheet: 'ActionTrackingRegister' })); }
        if (action === 'getObservation') { return wrapObj(await rpc('api_read_sheet', { p_sheet: 'DailyObservations' })); }
        // ---- Approval / rejection ----
        if (action === 'approveClinicVisitDeletion') {
            return await rpc('api_patch', { p_sheet: 'ClinicVisits', p_id: data.visitId || data.id, p_patch: { status: 'approved', updatedAt: new Date().toISOString() } });
        }
        if (action === 'rejectClinicVisitDeletion') {
            return await rpc('api_patch', { p_sheet: 'ClinicVisits', p_id: data.visitId || data.id, p_patch: { status: 'rejected', updatedAt: new Date().toISOString() } });
        }
        if (action === 'approveMedicationDeletion') {
            return await rpc('api_patch', { p_sheet: 'Medications', p_id: data.medicationId || data.id, p_patch: { status: 'approved', updatedAt: new Date().toISOString() } });
        }
        if (action === 'rejectMedicationDeletion') {
            return await rpc('api_patch', { p_sheet: 'Medications', p_id: data.medicationId || data.id, p_patch: { status: 'rejected', updatedAt: new Date().toISOString() } });
        }
        if (action === 'approveSupplyRequest') {
            return await rpc('api_patch', { p_sheet: 'Notifications', p_id: data.requestId || data.id, p_patch: { status: 'approved', updatedAt: new Date().toISOString() } });
        }
        if (action === 'rejectSupplyRequest') {
            return await rpc('api_patch', { p_sheet: 'Notifications', p_id: data.requestId || data.id, p_patch: { status: 'rejected', updatedAt: new Date().toISOString() } });
        }
        if (action === 'approveViolationApprovalRequest') {
            return await rpc('api_patch', { p_sheet: 'Violations', p_id: data.violationId || data.id, p_patch: { status: 'approved', updatedAt: new Date().toISOString() } });
        }
        if (action === 'rejectViolationApprovalRequest') {
            return await rpc('api_patch', { p_sheet: 'Violations', p_id: data.violationId || data.id, p_patch: { status: 'rejected', updatedAt: new Date().toISOString() } });
        }
        // ---- Settings / config ----
        if (action === 'getActionTrackingSettings' || action === 'getSafetyHealthManagementSettings' || action === 'getViolationApprovalSettings') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'CompanySettings' });
            if (rows && rows.success === false) return rows;
            return { success: true, data: ((Array.isArray(rows) ? rows : []).find(r => String(r.id) === 'default') || (Array.isArray(rows) ? rows[0] : {}) || {}) };
        }
        if (action === 'saveViolationTypes' || action === 'updateViolationApprovalSettings' || action === 'updateLeaveTypes' || action === 'updateKPITargets') {
            return await rpc('api_patch', { p_sheet: 'CompanySettings', p_id: 'default', p_patch: data });
        }
        if (action === 'getOrganizationalStructure') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'SafetyTeamMembers' });
            if (rows && rows.success === false) return rows;
            return { success: true, data: Array.isArray(rows) ? rows : [] };
        }
        if (action === 'saveOrganizationalStructure') {
            return await rpc('api_replace_sheet', { p_sheet: 'SafetyTeamMembers', p_rows: data.members || data.data || [] });
        }
        // ---- Report / KPI ----
        if (action === 'generateAttendanceReport' || action === 'generateSafetyTeamPerformanceReport' ||
            action === 'calculateSafetyTeamKPIs' || action === 'getSafetyTeamKPIs' ||
            action === 'getActionTrackingKPIs' || action === 'getChangeRequestStatistics' ||
            action === 'getIssueStatistics' || action === 'getContractorDetailedAnalytics') {
            return { success: true, data: {}, message: 'التقرير يتطلب Edge Function' };
        }
        // ---- Batch / complex ----
        if (action === 'updateAttendanceStatuses') { return { success: true }; }
        if (action === 'getJobDescription') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'SafetyTeamMembers' });
            if (rows && rows.success === false) return rows;
            const member = (Array.isArray(rows) ? rows : []).find(r => String(r.id) === String(data.memberId));
            return { success: true, data: member || null };
        }
        if (action === 'getTrainingModuleBundle') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'Training' });
            if (rows && rows.success === false) return rows;
            const training = (Array.isArray(rows) ? rows : []).find(r => String(r.id) === String(data.trainingId || data.id));
            return { success: true, data: training || null };
        }
        if (action === 'saveOrUpdateFireEquipmentAsset') {
            const id = data.assetId || data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'FireEquipmentAssets', p_id: id, p_data: Object.assign({}, data, { id }) });
        }
        if (action === 'saveTestReport') {
            const id = data.id || cryptoId();
            return await rpc('api_upsert', { p_sheet: 'SafetyPerformanceKPIs', p_id: id, p_data: Object.assign({}, data, { id }) });
        }
        if (action === 'migrateContractorVisits') {
            return { success: true, message: 'الترحيل يتطلب Edge Function' };
        }
        if (action === 'getNextChangeRequestNumber') {
            const rows = await rpc('api_read_sheet', { p_sheet: 'ActionTrackingRegister' });
            const arr = Array.isArray(rows) ? rows : [];
            const maxNum = arr.reduce((max, r) => {
                const n = parseInt(String(r.requestNumber || r.number || '0').replace(/\D/g, ''), 10);
                return isNaN(n) ? max : Math.max(max, n);
            }, 0);
            return { success: true, number: 'CR-' + String(maxNum + 1).padStart(4, '0') };
        }

        return undefined; // not handled here → let convention try
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

        // ---- explicit handlers (must run before convention to avoid intercept) ----
        const explicitResult = await tryExplicitHandler(action, data);
        if (explicitResult !== undefined) return explicitResult;

        // ---- mapped / convention named actions ----
        if (!BUSINESS_ACTIONS.has(action)) {
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
        }

        if (BUSINESS_ACTIONS.has(action)) {
            const br = await handleBusiness(action, data);
            if (br) return br;
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
