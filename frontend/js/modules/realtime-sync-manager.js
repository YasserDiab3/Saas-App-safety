/**
 * Cross-tab sync (BroadcastChannel) — legacy Google Sheets polling removed in SaaS.
 */
const RealtimeSyncManager = {
    state: {
        broadcastChannel: null,
        currentSection: null,
        lastSyncTime: {}
    },

    config: {
        enableAutoSync: false,
        enableNotifications: false
    },

    async init() {
        this.setupBroadcastChannel();
        return true;
    },

    setupBroadcastChannel() {
        try {
            if (typeof BroadcastChannel === 'undefined') return;
            this.state.broadcastChannel = new BroadcastChannel('hse-data-sync');
            this.state.broadcastChannel.onmessage = (event) => {
                const { type, module, data } = event.data || {};
                if (type === 'user-permissions-updated' && typeof this.handleExternalUserPermissionsUpdate === 'function') {
                    this.handleExternalUserPermissionsUpdate(data, event.data?.timestamp);
                }
            };
        } catch (e) { /* ignore */ }
    },

    broadcast(type, module, data = null) {
        if (!this.state.broadcastChannel) return;
        try {
            this.state.broadcastChannel.postMessage({
                type,
                module,
                data,
                timestamp: Date.now(),
                user: AppState?.currentUser?.email || 'Unknown'
            });
        } catch (e) { /* ignore */ }
    },

    notifyChange(module, operation, recordId) {
        this.broadcast('data-updated', module, { operation, recordId, timestamp: Date.now() });
    },

    handleExternalUserPermissionsUpdate(data) {
        if (!data || typeof Permissions === 'undefined') return;
        try {
            if (typeof Permissions.applyExternalPermissionUpdate === 'function') {
                Permissions.applyExternalPermissionUpdate(data);
            }
        } catch (e) { /* ignore */ }
    },

    getModulesForSection(section) {
        const sectionModulesMap = {
            'users': ['users'],
            'clinic': ['medications', 'clinicVisits', 'clinicContractorVisits', 'sickLeave', 'injuries', 'clinicContractorInjuries', 'clinicInventory'],
            'incidents': ['incidents'],
            'near-miss': ['nearmiss'],
            'ptw': ['ptw'],
            'training': ['training'],
            'fire-equipment': ['fireEquipment'],
            'ppe': ['ppe', 'ppeStock'],
            'violations': ['violations'],
            'contractors': ['contractors', 'approvedContractors'],
            'employees': ['employees', 'externalWorkforceMonthly'],
            'behavior-monitoring': ['behaviorMonitoring', 'contractorBehaviorMonitoring'],
            'chemical-safety': ['chemicalSafety'],
            'daily-observations': ['dailyObservations'],
            'iso': ['isoDocuments'],
            'sustainability': ['sustainability'],
            'risk-assessment': ['riskAssessments'],
            'emergency': ['emergencyAlerts', 'emergencyPlans', 'emergencyPlansUpdates'],
            'safety-budget': ['safetyBudgets'],
            'action-tracking': ['actionTrackingRegister'],
            'hse': ['hseNonConformities'],
            'safety-performance-kpis': ['safetyPerformanceKPIs'],
            'kpi-annual-plan': ['kpiAnnualPlans'],
            'hse-monitoring-plan': ['hseMonitoringPlans'],
            'legal-documents': ['legalDocuments'],
            'safety-health-management': ['safetyTeamMembers'],
            'sop-jha': ['sopJHA'],
            'periodic-inspections': ['periodicInspectionCategories']
        };
        return sectionModulesMap[section] || [];
    },

    getModuleForSheetName(sheetName) {
        const normalized = String(sheetName || '').trim().toLowerCase();
        if (normalized === 'watermanagement_records' || normalized === 'electricitymanagement_records' || normalized === 'gasmanagement_records') {
            return 'sustainability';
        }
        const moduleToSheetMap = {
            users: 'Users',
            medications: 'Medications',
            clinicVisits: 'ClinicVisits',
            incidents: 'Incidents',
            nearmiss: 'NearMiss',
            ptw: 'PTW',
            training: 'Training',
            employees: 'Employees',
            violations: 'Violations',
            contractors: 'Contractors',
            approvedContractors: 'ApprovedContractors',
            dailyObservations: 'DailyObservations'
        };
        const entry = Object.entries(moduleToSheetMap).find(([, sheet]) => sheet.toLowerCase() === normalized);
        return entry ? entry[0] : null;
    },

    getModulesForSheets(sheetNames) {
        if (!Array.isArray(sheetNames)) return [];
        const modules = new Set();
        sheetNames.forEach((name) => {
            const mod = this.getModuleForSheetName(name);
            if (mod) modules.add(mod);
        });
        return Array.from(modules);
    },

    stopAutoSync() { /* no-op — polling removed */ },
    startAutoSync() { /* no-op */ },
    syncAll() { return Promise.resolve(false); },
    syncModule() { return Promise.resolve(false); },

    cleanup() {
        if (this.state.broadcastChannel) {
            this.state.broadcastChannel.close();
            this.state.broadcastChannel = null;
        }
    }
};

if (typeof window !== 'undefined') {
    window.RealtimeSyncManager = RealtimeSyncManager;
}
