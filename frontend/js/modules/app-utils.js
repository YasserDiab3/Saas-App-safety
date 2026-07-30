/* ========================================
   HSEHub 360 — Safety • Health • Environment
   app-utils.js - ?????? ???????? ????????
   ======================================== */

// ?????? ????? Chrome Extensions
(function () {
    'use strict';

    /**
     * ????? ?? ?????? ??????? (Chrome/Edge) — ???? ?? ???????.
     * ??????? ????? ????? ?????? ???????? sendMessage ??? ?????? ?? runtime.lastError?
     * ?? ??? ????? ???? ??????? ??? ????.
     * ??? ????? ??????: ??? ??????? ??????? ?????? ?? ???? chrome.runtime ??? ??? ?????
     * ?????? ???? if (chrome.runtime) ?? ???? ?????.
     */
    const extNoise = (s) => {
        const t = String(s || '').toLowerCase();
        return t.includes('runtime.lasterror') ||
            t.includes('unchecked runtime.lasterror') ||
            t.includes('message port closed') ||
            t.includes('port closed before a response') ||
            t.includes('before a response was received') ||
            t.includes('message channel closed') ||
            t.includes('asynchronous response') ||
            t.includes('receiving end does not exist') ||
            t.includes('could not establish connection') ||
            t.includes('extension context invalidated') ||
            t.includes('the message port closed');
    };

    const stringifyArg = (arg) => {
        if (arg === null || arg === undefined) return '';
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') {
            try {
                if (arg && arg.message) return String(arg.message) + (arg.stack ? ' ' + arg.stack : '');
                return JSON.stringify(arg);
            } catch (e) {
                return String(arg);
            }
        }
        return String(arg);
    };

    const shouldSuppressConsoleArgs = (args) => {
        if (!args || args.length === 0) return false;
        const joined = args.map(stringifyArg).join(' ');
        return args.some((a) => extNoise(stringifyArg(a))) || extNoise(joined);
    };

    const wrapConsole = (methodName) => {
        const original = console[methodName];
        if (typeof original !== 'function') return;
        console[methodName] = function (...args) {
            if (shouldSuppressConsoleArgs(args)) return;
            return original.apply(console, args);
        };
    };

    wrapConsole('error');
    wrapConsole('warn');
    wrapConsole('log');
    wrapConsole('info');
    wrapConsole('debug');

    // ?? ???? ????? chrome.runtime.lastError ???: ??????? ???? ??? getter ???? ?????? ????? (????? ?? ????? ?????).
    // ???????? ???? ????? ?? lastError ????? ?????? ??????? ??? ?????.

    // ??? ????? CSP ???????? ?? source maps ? frame-ancestors
    const originalError = window.onerror;
    window.onerror = function (msg, url, line, col, error) {
        if (msg && (
            typeof msg === 'string' && (
                msg.includes('.map') ||
                msg.includes('sourcemap') ||
                msg.includes('Content Security Policy') ||
                msg.includes('frame-ancestors') ||
                msg.includes('runtime.lastError') ||
                msg.includes('Unchecked runtime.lastError') ||
                msg.includes('message port closed') ||
                msg.includes('before a response was received') ||
                msg.includes('message channel closed') ||
                msg.includes('asynchronous response') ||
                msg.includes('Receiving end does not exist') ||
                msg.includes('Could not establish connection') ||
                msg.includes('Extension context invalidated')
            )
        )) {
            return true; // ??? ??? ?????
        }
        if (originalError) {
            return originalError.apply(this, arguments);
        }
        return false;
    };

    // ??? ????? unhandled promise rejections ???????? ?? Chrome Extensions
    window.addEventListener('unhandledrejection', function (event) {
        const reason = event.reason;
        if (reason && (
            (typeof reason === 'string' && (
                reason.includes('runtime.lastError') ||
                reason.includes('message port closed') ||
                reason.includes('before a response was received') ||
                reason.includes('message channel closed') ||
                reason.includes('asynchronous response') ||
                reason.includes('Receiving end does not exist') ||
                reason.includes('Could not establish connection') ||
                reason.includes('Extension context invalidated')
            )) ||
            (reason && reason.message && (
                reason.message.includes('runtime.lastError') ||
                reason.message.includes('message port closed') ||
                reason.message.includes('before a response was received') ||
                reason.message.includes('message channel closed') ||
                reason.message.includes('asynchronous response') ||
                reason.message.includes('Receiving end does not exist') ||
                reason.message.includes('Could not establish connection') ||
                reason.message.includes('Extension context invalidated')
            ))
        )) {
            event.preventDefault();
            return false;
        }
    });
})();


// ===== Permissions System =====

// ????? ????????? ????????? ??? ?????
const MODULE_DETAILED_PERMISSIONS = {
    'employees': {
        label: '??????? ????? ????? ?????? ????????',
        permissions: [
            { key: 'employees-list', label: '????? ????????', icon: 'fa-id-badge' },
            { key: 'external-workforce', label: '????? ??????? ???????? ??????????', icon: 'fa-helmet-safety' }
        ]
    },
    'incidents': {
        label: '??????? ????? ???????',
        permissions: [
            { key: 'registry', label: '??? ???????', icon: 'fa-book' },
            { key: 'detailed-log', label: '????? ????????', icon: 'fa-list-alt' },
            { key: 'incidents-list', label: '????? ???????', icon: 'fa-list' },
            { key: 'annual-log', label: '????? ??????', icon: 'fa-calendar-alt' },
            { key: 'analysis', label: '???????', icon: 'fa-chart-line' },
            { key: 'approvals', label: '?????????', icon: 'fa-check-circle' },
            { key: 'safety-alerts', label: '??????? ???????', icon: 'fa-bell' }
        ]
    },
    'clinic': {
        label: '??????? ????? ???????',
        permissions: [
            { key: 'visits', label: '????????', icon: 'fa-user-md' },
            { key: 'medications', label: '???????', icon: 'fa-pills' },
            { key: 'sickLeave', label: '???????? ???????', icon: 'fa-calendar-times' },
            { key: 'dispensed-medications', label: '??? ??????? ????????', icon: 'fa-prescription-bottle-alt' },
            { key: 'injuries', label: '????????', icon: 'fa-user-injured' },
            { key: 'supply-request', label: '??? ????????', icon: 'fa-shopping-cart' },
            { key: 'approvals', label: '????? ????????', icon: 'fa-check-circle' },
            { key: 'data-analysis', label: '????? ????????', icon: 'fa-chart-bar' }
        ]
    },
    'training': {
        label: '??????? ????? ???????',
        permissions: [
            { key: 'training-list', label: '????? ?????????', icon: 'fa-list' },
            { key: 'training-matrix', label: '?????? ???????', icon: 'fa-table' },
            { key: 'annual-plan', label: '????? ???????', icon: 'fa-calendar-check' },
            { key: 'analysis', label: '???????', icon: 'fa-chart-line' },
            { key: 'contractor-training', label: '????? ?????????', icon: 'fa-users' }
        ]
    },
    'fire-equipment': {
        label: '??????? ????? ????? ???????',
        permissions: [
            { key: 'database', label: '????? ????????', icon: 'fa-database' },
            { key: 'register', label: '?????', icon: 'fa-clipboard-list' },
            { key: 'inspections', label: '????????', icon: 'fa-clipboard-check' },
            { key: 'analytics', label: '???????', icon: 'fa-chart-line' },
            { key: 'approval-requests', label: '????? ????????', icon: 'fa-check-circle' }
        ]
    },
    'daily-observations': {
        label: '??????? ????? ????????? ???????',
        permissions: [
            { key: 'observations-registry', label: '??? ?????????', icon: 'fa-book' },
            {
                key: 'observations-view-department',
                label: '??? ??????? ??????? ??????? (????? ??? ????? ???????? ?? «??????? ?? ???????»)',
                icon: 'fa-building'
            },
            { key: 'data-analysis', label: '????? ????????', icon: 'fa-chart-bar' },
            { key: 'observations-specialist-review', label: '?????? ?????? ??????? (??? ????????)', icon: 'fa-user-check' },
            { key: 'observations-manager-approve', label: '?????? ???? ???????', icon: 'fa-stamp' },
            { key: 'observations-view-all', label: '??? ???? ????????? (?????? ?????)', icon: 'fa-globe' }
        ]
    },
    'ptw': {
        label: '??????? ????? ?????? ?????',
        permissions: [
            { key: 'ptw-list', label: '????? ????????', icon: 'fa-list' },
            { key: 'analytics', label: '???????', icon: 'fa-chart-line' },
            { key: 'approvals', label: '?????????', icon: 'fa-check-circle' }
        ]
    },
    'contractors': {
        label: '??????? ????? ?????????',
        permissions: [
            { key: 'contractors-list', label: '????? ?????????', icon: 'fa-list' },
            { key: 'evaluations', label: '?????????', icon: 'fa-star' },
            { key: 'analytics', label: '???????', icon: 'fa-chart-line' },
            { key: 'approval-requests', label: '????? ????????', icon: 'fa-check-circle' }
        ]
    },
    'sustainability': {
        label: '??????? ????? ????????? ???????',
        permissions: [
            {
                key: 'consumption-register',
                label: '????? ??????? ?????? ????????? ?????? (????? ???)',
                icon: 'fa-tint'
            },
            {
                key: 'full-manage',
                label: '????? ????? ????????? (????????? ?????????? ?????/??? ???????)',
                icon: 'fa-leaf'
            }
        ]
    }
};

const MODULE_PERMISSIONS_CONFIG = [
    { key: 'dashboard', label: '???? ??????', icon: 'fa-dashboard' },
    { key: 'users', label: '????? ??????????', icon: 'fa-users-cog', adminOnly: true },
    { key: 'user-tasks', label: '???? ??????????', icon: 'fa-tasks' },
    { key: 'employees', label: '????? ?????? ????????', icon: 'fa-database', hasDetailedPermissions: true },
    { key: 'incidents', label: '???????', icon: 'fa-exclamation-triangle', hasDetailedPermissions: true },
    { key: 'nearmiss', label: '??????? ???????', icon: 'fa-exclamation-circle' },
    { key: 'ptw', label: '?????? ?????', icon: 'fa-id-card', hasDetailedPermissions: true },
    { key: 'training', label: '???????', icon: 'fa-graduation-cap', hasDetailedPermissions: true },
    { key: 'clinic', label: '??????? ??????', icon: 'fa-hospital', hasDetailedPermissions: true },
    { key: 'fire-equipment', label: '????? ???????', icon: 'fa-fire-extinguisher', hasDetailedPermissions: true },
    { key: 'periodic-inspections', label: '???????? ???????', icon: 'fa-clipboard-check' },
    { key: 'ppe', label: '????? ???????', icon: 'fa-hard-hat' },
    { key: 'violations', label: '?????????', icon: 'fa-ban' },
    { key: 'contractors', label: '?????????', icon: 'fa-users', hasDetailedPermissions: true },
    { key: 'behavior-monitoring', label: '?????? ?????????', icon: 'fa-user-check' },
    { key: 'chemical-safety', label: '??????? ??????????', icon: 'fa-flask' },
    { key: 'daily-observations', label: '????????? ???????', icon: 'fa-eye', hasDetailedPermissions: true },
    { key: 'iso', label: '???? ISO', icon: 'fa-certificate' },
    { key: 'compliance-reports', label: '?????? ????????', icon: 'fa-file-shield', parentModule: 'iso' },
    { key: 'emergency', label: '??????? ???????', icon: 'fa-bell' },
    { key: 'safety-calendar', label: '????? ???????', icon: 'fa-calendar-days' },
    { key: 'risk-assessment', label: '????? ???????', icon: 'fa-balance-scale' },
    { key: 'sop-jha', label: '??????? ????? ??????????', icon: 'fa-tasks' },
    { key: 'legal-documents', label: '??????? ?????????', icon: 'fa-file-contract' },
    { key: 'sustainability', label: '?????????', icon: 'fa-leaf', hasDetailedPermissions: true },
    { key: 'safety-budget', label: '??????? ??????? ????? ???????', icon: 'fa-wallet' },
    { key: 'ai-assistant', label: '??????? ?????', icon: 'fa-robot' },
    { key: 'safety-performance-kpis', label: '?????? ?????? ?????? ???????', icon: 'fa-gauge-high', hasDetailedPermissions: true },
    { key: 'kpi-annual-plan', label: '????? ??????? ??????? ?????? (KPIs)', icon: 'fa-calendar-alt', parentModule: 'safety-performance-kpis' },
    { key: 'hse-monitoring-plan', label: '??? ?????? HSE', icon: 'fa-clipboard-check', parentModule: 'safety-performance-kpis' },
    { key: 'safety-health-management', label: '????? ??????? ??????', icon: 'fa-user-shield' },
    { key: 'help', label: '????????', icon: 'fa-circle-question' },
    { key: 'settings', label: '?????????', icon: 'fa-cog', adminOnly: true },
    { key: 'action-tracking', label: '??? ?????? ?????????', icon: 'fa-clipboard-list' },
    { key: 'issue-tracking', label: '???? ???????', icon: 'fa-bug', hasDetailedPermissions: true },
    { key: 'change-management', label: '????? ????????', icon: 'fa-exchange-alt', hasDetailedPermissions: true },
    // adminOnly + ??? ???? ?? JSON: ???? ?? ??????? ??? ??? ?????? ??? ??? ?????? issuing-authorities (???? hasAccess)
    { key: 'issuing-authorities', label: '?????? ??? ???????? ??? ?????? ?????', icon: 'fa-user-check', parentModule: 'ptw', adminOnly: true }
];

const buildRoleDefaults = (enabledKeys = []) => {
    const permissions = {};
    MODULE_PERMISSIONS_CONFIG.forEach(({ key }) => {
        permissions[key] = enabledKeys.includes(key);
    });
    return permissions;
};

// ?? ?????? ????? ????: ?? ??? ????? ?? ??????? ???????? ????????
// ????????? ????? ??? ?? ??? ???? ?????? ?? ???? ????? ??????????
// ??? ???? ??????? ??????? ??? ????????? ?? ??? ??????
//
// ?? ?????: DEFAULT_ROLE_PERMISSIONS ?? ??? ???????? ?? hasAccess ?? getEffectivePermissions
// ??? ?????? ????? ??? ??????? ?? ????? ?????? ?? ????????? ?????????
// ?? ??? ???????? ???????? ???? ?? ??????? - ???? ????????? ??? ????? ?????? ?? ??? ??????
const DEFAULT_ROLE_PERMISSIONS = {
    // ???? ?????? - ??????? ????? ??? ?? ?????????? (??? ?????? ???? ?? hasAccess ??????)
    admin: buildRoleDefaults(MODULE_PERMISSIONS_CONFIG.map(m => m.key)),

    // ????? ??????? - ?? ???? ??????? ????????? ??? ????? ?? ??? ???? ??????
    safety_officer: buildRoleDefaults([]),

    // ???????? ?????? - ?? ???? ??????? ????????? ??? ????? ?? ??? ???? ??????
    user: buildRoleDefaults([]),

    // ??? ??????? ??? - ????? ????? ??? ???? ????? ?? ????? ?? ???
    read_only: buildRoleDefaults([])
};

// ? ????? ??????? ??????? ?? ??????
const AVAILABLE_ROLES = [
    { key: 'admin', label: '???? ??????', labelEn: 'System Administrator', color: 'red', icon: 'fa-user-shield' },
    { key: 'safety_officer', label: '????? ???????', labelEn: 'Safety Officer', color: 'blue', icon: 'fa-hard-hat' },
    { key: 'user', label: '?????? ????', labelEn: 'Regular User', color: 'green', icon: 'fa-user' },
    { key: 'read_only', label: '????? ???', labelEn: 'Read Only', color: 'purple', icon: 'fa-eye' }
];

const Permissions = {
    /**
     * ?? ????? «???? ????»? ???? ?????? ?????? ?? ??????/?????? (Admin? ???? ??????? …)
     */
    isAdminRole(role) {
        if (role == null || role === '') return false;
        const r = String(role).trim();
        if (r === '???? ??????' || r === '????') return true;
        const low = r.toLowerCase();
        return (
            low === 'admin' ||
            low === 'administrator' ||
            low === 'system_admin' ||
            low === 'system-manager'
        );
    },

    /**
     * ???? ???? ?? ?????? ?? ?? ???? permissions ?? ?? ???? ?????????? (??? ????????).
     * ??????? ?? Users ???????? adminOnly ???????? ??????? ?????? ??????.
     */
    isCurrentUserEffectiveAdmin(user = AppState.currentUser) {
        if (!user) return false;
        if (this.isAdminRole(user.role)) return true;
        const spRaw = user.permissions;
        const sp = this.normalizePermissions(spRaw);
        if (sp && typeof sp === 'object' && !Array.isArray(sp)) {
            if (this.isAdminRole(sp.role)) return true;
            if (sp.admin === true || sp.isAdmin === true || sp['manage-modules'] === true) return true;
        }
        if (AppState.appData && Array.isArray(AppState.appData.users)) {
            const emailOrId = (user.email || user.id || '').toString().toLowerCase().trim();
            const dbUser = AppState.appData.users.find(u =>
                (u.email && u.email.toString().toLowerCase().trim() === emailOrId) ||
                (u.id && /@/.test(String(u.id)) && u.id.toString().toLowerCase().trim() === emailOrId)
            );
            if (dbUser) {
                if (this.isAdminRole(dbUser.role)) return true;
                const dp = this.normalizePermissions(dbUser.permissions);
                if (dp && typeof dp === 'object' && !Array.isArray(dp)) {
                    if (this.isAdminRole(dp.role)) return true;
                    if (dp.admin === true || dp.isAdmin === true || dp['manage-modules'] === true) return true;
                }
            }
        }
        return false;
    },

    /**
     * ????? ???? ????????? (?????? JSON string ??? ????)
     */
    normalizePermissions(permissions) {
        if (!permissions) return null;
        if (typeof permissions === 'string') {
            try {
                // ?????? ????? JSON ?????
                return JSON.parse(permissions);
            } catch (error) {
                // ??? ??? ????? JSON? ?? ???? ????????? ????? key: value ?? Google Sheets
                const trimmed = permissions.trim();
                if (trimmed && (trimmed.includes(':') || trimmed.includes('\n'))) {
                    try {
                        // ?????? ????? ???? ??? ???? (key: value format)
                        const lines = trimmed.split('\n').filter(line => line.trim());
                        const perms = {};
                        lines.forEach(line => {
                            const match = line.match(/^([^:]+):\s*(.+)$/);
                            if (match) {
                                const key = match[1].trim();
                                let value = match[2].trim();
                                // ????? ????? ?????? ??? boolean/number/string
                                if (value === 'true') {
                                    perms[key] = true;
                                } else if (value === 'false') {
                                    perms[key] = false;
                                } else if (!isNaN(value) && value !== '') {
                                    perms[key] = Number(value);
                                } else {
                                    // ?????? ????? ????? ??????? (??? ????????? ?????????)
                                    // ????: "incidentsPermissions: add: true, edit: false"
                                    if (value.includes(',')) {
                                        const nestedObj = {};
                                        const pairs = value.split(',').map(p => p.trim());
                                        pairs.forEach(pair => {
                                            const nestedMatch = pair.match(/^([^:]+):\s*(.+)$/);
                                            if (nestedMatch) {
                                                const nestedKey = nestedMatch[1].trim();
                                                const nestedValue = nestedMatch[2].trim();
                                                nestedObj[nestedKey] = nestedValue === 'true' ? true : 
                                                                      nestedValue === 'false' ? false : 
                                                                      !isNaN(nestedValue) ? Number(nestedValue) : nestedValue;
                                            }
                                        });
                                        if (Object.keys(nestedObj).length > 0) {
                                            perms[key] = nestedObj;
                                        } else {
                                            perms[key] = value;
                                        }
                                    } else {
                                        perms[key] = value;
                                    }
                                }
                            }
                        });
                        if (Object.keys(perms).length > 0) {
                            return perms;
                        }
                    } catch (parseError) {
                        Utils.safeWarn('? ???? ????? ?????? ????????? ????? key:value? ???? ???????:', parseError);
                    }
                }
                return null;
            }
        }
        return permissions;
    },

    async ensureFormSettingsState(forceReload = false) {
        // ? ?????: ????? ????? ???????? ?? Google Sheets ??? forceReload ????? ?????? ??? ???? ????????
        if (forceReload || !this.formSettingsState) {
            await this.initFormSettingsState();
        }
        return this.formSettingsState;
    },

    getFormSettingsState() {
        // ???? ??????? ?????? ??? ?????? (??????? ?? ???? ?????)
        if (!this.formSettingsState) {
            // ??? ?? ??? ?????? ?????? ????? ???? ????????
            return {
                sites: [],
                selectedSiteId: '',
                departments: [],
                safetyTeam: []
            };
        }
        return this.formSettingsState;
    },

    async initFormSettingsState() {
        // ? ???? ???? AppState.appData ?????? ????? ??? ??????? ??????
        if (typeof AppState === 'undefined') return this.getFormSettingsState();
        if (!AppState.appData) AppState.appData = {};
        // ?? ????? ??? ????? ??? ??? ????? ???? Web App — ???? ????? ????? ??? ??????/DEFAULT_SITES (???? ???? ?????)
        const cloudReady = typeof Utils !== 'undefined' && typeof Utils.hasCloudBackendSync === 'function' && Utils.hasCloudBackendSync();
        const hasRemoteSettingsApi = !!(
            cloudReady &&
            typeof Backend !== 'undefined' &&
            typeof Backend.sendToAppsScript === 'function'
        );

        // ?????? ????? ??????? ?????? ?? Google Sheets ?????
        if (hasRemoteSettingsApi) {
            try {
                const companyResult = await Backend.sendToAppsScript('getCompanySettings', {});
                if (companyResult && companyResult.success && companyResult.data) {
                    // ????? postLoginItems ??? ???? ???? (JSON)
                    let postLoginItems = AppState.companySettings?.postLoginItems;
                    if (companyResult.data.postLoginItems !== undefined) {
                        const raw = companyResult.data.postLoginItems;
                        if (typeof raw === 'string' && raw.trim() !== '') {
                            try {
                                postLoginItems = JSON.parse(raw);
                            } catch (e) {
                                postLoginItems = [];
                            }
                        } else if (Array.isArray(raw)) {
                            postLoginItems = raw;
                        }
                    }
                    if (!Array.isArray(postLoginItems)) postLoginItems = [];

                    // ????? clinicVisitTypes ??? ???? ???? (JSON)
                    let clinicVisitTypes = AppState.companySettings?.clinicVisitTypes;
                    if (companyResult.data.clinicVisitTypes !== undefined) {
                        const rawClinicTypes = companyResult.data.clinicVisitTypes;
                        if (typeof rawClinicTypes === 'string' && rawClinicTypes.trim() !== '') {
                            try {
                                clinicVisitTypes = JSON.parse(rawClinicTypes);
                            } catch (e) {
                                clinicVisitTypes = rawClinicTypes.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
                            }
                        } else if (Array.isArray(rawClinicTypes)) {
                            clinicVisitTypes = rawClinicTypes;
                        } else {
                            clinicVisitTypes = [];
                        }
                    }
                    if (!Array.isArray(clinicVisitTypes)) clinicVisitTypes = [];

                    // ????? AppState ??????? ?????? ?? Google Sheets
                    AppState.companySettings = Object.assign({}, AppState.companySettings, {
                        name: companyResult.data.name || AppState.companySettings?.name,
                        secondaryName: companyResult.data.secondaryName || AppState.companySettings?.secondaryName,
                        nameFontSize: companyResult.data.nameFontSize || AppState.companySettings?.nameFontSize || 16,
                        secondaryNameFontSize: companyResult.data.secondaryNameFontSize || AppState.companySettings?.secondaryNameFontSize || 14,
                        secondaryNameColor: companyResult.data.secondaryNameColor || AppState.companySettings?.secondaryNameColor || '#6B7280',
                        formVersion: companyResult.data.formVersion || AppState.companySettings?.formVersion || '1.0',
                        address: companyResult.data.address || AppState.companySettings?.address,
                        phone: companyResult.data.phone || AppState.companySettings?.phone,
                        email: companyResult.data.email || AppState.companySettings?.email,
                        postLoginItems: postLoginItems,
                        clinicMonthlyVisitsAlertThreshold: companyResult.data.clinicMonthlyVisitsAlertThreshold ?? AppState.companySettings?.clinicMonthlyVisitsAlertThreshold ?? 10,
                        clinicVisitTypes: clinicVisitTypes
                    });

                    // ????? ???? ?????? ??? ??? ???????
                    if (companyResult.data.logo) {
                        AppState.companyLogo = companyResult.data.logo;
                        // ????? ?????? ?? AppState.companySettings ?????
                        if (!AppState.companySettings) {
                            AppState.companySettings = {};
                        }
                        AppState.companySettings.logo = companyResult.data.logo;
                        // ??? ?????? ?? localStorage
                        localStorage.setItem('company_logo', companyResult.data.logo);
                        localStorage.setItem('hse_company_logo', companyResult.data.logo);

                        // ????? ?????? ?? ???? ??????? ???????
                        if (typeof UI !== 'undefined') {
                            if (UI.updateCompanyLogoHeader) {
                                UI.updateCompanyLogoHeader();
                            }
                            if (UI.updateLoginLogo) {
                                UI.updateLoginLogo();
                            }
                            if (UI.updateDashboardLogo) {
                                UI.updateDashboardLogo();
                            }
                            if (UI.updateCompanyBranding) {
                                UI.updateCompanyBranding();
                            }
                        }

                        // ????? ??? ?????? ??????
                        window.dispatchEvent(new CustomEvent('companyLogoUpdated', {
                            detail: { logoUrl: companyResult.data.logo }
                        }));
                    }

                    Utils.safeLog('? ?? ????? ??????? ?????? ?? Google Sheets ?????');
                }
            } catch (error) {
                Utils.safeWarn('?? ??? ????? ??????? ?????? ?? Google Sheets:', error);
            }
        }

        // ? ?????: ?????? ????? ????????? ?? Google Sheets ?????
        // ? ?????: ??? ???? ????? ?????????? ??? ???????? ?????? ??????
        if (hasRemoteSettingsApi) {
            try {
                // ? ?????: ????? ????? ?? ????? ???????? ???? ?????
                const result = await Backend.sendToAppsScript('getFormSettings', {});
                if (result && result.success && result.data) {
                    // ? ?????: ????? AppState ????????? ?? Google Sheets ?? ?????? ?? ???? ??????? ???????
                    if (Array.isArray(result.data.sites) && result.data.sites.length > 0) {
                        // ? ?????: ?????? ?? ?? ?? ???? ????? ??? places (??? ?? ???? ?????? ?????)
                        // ? ?????: ??? ???? ??????? ???????? ???????? String() ????? ????????
                        const normalizedSites = result.data.sites.map(site => {
                            const siteId = String(site.id || '').trim();
                            // ? ?????: ?????? ?? ??? ???? ??????? ??????? ??????? ???? ????
                            // ? ?????: ??????? siteId ?? ?????? ????? ????? ??????
                            const sitePlaces = Array.isArray(site.places) && site.places.length > 0 
                                ? site.places.map(place => {
                                    // ? ?????: ??????? siteId ?? ?????? ?????? ????? ????? ??????
                                    const placeSiteId = String(place.siteId || site.id || siteId || '').trim();
                                    return {
                                        id: place.id || Utils.generateId('PLACE'),
                                        name: place.name || '',
                                        siteId: placeSiteId || siteId // ? ?????: ??? ???? ???????
                                    };
                                })
                                : []; // ? ?????: ?????? ????? ??? ?? ??? ???? ?????
                            
                            return {
                                id: site.id || Utils.generateId('SITE'),
                                name: site.name || '',
                                description: site.description || '',
                                places: sitePlaces // ? ?????: ???? ??????? ??????? ?????? ???? ????
                            };
                        });
                        AppState.appData.observationSites = normalizedSites;
                        // ? ?????: ??? ????? ???????? ??? ?? ??? ???????
                        Utils.safeLog(`? ?? ????? ${normalizedSites.length} ???? ?? ????? ????????`);
                    } else {
                        // ? ??? ??? ??????? ??????? (?? DataManager.load) ??? ???? ??? API ??? ?????
                        if (!Array.isArray(AppState.appData.observationSites)) {
                            AppState.appData.observationSites = [];
                        }
                    }
                    if (Array.isArray(result.data.departments) && result.data.departments.length > 0) {
                        if (!AppState.companySettings) {
                            AppState.companySettings = {};
                        }
                        AppState.companySettings.formDepartments = result.data.departments;
                    }
                    if (Array.isArray(result.data.safetyTeam) && result.data.safetyTeam.length > 0) {
                        if (!AppState.companySettings) {
                            AppState.companySettings = {};
                        }
                        AppState.companySettings.safetyTeam = result.data.safetyTeam;
                    }

                    // ??? ?? localStorage ?????????? ??????
                    const dm = (typeof window !== 'undefined' && window.DataManager) ||
                        (typeof DataManager !== 'undefined' && DataManager);
                    if (dm && typeof dm.save === 'function') {
                        dm.save();
                    }
                    if (dm && typeof dm.saveCompanySettings === 'function') {
                        dm.saveCompanySettings();
                    }

                    Utils.safeLog('? ?? ????? ??????? ??????? ?? Google Sheets ?????');
                } else {
                    Utils.safeWarn('?? ?? ??? ????? ??????? ??????? ?? Google Sheets - ??????? ???????? ???????');
                    if (!Array.isArray(AppState.appData.observationSites)) {
                        AppState.appData.observationSites = [];
                    }
                }
            } catch (error) {
                Utils.safeWarn('?? ??? ????? ??????? ??????? ?? Google Sheets? ???? ??????? ???????? ???????:', error);
                if (!Array.isArray(AppState.appData.observationSites)) {
                    AppState.appData.observationSites = [];
                }
            }
        } else {
            if (!Array.isArray(AppState.appData.observationSites)) {
                AppState.appData.observationSites = [];
            }
        }

        const sitesSource = (() => {
            if (Array.isArray(AppState.appData?.observationSites) && AppState.appData.observationSites.length > 0) {
                return AppState.appData.observationSites;
            }
            if (typeof DailyObservations !== 'undefined' && Array.isArray(DailyObservations.DEFAULT_SITES)) {
                return DailyObservations.DEFAULT_SITES;
            }
            return [];
        })();

        // ? ?????: ?????? ???? ??????? ???????? ??????? - ?????? ?? ????? ???? ???????
        // ?? ?????? slice() ?? limit - ????? ???? ???????
        const clonedSites = sitesSource.map((site, index) => {
            const siteId = site.id || site.siteId || Utils.generateId('SITE');
            const siteName = site.name || site.title || site.label || `???? ${index + 1}`;
            
            // ? ?????: ?????? ???? ??????? ??????? ?? ??? ??? ??????
            let placesSource = [];
            if (Array.isArray(site.places) && site.places.length > 0) {
                placesSource = site.places;
            } else if (Array.isArray(site.locations) && site.locations.length > 0) {
                placesSource = site.locations;
            } else if (Array.isArray(site.children) && site.children.length > 0) {
                placesSource = site.children;
            } else if (Array.isArray(site.areas) && site.areas.length > 0) {
                placesSource = site.areas;
            }
            
            // ? ?????: ????? ??????? ??????? ?? ?????? ?? ???? id ? name ???? ???? ???????
            // ? ?????: ??????? String() ????? ???????? ??????? ??? siteId
            const siteIdStr = String(siteId || '').trim();
            const places = placesSource.map((place, idx) => {
                // ??? ??? place ????? ?????? ??????
                if (typeof place === 'object' && place !== null) {
                    // ? ?????: ??????? String() ????? ???????? ???????
                    const placeSiteId = String(place.siteId || siteId || '').trim();
                    return {
                        id: place.id || place.placeId || place.value || Utils.generateId('PLACE'),
                        name: place.name || place.placeName || place.title || place.label || place.locationName || `???? ${idx + 1}`,
                        siteId: placeSiteId || siteIdStr // ? ?????: ??? ???? ??????? ???????? String()
                    };
                }
                // ??? ??? place ??? ??????? ????
                if (typeof place === 'string') {
                    return {
                        id: Utils.generateId('PLACE'),
                        name: place,
                        siteId: siteIdStr // ? ?????: ??? ???? ??????? ???????? String()
                    };
                }
                // ?? ???? ????? ?????? ???? ????????
                return {
                    id: Utils.generateId('PLACE'),
                    name: `???? ${idx + 1}`,
                    siteId: siteIdStr // ? ?????: ??? ???? ??????? ???????? String()
                };
            });
            
            return {
                id: siteId,
                name: siteName,
                description: site.description || '',
                places: places // ? ?????: ?????? ?? ?? places ?????? ?????? (??? ?? ???? ?????)
            };
        });

        const selectedSiteId = clonedSites[0]?.id || '';

        this.formSettingsState = {
            sites: clonedSites,
            selectedSiteId,
            departments: this.getInitialFormDepartments(),
            safetyTeam: this.getInitialSafetyTeam()
        };

        // ? ????? ??? ?????? ??????? ????? ??? ????? ?????? ?? ??? DOM
        try {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('formSettingsUpdated', {
                    detail: { sites: clonedSites, observationSites: AppState.appData.observationSites }
                }));
                var names = ['Training', 'Clinic', 'PTW', 'Incidents', 'Violations', 'FireEquipment', 'PeriodicInspections', 'BehaviorMonitoring', 'Sustainability'];
                for (var i = 0; i < names.length; i++) {
                    try {
                        var M = window[names[i]];
                        if (M && typeof M.refreshSiteDropdowns === 'function') M.refreshSiteDropdowns();
                    } catch (e2) { Utils.safeWarn?.('app-utils: operation failed', e2); }
                }
                if (clonedSites.length > 0 && typeof Utils !== 'undefined' && Utils.safeLog) {
                    Utils.safeLog('? ?? ????? ??? formSettingsUpdated ?????? ????? ??????/??????');
                }
            }
        } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }

        return this.formSettingsState;
    },

    /**
     * ??????? ???? ??? ?????? ??????? ??????? (???????). ??? ???? ????? ??????? ?????? ???? ??? ??? formSettingsUpdated.
     */
    onFormSettingsReady(callback) {
        if (typeof callback !== 'function') return;
        try {
            if (this.formSettingsState && Array.isArray(this.formSettingsState.sites) && this.formSettingsState.sites.length > 0) {
                callback(this.formSettingsState);
                return;
            }
            const handler = (e) => {
                try { window.removeEventListener('formSettingsUpdated', handler); } catch (err) {}
                try {
                    const state = (e && e.detail && e.detail.sites) ? { sites: e.detail.sites } : this.formSettingsState;
                    callback(state || { sites: [] });
                } catch (err) { Utils.safeWarn('?? onFormSettingsReady callback error:', err); }
            };
            window.addEventListener('formSettingsUpdated', handler);
        } catch (err) { Utils.safeWarn('?? onFormSettingsReady error:', err); }
    },

    getInitialFormDepartments() {
        const settings = AppState.companySettings || {};
        const stored = settings.formDepartments;
        if (Array.isArray(stored)) {
            return stored.map((item) => String(item || '').trim()).filter(Boolean);
        }
        if (typeof stored === 'string') {
            return stored.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
        }
        if (Array.isArray(settings.departments)) {
            return settings.departments.map((item) => String(item || '').trim()).filter(Boolean);
        }
        if (typeof settings.departments === 'string') {
            return settings.departments.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
        }
        if (typeof DailyObservations !== 'undefined' && typeof DailyObservations.getDepartmentOptions === 'function') {
            try {
                const options = DailyObservations.getDepartmentOptions();
                if (Array.isArray(options)) {
                    return options.map((item) => String(item || '').trim()).filter(Boolean);
                }
            } catch (error) {
                Utils.safeWarn('?? ???? ????? ???????? ?? DailyObservations:', error);
            }
        }
        return [];
    },

    getInitialSafetyTeam() {
        const settings = AppState.companySettings || {};
        const stored = settings.safetyTeam || settings.safetyTeamMembers;
        if (Array.isArray(stored)) {
            return stored.map((item) => String(item || '').trim()).filter(Boolean);
        }
        if (typeof stored === 'string') {
            return stored.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
        }
        return [];
    },

    renderFormSettingsCard() {
        return `
            <div class="content-card mt-6" id="form-settings-card">
                <div class="card-header">
                    <h2 class="card-title">
                        <i class="fas fa-file-alt ml-2"></i>
                        ??????? ???????
                    </h2>
                </div>
                <div class="card-body space-y-6">
                    <div class="fs-intro">
                        <span class="fs-intro__icon" aria-hidden="true"><i class="fas fa-info"></i></span>
                        <p class="mb-0">
                            ?? ??? ????? ????? ??????? ????????? ?????? ????? ???????? ???????? ????? ??????? ?????????? ???? ??????? (??? ????????? ???????).
                            ?? ????? ??? ???? ?????? ?? ????? ???????? ????? ?? ??????? ??? ???????. ???? ???????? ????? ?? ??? ???????? ?? ??? ???????? ????????.
                        </p>
                    </div>

                    <section class="fs-section fs-locations-panel" aria-labelledby="fs-locations-title">
                        <div class="fs-section__head">
                            <span class="fs-section__icon fs-section__icon--map" aria-hidden="true"><i class="fas fa-map-marked-alt"></i></span>
                            <div>
                                <h3 class="fs-section__title" id="fs-locations-title">??????? ????????</h3>
                                <p class="fs-section__desc">???? ?????? ?? ?????? ????? ?????? ??????? ??????? ??. ??????? ??????? ??????? ?? ????? ???????.</p>
                            </div>
                        </div>
                        <div class="fs-columns">
                            <div class="fs-panel">
                                <div class="fs-panel__head">
                                    <h4 class="fs-panel__title"><i class="fas fa-map-marker-alt" aria-hidden="true"></i>???????</h4>
                                    <p class="fs-panel__hint">????? ??????? ?? ???????? ?????? «??????» ?????? ?????? ?????.</p>
                                </div>
                                <div id="form-settings-sites-list" class="fs-scroll-list"></div>
                                <button type="button" class="btn-primary btn-sm flex-shrink-0" data-action="add-site">
                                    <i class="fas fa-plus ml-2"></i>????? ????
                                </button>
                            </div>
                            <div class="fs-panel fs-panel--places">
                                <div class="fs-panel__head">
                                    <h4 class="fs-panel__title"><i class="fas fa-location-dot" aria-hidden="true"></i>??????? ???? ?????? ??????</h4>
                                </div>
                                <p id="form-settings-places-context" class="fs-places-context" aria-live="polite"></p>
                                <div id="form-settings-places-list" class="fs-scroll-list"></div>
                                <button type="button" class="btn-secondary btn-sm flex-shrink-0" data-action="add-place" id="form-settings-add-place-btn">
                                    <i class="fas fa-plus ml-2"></i>????? ????
                                </button>
                            </div>
                        </div>
                    </section>

                    <div class="fs-teams-grid">
                        <section class="fs-team-card" aria-labelledby="fs-dept-title">
                            <div class="fs-team-card__head fs-team-card__head--dept">
                                <i class="fas fa-briefcase" aria-hidden="true"></i>
                                <h3 class="fs-team-card__title" id="fs-dept-title">????????? ?? ???????</h3>
                            </div>
                            <div id="form-settings-departments-list" class="fs-scroll-list" style="max-height:16rem;"></div>
                            <button type="button" class="btn-secondary btn-sm" data-action="add-department">
                                <i class="fas fa-plus ml-2"></i>????? ?????
                            </button>
                        </section>
                        <section class="fs-team-card" aria-labelledby="fs-safety-title">
                            <div class="fs-team-card__head fs-team-card__head--safety">
                                <i class="fas fa-user-shield" aria-hidden="true"></i>
                                <h3 class="fs-team-card__title" id="fs-safety-title">???? ???????</h3>
                            </div>
                            <div id="form-settings-safety-list" class="fs-scroll-list" style="max-height:16rem;"></div>
                            <button type="button" class="btn-secondary btn-sm" data-action="add-safety-member">
                                <i class="fas fa-plus ml-2"></i>????? ???
                            </button>
                        </section>
                    </div>

                    <section class="fs-io-panel fs-section" aria-labelledby="fs-io-title">
                        <div class="fs-section__head" style="border-bottom:none;padding-bottom:0;margin-bottom:0.75rem;">
                            <span class="fs-section__icon fs-section__icon--io" aria-hidden="true"><i class="fas fa-exchange-alt"></i></span>
                            <div>
                                <h3 class="fs-section__title" id="fs-io-title">??????? ?????? ????????</h3>
                                <p class="fs-section__desc">??? ????????? ??? ???????? ?? ????????? ?? ??? JSON.</p>
                            </div>
                        </div>
                        <div class="fs-io-toolbar">
                            <button type="button" class="btn-secondary btn-sm" data-action="import-form-settings-file">
                                <i class="fas fa-file-import ml-2"></i>??????? ?? ???
                            </button>
                            <button type="button" class="btn-secondary btn-sm" data-action="export-form-settings">
                                <i class="fas fa-file-export ml-2"></i>????? ??? ???
                            </button>
                            <input type="file" id="form-settings-file-input" accept=".json" style="display: none;">
                        </div>
                        <div class="fs-paste-block">
                            <label for="form-settings-paste-area">
                                <i class="fas fa-paste ml-2"></i>????? ?????? (JSON)
                            </label>
                            <textarea
                                id="form-settings-paste-area"
                                class="form-input w-full min-h-[150px] font-mono text-sm"
                                placeholder='???? ???????? ????? JSON ???? ????:&#10;{&#10;  "sites": [{"id": "SITE1", "name": "???? 1", "places": [{"id": "PLACE1", "name": "???? 1"}]}],&#10;  "departments": ["????? 1", "????? 2"],&#10;  "safetyTeam": ["??? 1", "??? 2"]&#10;}'
                            ></textarea>
                            <div class="fs-paste-actions">
                                <button type="button" class="btn-secondary btn-sm" data-action="paste-form-settings">
                                    <i class="fas fa-clipboard ml-2"></i>??????? ?? ????
                                </button>
                                <button type="button" class="btn-secondary btn-sm" data-action="copy-form-settings">
                                    <i class="fas fa-copy ml-2"></i>??? ??? ???????
                                </button>
                                <button type="button" class="btn-secondary btn-sm" data-action="clear-paste-area">
                                    <i class="fas fa-eraser ml-2"></i>???
                                </button>
                            </div>
                            <p class="fs-hint">
                                <i class="fas fa-info-circle ml-1"></i>
                                ????? ??? ???????? ?? ??? JSON ?????? ???? ?? ??? ???????? ??????? ?????? ?? ???? ???.
                            </p>
                        </div>
                    </section>
                </div>
                <div class="card-footer flex flex-wrap items-center justify-between gap-3">
                    <button type="button" class="btn-secondary" data-action="reset-form-settings">
                        <i class="fas fa-undo ml-2"></i>????? ?????????
                    </button>
                    <button type="button" class="btn-primary" data-action="save-form-settings">
                        <i class="fas fa-save ml-2"></i>??? ??????? ???????
                    </button>
                </div>
            </div>
        `;
    },

    renderFormSitesList() {
        const state = this.getFormSettingsState();
        if (!Array.isArray(state.sites) || state.sites.length === 0) {
            return `
                <div class="fs-empty">
                    <i class="fas fa-map-marker-alt" aria-hidden="true"></i>
                    <span>?? ???? ????? ?????. ???? ??? ?? <strong>????? ????</strong> ?????.</span>
                </div>
            `;
        }

        return state.sites.map((site, index) => `
            <div class="fs-list-row fs-site-row ${site.id === state.selectedSiteId ? 'fs-site-row--selected' : ''}" data-site-id="${Utils.escapeHTML(site.id)}">
                <span class="fs-row-index" title="???????">#${index + 1}</span>
                <input type="text" class="form-input flex-1 min-w-0" data-field="site-name" data-site-id="${Utils.escapeHTML(site.id)}"
                    value="${Utils.escapeHTML(site.name || '')}" placeholder="??? ??????" style="min-width: 8rem;">
                <button type="button" class="btn-secondary btn-xs flex-shrink-0 ${site.id === state.selectedSiteId ? 'btn-primary' : ''}" data-action="select-site" data-site-id="${Utils.escapeHTML(site.id)}">
                    ${site.id === state.selectedSiteId ? '<i class="fas fa-check ml-1"></i>????' : '??????'}
                </button>
                <button type="button" class="btn-danger btn-xs flex-shrink-0" data-action="remove-site" data-site-id="${Utils.escapeHTML(site.id)}" title="??? ??????">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    renderFormPlacesList() {
        const state = this.getFormSettingsState();
        const emptyBox = (icon, body) => `
            <div class="fs-empty fs-empty--inline">
                <i class="fas ${icon}" aria-hidden="true"></i>
                <span>${body}</span>
            </div>`;
        if (!state || !Array.isArray(state.sites)) {
            return emptyBox('fa-map', '?? ???? ????? ?????. ??? ?????? ????? ?? ?????? ???????.');
        }
        if (!state.selectedSiteId) {
            return emptyBox('fa-hand-pointer', '???? ?????? ?? ????? ??????? ???????? ?? <strong>??????</strong> ???? ?????? ??????? ??????? ??.');
        }
        const site = state.sites.find((item) => item.id === state.selectedSiteId);
        if (!site) {
            return emptyBox('fa-exclamation-circle', '?????? ?????? ??? ?????. ???? ?????? ?????? ?? ???????.');
        }
        if (!Array.isArray(site.places) || site.places.length === 0) {
            const label = (site.name || '').trim() || '??? ??????';
            return emptyBox('fa-location-dot', `?? ???? ????? ????? ?? <strong>${Utils.escapeHTML(label)}</strong>. ?????? ?? <strong>????? ????</strong> ?????.`);
        }
        return site.places.map((place, index) => `
            <div class="fs-list-row" data-place-id="${Utils.escapeHTML(place.id)}">
                <span class="fs-row-index" title="???????">#${index + 1}</span>
                <input type="text" class="form-input flex-1 min-w-0" data-field="place-name" data-place-id="${Utils.escapeHTML(place.id)}"
                    value="${Utils.escapeHTML(place.name || '')}" placeholder="??? ?????? ???? ??????" style="min-width: 8rem;">
                <button type="button" class="btn-danger btn-xs flex-shrink-0" data-action="remove-place" data-place-id="${Utils.escapeHTML(place.id)}" title="??? ??????">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    renderDepartmentsList() {
        const state = this.getFormSettingsState();
        if (!Array.isArray(state.departments) || state.departments.length === 0) {
            return `
                <div class="fs-empty fs-empty--inline">
                    <i class="fas fa-briefcase" aria-hidden="true"></i>
                    <span class="text-sm text-gray-500">?? ??? ????? ?????? ?????? ???. ????? ??????? ??? ???? ?????.</span>
                </div>`;
        }
        return state.departments.map((department, index) => `
            <div class="fs-list-row" data-department-index="${index}">
                <span class="fs-row-index">#${index + 1}</span>
                <input type="text" class="form-input flex-1" data-field="department-name" data-department-index="${index}"
                    value="${Utils.escapeHTML(department || '')}" placeholder="??? ??????? ?? ????? ????????">
                <button type="button" class="btn-danger btn-xs" data-action="remove-department" data-department-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    renderSafetyTeamList() {
        const state = this.getFormSettingsState();
        if (!Array.isArray(state.safetyTeam) || state.safetyTeam.length === 0) {
            return `
                <div class="fs-empty fs-empty--inline">
                    <i class="fas fa-user-shield" aria-hidden="true"></i>
                    <span class="text-sm text-gray-500">?? ??? ????? ????? ???? ???????. ????? ????? ??????? ??? ???? ?????.</span>
                </div>`;
        }
        return state.safetyTeam.map((member, index) => `
            <div class="fs-list-row" data-safety-index="${index}">
                <span class="fs-row-index">#${index + 1}</span>
                <input type="text" class="form-input flex-1" data-field="safety-name" data-safety-index="${index}"
                    value="${Utils.escapeHTML(member || '')}" placeholder="??? ??? ???? ???????">
                <button type="button" class="btn-danger btn-xs" data-action="remove-safety-member" data-safety-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    },

    refreshFormSettingsUI() {
        const state = this.getFormSettingsState();
        const sitesList = document.getElementById('form-settings-sites-list');
        if (sitesList) {
            sitesList.innerHTML = this.renderFormSitesList();
        }
        const placesList = document.getElementById('form-settings-places-list');
        if (placesList) {
            placesList.innerHTML = this.renderFormPlacesList();
        }
        const departmentsList = document.getElementById('form-settings-departments-list');
        if (departmentsList) {
            departmentsList.innerHTML = this.renderDepartmentsList();
        }
        const safetyList = document.getElementById('form-settings-safety-list');
        if (safetyList) {
            safetyList.innerHTML = this.renderSafetyTeamList();
        }
        const addPlaceBtn = document.getElementById('form-settings-add-place-btn');
        if (addPlaceBtn) {
            addPlaceBtn.disabled = !state.selectedSiteId;
        }
        const placesCtx = document.getElementById('form-settings-places-context');
        if (placesCtx) {
            if (!state || !state.selectedSiteId || !Array.isArray(state.sites)) {
                placesCtx.textContent =
                    '?? ????? ???? ???. ???? ?????? ?? ????? «???????» ??? «??????» ???? ??????? ??????? ??.';
            } else {
                const sel = state.sites.find((s) => s.id === state.selectedSiteId);
                if (!sel) {
                    placesCtx.textContent = '?????? ?????? ??? ????? ?? ???????. ???? ?????? ???.';
                } else {
                    const name = String(sel.name || '').trim() || sel.id;
                    const n = Array.isArray(sel.places) ? sel.places.length : 0;
                    placesCtx.textContent = `?????? ?????: ${name} — ??? ??????? ???????: ${n}`;
                }
            }
        }
    },

    async bindFormSettingsEvents() {
        const card = document.getElementById('form-settings-card');
        if (!card) return;

        // ? ?????: ????? ????? ???????? ?? Google Sheets ??? ??? ??????? ????? ?????? ??? ???? ????????
        // forceReload = true ????? ????? ???? ??????? (50 ????) ?? ????? ????????
        await this.ensureFormSettingsState(true); // forceReload = true
        
        // ? ?????: ?????? ?? ????? ??????? ??? ???????
        this.refreshFormSettingsUI();
        
        // ? ?????: ????? ????? ????? ???????? (??? ?? ??? ???????)
        const sitesCount = this.formSettingsState?.sites?.length || 0;
        if (sitesCount > 0) {
            Utils.safeLog(`? ?? ????? ${sitesCount} ???? ?? ????? ??????? ???????`);
        } else {
            Utils.safeWarn('?? ?? ??? ????? ?? ????? - ???? ?? ????? ????????');
        }

        if (this._formSettingsBoundCard && this._formSettingsBoundCard !== card) {
            this.formSettingsEventsBound = false;
        }

        if (this.formSettingsEventsBound) return;
        this.formSettingsEventsBound = true;
        this._formSettingsBoundCard = card;

        card.addEventListener('click', (event) => {
            const actionElement = event.target.closest('[data-action]');
            if (!actionElement) return;
            const action = actionElement.getAttribute('data-action');
            switch (action) {
                case 'add-site':
                    this.handleAddSite();
                    break;
                case 'select-site':
                    this.handleSelectSite(actionElement.getAttribute('data-site-id'));
                    break;
                case 'remove-site':
                    this.handleRemoveSite(actionElement.getAttribute('data-site-id'));
                    break;
                case 'add-place':
                    this.handleAddPlace();
                    break;
                case 'remove-place':
                    this.handleRemovePlace(actionElement.getAttribute('data-place-id'));
                    break;
                case 'add-department':
                    this.handleAddDepartment();
                    break;
                case 'remove-department':
                    this.handleRemoveDepartment(Number(actionElement.getAttribute('data-department-index')));
                    break;
                case 'add-safety-member':
                    this.handleAddSafetyMember();
                    break;
                case 'remove-safety-member':
                    this.handleRemoveSafetyMember(Number(actionElement.getAttribute('data-safety-index')));
                    break;
                case 'reset-form-settings':
                    this.handleResetFormSettings();
                    break;
                case 'save-form-settings':
                    this.handleSaveFormSettings();
                    break;
                case 'import-form-settings-file':
                    this.handleImportFormSettingsFile();
                    break;
                case 'export-form-settings':
                    this.handleExportFormSettings();
                    break;
                case 'paste-form-settings':
                    this.handlePasteFormSettings();
                    break;
                case 'copy-form-settings':
                    this.handleCopyFormSettings();
                    break;
                case 'clear-paste-area':
                    this.handleClearPasteArea();
                    break;
                default:
                    break;
            }
        });

        card.addEventListener('input', (event) => {
            const target = event.target;
            if (!target) return;
            const field = target.getAttribute('data-field');
            switch (field) {
                case 'site-name':
                    this.handleSiteNameChange(target.getAttribute('data-site-id'), target.value);
                    break;
                case 'place-name':
                    this.handlePlaceNameChange(target.getAttribute('data-place-id'), target.value);
                    break;
                case 'department-name':
                    this.handleDepartmentChange(Number(target.getAttribute('data-department-index')), target.value);
                    break;
                case 'safety-name':
                    this.handleSafetyMemberChange(Number(target.getAttribute('data-safety-index')), target.value);
                    break;
                default:
                    break;
            }
        });

        // ??? ??? ?????? ?????
        const fileInput = document.getElementById('form-settings-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', (event) => {
                const file = event.target.files?.[0];
                if (file) {
                    this.handleImportFormSettingsFileContent(file);
                }
                // ????? ????? ???? input ????? ?????? ??? ????? ??? ????
                event.target.value = '';
            });
        }
    },

    async handleAddSite() {
        const state = await this.ensureFormSettingsState();
        if (!state) {
            Utils.safeError('? ??? ????? ???? ??????? ???????');
            return;
        }
        if (!Array.isArray(state.sites)) {
            state.sites = [];
        }
        const newSite = {
            id: Utils.generateId('SITE'),
            name: '',
            places: []
        };
        state.sites.push(newSite);
        state.selectedSiteId = newSite.id;
        this.refreshFormSettingsUI();
        setTimeout(() => {
            const input = document.querySelector(`[data-field="site-name"][data-site-id="${newSite.id}"]`);
            if (input) input.focus();
        }, 0);
    },

    handleSelectSite(siteId) {
        const state = this.getFormSettingsState();
        if (!siteId || !state || !Array.isArray(state.sites)) return;
        if (!state.sites.some((site) => site.id === siteId)) return;
        state.selectedSiteId = siteId;
        this.refreshFormSettingsUI();
    },

    handleRemoveSite(siteId) {
        const state = this.getFormSettingsState();
        if (!siteId || !state || !Array.isArray(state.sites)) return;
        const index = state.sites.findIndex((site) => site.id === siteId);
        if (index === -1) return;
        const siteName = state.sites[index].name || '???? ???? ???';
        if (!confirm(`???? ??? ?????? "${siteName}" ????? ??????? ???????? ??. ?? ???? ??????????`)) {
            return;
        }
        state.sites.splice(index, 1);
        if (state.selectedSiteId === siteId) {
            state.selectedSiteId = state.sites[0]?.id || '';
        }
        this.refreshFormSettingsUI();
    },

    handleSiteNameChange(siteId, value) {
        const state = this.getFormSettingsState();
        if (!state || !Array.isArray(state.sites)) return;
        const site = state.sites.find((item) => item.id === siteId);
        if (site) {
            site.name = value;
        }
    },

    handleAddPlace() {
        const state = this.getFormSettingsState();
        if (!state || !Array.isArray(state.sites)) return;
        const siteId = state.selectedSiteId;
        if (!siteId) {
            Notification.warning('???? ?????? ???? ?????.');
            return;
        }
        const site = state.sites.find((item) => item.id === siteId);
        if (!site) return;
        if (!Array.isArray(site.places)) {
            site.places = [];
        }
        const newPlace = {
            id: Utils.generateId('PLACE'),
            name: ''
        };
        site.places.push(newPlace);
        this.refreshFormSettingsUI();
        setTimeout(() => {
            const input = document.querySelector(`[data-field="place-name"][data-place-id="${newPlace.id}"]`);
            if (input) input.focus();
        }, 0);
    },

    handlePlaceNameChange(placeId, value) {
        const state = this.getFormSettingsState();
        if (!state || !Array.isArray(state.sites)) return;
        const site = state.sites.find((item) => item.id === state.selectedSiteId);
        if (!site || !Array.isArray(site.places)) return;
        const place = site.places.find((item) => item.id === placeId);
        if (place) {
            place.name = value;
        }
    },

    handleRemovePlace(placeId) {
        const state = this.getFormSettingsState();
        if (!state || !Array.isArray(state.sites)) return;
        const site = state.sites.find((item) => item.id === state.selectedSiteId);
        if (!site || !Array.isArray(site.places)) return;
        const index = site.places.findIndex((item) => item.id === placeId);
        if (index === -1) return;
        const placeName = site.places[index].name || '???? ???? ???';
        if (!confirm(`?? ???? ?? ??? ?????? "${placeName}"?`)) {
            return;
        }
        site.places.splice(index, 1);
        this.refreshFormSettingsUI();
    },

    handleAddDepartment() {
        const state = this.getFormSettingsState();
        if (!state) return;
        if (!Array.isArray(state.departments)) {
            state.departments = [];
        }
        state.departments.push('');
        this.refreshFormSettingsUI();
        setTimeout(() => {
            const index = state.departments.length - 1;
            const input = document.querySelector(`[data-field="department-name"][data-department-index="${index}"]`);
            if (input) input.focus();
        }, 0);
    },

    handleDepartmentChange(index, value) {
        const state = this.getFormSettingsState();
        if (!state) return;
        if (!Array.isArray(state.departments)) {
            state.departments = [];
        }
        if (Number.isInteger(index) && index >= 0 && index < state.departments.length) {
            state.departments[index] = value;
        }
    },

    handleRemoveDepartment(index) {
        const state = this.getFormSettingsState();
        if (!state || !Array.isArray(state.departments)) return;
        if (!Number.isInteger(index) || index < 0 || index >= state.departments.length) return;
        state.departments.splice(index, 1);
        this.refreshFormSettingsUI();
    },

    handleAddSafetyMember() {
        const state = this.getFormSettingsState();
        if (!state) return;
        if (!Array.isArray(state.safetyTeam)) {
            state.safetyTeam = [];
        }
        state.safetyTeam.push('');
        this.refreshFormSettingsUI();
        setTimeout(() => {
            const index = state.safetyTeam.length - 1;
            const input = document.querySelector(`[data-field="safety-name"][data-safety-index="${index}"]`);
            if (input) input.focus();
        }, 0);
    },

    handleSafetyMemberChange(index, value) {
        const state = this.getFormSettingsState();
        if (!state) return;
        if (!Array.isArray(state.safetyTeam)) {
            state.safetyTeam = [];
        }
        if (Number.isInteger(index) && index >= 0 && index < state.safetyTeam.length) {
            state.safetyTeam[index] = value;
        }
    },

    handleRemoveSafetyMember(index) {
        const state = this.getFormSettingsState();
        if (!state || !Array.isArray(state.safetyTeam)) return;
        if (!Number.isInteger(index) || index < 0 || index >= state.safetyTeam.length) return;
        state.safetyTeam.splice(index, 1);
        this.refreshFormSettingsUI();
    },

    handleResetFormSettings() {
        if (!confirm('???? ????? ???? ????????? ??? ????????. ?? ???? ?????????')) {
            return;
        }
        this.initFormSettingsState();
        this.refreshFormSettingsUI();
        Notification.success('??? ??????? ????????? ??? ???? ??? ???????.');
    },

    sanitizeSites(rawSites = []) {
        const sites = [];
        for (const site of rawSites) {
            const id = site.id || Utils.generateId('SITE');
            const name = (site.name || '').trim();
            if (!name) {
                return {
                    error: '???? ????? ??? ??? ????.',
                    focusSelector: `[data-field="site-name"][data-site-id="${id}"]`
                };
            }
            const placesRaw = Array.isArray(site.places) ? site.places : [];
            const places = [];
            for (const place of placesRaw) {
                const placeId = place.id || Utils.generateId('PLACE');
                const placeName = (place.name || '').trim();
                if (!placeName) {
                    return {
                        error: `???? ????? ??? ????? ??????? ???? ?????? "${name}".`,
                        focusSelector: `[data-field="place-name"][data-place-id="${placeId}"]`
                    };
                }
                places.push({ id: placeId, name: placeName });
            }
            sites.push({ id, name, places });
        }
        if (!sites.length) {
            return {
                error: '??? ????? ???? ???? ??? ?????.',
                focusSelector: '[data-action="add-site"]'
            };
        }
        return { sites };
    },

    async handleSaveFormSettings() {
        const state = await this.ensureFormSettingsState();
        if (!state) {
            Utils.safeError('? ??? ????? ???? ??????? ???????');
            return;
        }
        const sanitizedResult = this.sanitizeSites(state.sites || []);
        if (sanitizedResult.error) {
            Notification.error(sanitizedResult.error);
            if (sanitizedResult.focusSelector) {
                const element = document.querySelector(sanitizedResult.focusSelector);
                if (element) {
                    element.focus();
                    element.classList.add('ring', 'ring-ring-500');
                    setTimeout(() => element.classList.remove('ring', 'ring-red-500'), 1500);
                }
            }
            return;
        }

        const sites = sanitizedResult.sites;
        const departments = (state.departments || [])
            .map((value) => String(value || '').trim())
            .filter((value, index, array) => value && array.indexOf(value) === index);
        const safetyTeam = (state.safetyTeam || [])
            .map((value) => String(value || '').trim())
            .filter((value, index, array) => value && array.indexOf(value) === index);

        const dm = (typeof window !== 'undefined' && window.DataManager) ||
            (typeof DataManager !== 'undefined' && DataManager);

        const cloudReady = typeof Utils !== 'undefined'
            && typeof Utils.hasCloudBackendSync === 'function'
            && Utils.hasCloudBackendSync();

        if (cloudReady && typeof Backend !== 'undefined') {
            try {
                const userData = AppState.currentUser || {};
                const result = await Backend.sendToAppsScript('saveFormSettings', {
                    id: 'FORM-SETTINGS-1',
                    sites: sites,
                    departments: departments,
                    safetyTeam: safetyTeam,
                    userData: {
                        email: userData.email,
                        name: userData.name,
                        role: userData.role,
                        permissions: userData.permissions
                    }
                });

                if (!result || !result.success) {
                    Notification.error('??? ??? ??????? ??????? ?? ???????: ' + ((result && result.message) || '??? ??? ?????'));
                    return;
                }
                Utils.safeLog('? ?? ??? ??????? ??????? ?? ??????? ?????');
            } catch (error) {
                Notification.error('??? ????? ??? ??????? ???????: ' + (error.message || error));
                return;
            }
        } else if (Utils.hasCloudBackendSync() && typeof Backend !== 'undefined') {
            try {
                const userData = AppState.currentUser || {};
                const result = await Backend.sendToAppsScript('saveFormSettings', {
                    id: 'FORM-SETTINGS-1',
                    sites: sites,
                    departments: departments,
                    safetyTeam: safetyTeam,
                    userData: {
                        email: userData.email,
                        name: userData.name,
                        role: userData.role,
                        permissions: userData.permissions
                    }
                });

                if (result && result.success) {
                    Utils.safeLog('? ?? ??? ??????? ??????? ?? Google Sheets ?????');
                } else {
                    Utils.safeWarn('?? ??? ??? ??????? ??????? ?? Google Sheets:', result?.message);
                }
            } catch (error) {
                Utils.safeWarn('?? ??? ????? ?????? ??????? ??????? ?? Google Sheets:', error);
            }
        }

        // ??? ?? localStorage ??? ???? ??????? (?? ?? ????? ?????? ???)
        AppState.appData.observationSites = sites;
        if (!AppState.companySettings) {
            AppState.companySettings = {};
        }
        AppState.companySettings.formDepartments = departments;
        AppState.companySettings.safetyTeam = safetyTeam;

        if (dm && typeof dm.save === 'function') {
            dm.save();
        }
        if (dm && typeof dm.saveCompanySettings === 'function') {
            dm.saveCompanySettings();
        }

        // ????? ???? ????????
        if (typeof UserActivityLog !== 'undefined') {
            UserActivityLog.log('settings', 'Settings', 'form-settings', {
                description: '????? ??????? ??????? (???????? ????????? ???? ???????)'
            }).catch(() => { });
        }

        AuditLog.log('update_form_settings', 'Settings', 'form-settings', {
            sites: sites.length,
            departments: departments.length,
            safetyTeam: safetyTeam.length
        });

        Notification.success('?? ??? ??????? ??????? ?????.');
        await this.initFormSettingsState();
        this.refreshFormSettingsUI();
        try {
            window.dispatchEvent(new CustomEvent('formSettingsUpdated', {
                detail: { sites, observationSites: AppState.appData.observationSites }
            }));
        } catch (_e) { /* ignore */ }
    },

    handleImportFormSettingsFile() {
        const fileInput = document.getElementById('form-settings-file-input');
        if (fileInput) {
            fileInput.click();
        }
    },

    handleImportFormSettingsFileContent(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                const data = JSON.parse(content);
                this.importFormSettingsData(data);
            } catch (error) {
                Notification.error('??? ????? ?????. ???? ?? ?? ????? ????? JSON ?????: ' + error.message);
            }
        };
        reader.onerror = () => {
            Notification.error('??? ??? ????? ????? ?????.');
        };
        reader.readAsText(file);
    },

    importFormSettingsData(data) {
        if (!data || typeof data !== 'object') {
            Notification.error('???? ???????? ??? ?????.');
            return;
        }

        const state = this.getFormSettingsState();
        if (!state) {
            Utils.safeError('? ??? ????? ???? ??????? ???????');
            return;
        }
        let imported = false;

        // ??????? ???????
        if (Array.isArray(data.sites) && data.sites.length > 0) {
            const importedSites = data.sites.map((site, index) => {
                const siteId = site.id || Utils.generateId('SITE');
                const siteName = site.name || site.title || site.label || `???? ${index + 1}`;
                const placesSource = Array.isArray(site.places)
                    ? site.places
                    : Array.isArray(site.locations)
                        ? site.locations
                        : Array.isArray(site.children)
                            ? site.children
                            : Array.isArray(site.areas)
                                ? site.areas
                                : [];
                const places = placesSource.map((place, idx) => ({
                    id: place.id || place.placeId || place.value || Utils.generateId('PLACE'),
                    name: place.name || place.placeName || place.title || place.label || place.locationName || `???? ${idx + 1}`
                }));
                return {
                    id: siteId,
                    name: siteName,
                    places
                };
            });
            state.sites = importedSites;
            state.selectedSiteId = importedSites[0]?.id || '';
            imported = true;
        }

        // ??????? ????????
        if (Array.isArray(data.departments) && data.departments.length > 0) {
            state.departments = data.departments
                .map((item) => String(item || '').trim())
                .filter(Boolean);
            imported = true;
        } else if (typeof data.departments === 'string') {
            state.departments = data.departments
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean);
            imported = true;
        }

        // ??????? ???? ???????
        if (Array.isArray(data.safetyTeam) && data.safetyTeam.length > 0) {
            state.safetyTeam = data.safetyTeam
                .map((item) => String(item || '').trim())
                .filter(Boolean);
            imported = true;
        } else if (Array.isArray(data.safetyTeamMembers) && data.safetyTeamMembers.length > 0) {
            state.safetyTeam = data.safetyTeamMembers
                .map((item) => String(item || '').trim())
                .filter(Boolean);
            imported = true;
        } else if (typeof data.safetyTeam === 'string') {
            state.safetyTeam = data.safetyTeam
                .split(/\n|,/)
                .map((item) => item.trim())
                .filter(Boolean);
            imported = true;
        }

        if (imported) {
            this.refreshFormSettingsUI();
            Notification.success('?? ??????? ???????? ?????. ????? ?????? ????????? ??????.');
        } else {
            Notification.warning('?? ??? ?????? ??? ?????? ????? ?????????.');
        }
    },

    handleExportFormSettings() {
        const state = this.getFormSettingsState();
        if (!state) {
            Utils.safeError('? ??? ????? ???? ??????? ???????');
            return;
        }
        const exportData = {
            sites: state.sites || [],
            departments: state.departments || [],
            safetyTeam: state.safetyTeam || []
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `form-settings-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Notification.success('?? ????? ???????? ?????.');
    },

    handlePasteFormSettings() {
        const pasteArea = document.getElementById('form-settings-paste-area');
        if (!pasteArea) return;

        const text = pasteArea.value.trim();
        if (!text) {
            Notification.warning('?????? ??? ???????? ?? ??????? ?????? ?????.');
            return;
        }

        try {
            const data = JSON.parse(text);
            this.importFormSettingsData(data);
            pasteArea.value = '';
        } catch (error) {
            Notification.error('???? JSON ??? ?????. ???? ?? ????????: ' + error.message);
        }
    },

    handleCopyFormSettings() {
        const state = this.getFormSettingsState();
        if (!state) {
            Utils.safeError('? ??? ????? ???? ??????? ???????');
            return;
        }
        const exportData = {
            sites: state.sites || [],
            departments: state.departments || [],
            safetyTeam: state.safetyTeam || []
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const pasteArea = document.getElementById('form-settings-paste-area');
        if (pasteArea) {
            pasteArea.value = jsonString;
            pasteArea.select();
            pasteArea.setSelectionRange(0, 99999); // ??????? ????????
        }

        // ??? ??? ???????
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(jsonString).then(() => {
                Notification.success('?? ??? ???????? ??? ???????.');
            }).catch(() => {
                // Fallback: ??????? execCommand
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = jsonString;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-999999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    Notification.success('?? ??? ???????? ??? ???????.');
                } catch (err) {
                    Notification.error('??? ??? ????????. ???? ?????? ?? ??????? ??????.');
                }
            });
        } else {
            // Fallback ????????? ???????
            try {
                const textArea = document.createElement('textarea');
                textArea.value = jsonString;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                Notification.success('?? ??? ???????? ??? ???????.');
            } catch (err) {
                Notification.error('??? ??? ????????. ?????? Ctrl+C ??? ???? ?? ??????? ??????.');
            }
        }
    },

    handleClearPasteArea() {
        const pasteArea = document.getElementById('form-settings-paste-area');
        if (pasteArea) {
            pasteArea.value = '';
            pasteArea.focus();
        }
    },

    /**
     * ?????? ??? ??????? ???????? ?? ????? ????????
     */
    getDatabasePermissions(user) {
        if (!user || !user.email) {
            if (AppState.debugMode) {
                Utils.safeWarn('?? getDatabasePermissions: ?? ???? ?????? ?? ???? ????????');
            }
            return null;
        }
        
        // ? ?????: ?????? ?? ???? AppState.appData.users
        if (!AppState.appData || !AppState.appData.users) {
            if (AppState.debugMode) {
                Utils.safeLog('?? getDatabasePermissions: AppState.appData.users ??? ????? ???');
            }
            return null;
        }
        
        const users = AppState.appData.users || [];
        const dbUser = users.find(u => u.email && u.email.toLowerCase() === user.email.toLowerCase());
        
        if (!dbUser) {
            if (AppState.debugMode) {
                Utils.safeLog(`?? getDatabasePermissions: ???????? ${user.email} ??? ????? ?? ????? ????????`);
            }
            return null;
        }
        
        // ? ?????: ????? ????????? ??????? ?? ???? ???? ????
        const normalized = this.normalizePermissions(dbUser.permissions);
        if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
            if (AppState.debugMode) {
                Utils.safeLog(`? getDatabasePermissions: ?? ?????? ??? ??????? ???????? ${user.email}`, Object.keys(normalized).length, '??????');
            }
            return normalized;
        } else {
            // ??? ???? ????????? ??? ?????? ???? ???? ???? ????? ?? null
            if (AppState.debugMode) {
                Utils.safeWarn(`?? getDatabasePermissions: ??????? ???????? ${user.email} ??? ????? - ????? ???? ????`);
            }
            return {};
        }
    },

    /**
     * ?????? ??? ????????? ???????? ???????? (???? + ????? ??????)
     * ???? ???????? ????????? ?? ????? ???????? ????? ???????? ???????
     * 
     * ?? ???: ?? ??? ??????? DEFAULT_ROLE_PERMISSIONS ??? - ??? ????????? ???????? ?????? ?? ??? ??????
     * 
     * @param {Object} user - ?????? ???????? (???????: ???????? ??????)
     * @returns {Object} - ???? ????????? ???????
     */
    getEffectivePermissions(user = AppState.currentUser) {
        if (!user) return {};
        if (this.isCurrentUserEffectiveAdmin(user)) {
            return { __isAdmin: true };
        }

        const effective = {};

        // ? ?????: ?????? ??? ????????? ?? ?????? ????? (????? ????? ??? ?? ?? ??? ???????? ?????)
        const sessionPermissions = this.normalizePermissions(user.permissions);
        if (sessionPermissions && typeof sessionPermissions === 'object' && Object.keys(sessionPermissions).length > 0) {
            // ??? ????????? ?? ??????
            // ? ?????: ??????? deep merge ????????? ?????????
            Object.keys(sessionPermissions).forEach(key => {
                if (key.endsWith('Permissions') && typeof sessionPermissions[key] === 'object') {
                    // ????????? ????????? - ??? ????
                    effective[key] = { ...(effective[key] || {}), ...sessionPermissions[key] };
                } else {
                    // ????????? ????????
                    effective[key] = sessionPermissions[key];
                }
            });
        }

        // ?????? ??? ????????? ?? ????? ???????? (?????? - ??? ????????)
        const dbPermissions = this.getDatabasePermissions(user);
        if (dbPermissions && typeof dbPermissions === 'object' && Object.keys(dbPermissions).length > 0) {
            // ? ?????: ??? ???? ????????? ?? ????? ???????? (???????? - ?????? ????????? ?? ??????)
            Object.keys(dbPermissions).forEach(key => {
                if (key.endsWith('Permissions') && typeof dbPermissions[key] === 'object') {
                    // ????????? ????????? - ??? ????
                    effective[key] = { ...(effective[key] || {}), ...dbPermissions[key] };
                } else {
                    // ????????? ????????
                    effective[key] = dbPermissions[key];
                }
            });

            // ????? ??????? ???????? ?????? ?? AppState ??? ??? ?? ???????? ??????
            if (user === AppState.currentUser || (user.email && AppState.currentUser && user.email === AppState.currentUser.email)) {
                AppState.currentUser.permissions = dbPermissions;
            }
        }

        // ?? ?? ??? ????? ?? ??????? ???????? ??? - ??? ????????? ???????? ??????

        return effective;
    },

    /**
     * ?????? ?? ?????? ???????? ?????? ??? ????? ????
     * 
     * ?? ???: ?? ???? ??????? ???????? - ???? ????????? ??? ????? ?????? ?? ??? ???? ??????
     * 
     * @param {string} moduleName - ??? ????????
     * @returns {boolean} - true ??? ??? ???? ??????? false ??? ?? ??? ???? ??????
     */
    /** Site IDs allowed for user; null = all sites (admin / unrestricted legacy). */
    getAllowedSiteIds(user = AppState.currentUser) {
        if (typeof window !== 'undefined' && window.SaaSOrgSites && typeof SaaSOrgSites.allowedSiteIds === 'function') {
            return SaaSOrgSites.allowedSiteIds(user);
        }
        if (!user) return null;
        if (this.isCurrentUserEffectiveAdmin(user)) return null;
        const raw = user.allowedSites || user.siteIds || [];
        if (!Array.isArray(raw) || raw.length === 0) return null;
        return raw.map(String);
    },

    filterByAllowedSites(records, user = AppState.currentUser) {
        if (typeof window !== 'undefined' && window.SaaSOrgSites && typeof SaaSOrgSites.filterBySite === 'function') {
            return SaaSOrgSites.filterBySite(records);
        }
        return Array.isArray(records) ? records : [];
    },

    hasAccess(moduleName) {
        const user = AppState.currentUser;
        if (!user) {
            if (AppState.debugMode) {
                Utils.safeWarn(`?? hasAccess(${moduleName}): ?? ???? ?????? ???? ????`);
            }
            return false;
        }

        // ???? ?????? ???? ?????? ??? ?????? ???? ??????
        if (moduleName === 'profile') {
            return true;
        }

        if (moduleName === 'compliance-reports') {
            return this.hasAccess('iso') || this.hasAccess('action-tracking') || this.isCurrentUserEffectiveAdmin(user);
        }

        // ??????? ?????? — ????? ??? ?????? ???? (?????? plan-gating CORE ? app.core_module_keys)
        if (moduleName === 'safety-calendar' || moduleName === 'help') {
            return true;
        }

        // ?????? ?? ?????????? ??????? (adminOnly): ???? ????? ?? ??? ???? ?? permissions (?????? ?? ???? ??????????)
        const moduleConfig = MODULE_PERMISSIONS_CONFIG.find(m => m.key === moduleName);
        if (moduleConfig && moduleConfig.adminOnly) {
            if (this.isCurrentUserEffectiveAdmin(user)) {
                return true;
            }
            const effectivePermissions = this.getEffectivePermissions(user);
            if (
                effectivePermissions &&
                typeof effectivePermissions === 'object' &&
                !Array.isArray(effectivePermissions) &&
                Object.prototype.hasOwnProperty.call(effectivePermissions, moduleName) &&
                effectivePermissions[moduleName] === true
            ) {
                if (AppState.debugMode) {
                    Utils.safeLog(`? hasAccess(${moduleName}): ??? ???? ??? ?????? adminOnly`);
                }
                return true;
            }
            if (AppState.debugMode) {
                Utils.safeLog(`?? hasAccess(${moduleName}): ?????? ???? — ?? ??? ???? ??? ?????? ?????`);
            }
            return false;
        }

        // ?????? ???? ??????? ?????
        if (this.isCurrentUserEffectiveAdmin(user)) {
            if (AppState.debugMode) {
                Utils.safeLog(`? hasAccess(${moduleName}): ???? ?????? - ?????? ?????`);
            }
            return true;
        }

        // ?????? ?? ????????? ??????? ???????? (???????? ?? ??? ???? ?????? ???)
        // ?? ?? ??? ??????? DEFAULT_ROLE_PERMISSIONS ??? - ??? ????????? ???????? ??????
        const effectivePermissions = this.getEffectivePermissions(user);
        if (Object.prototype.hasOwnProperty.call(effectivePermissions, moduleName)) {
            const hasAccess = effectivePermissions[moduleName] === true;
            if (AppState.debugMode) {
                Utils.safeLog(`?? hasAccess(${moduleName}): ${hasAccess ? '? ?????' : '? ??? ?????'} (?? ????????? ???????)`);
            }
            return hasAccess;
        }

        // ?? ?? ???? ??????? ???????? - ??? ????? ?? ??? ???? ?????? ???
        if (AppState.debugMode) {
            Utils.safeLog(`? hasAccess(${moduleName}): ?? ???? ?????? - ??? ????? ?? ??? ??????`);
        }
        return false;
    },

    /**
     * ?????? ?? ?????? ??????? ???? ?????
     * @param {string} moduleName - ??? ??????? (??? 'incidents', 'clinic')
     * @param {string} permissionKey - ????? ???????? ????????? (??? 'analysis', 'registry')
     * @returns {boolean} - true ??? ??? ???? ??????
     */
    hasDetailedPermission(moduleName, permissionKey) {
        const user = AppState.currentUser;
        if (!user) return false;

        // ?????? ???? ??????? ?????
        if (this.isCurrentUserEffectiveAdmin(user)) return true;

        // ?????? ?? ???? ?????? ?????? ??????? ?????
        if (!this.hasAccess(moduleName)) return false;

        // ?????? ??? ????????? ???????
        const effectivePermissions = this.getEffectivePermissions(user);
        
        // ?????? ?? ????????? ?????????
        const detailedPerms = effectivePermissions[`${moduleName}Permissions`];
        if (detailedPerms && typeof detailedPerms === 'object') {
            return detailedPerms[permissionKey] === true;
        }

        // ??? ?? ???? ??????? ???????? ???? ?????? ?????? ???????
        // (??????? ?? ?????????? ???????)
        return true;
    },

    /**
     * ?????? ??? ????? ????????? ????????? ??????? ??? ?????? ????
     * @param {string} moduleName - ??? ???????
     * @returns {Array} - ?????? ??????? ????????? ??????? ???
     */
    getAllowedDetailedPermissions(moduleName) {
        const user = AppState.currentUser;
        if (!user) return [];

        // ?????? ???? ??????? ?????
        if (this.isCurrentUserEffectiveAdmin(user)) {
            const moduleDetails = MODULE_DETAILED_PERMISSIONS[moduleName];
            if (moduleDetails && moduleDetails.permissions) {
                return moduleDetails.permissions.map(p => p.key);
            }
            return [];
        }

        // ?????? ?? ???? ?????? ?????? ??????? ?????
        if (!this.hasAccess(moduleName)) return [];

        const effectivePermissions = this.getEffectivePermissions(user);
        const detailedPerms = effectivePermissions[`${moduleName}Permissions`];
        
        if (detailedPerms && typeof detailedPerms === 'object') {
            return Object.keys(detailedPerms).filter(key => detailedPerms[key] === true);
        }

        // ??? ?? ???? ??????? ???????? ???? ?????? ??????
        const moduleDetails = MODULE_DETAILED_PERMISSIONS[moduleName];
        if (moduleDetails && moduleDetails.permissions) {
            return moduleDetails.permissions.map(p => p.key);
        }

        return [];
    },





    /* Deprecated training helpers within Permissions
    openAnnualPlanItemForm(year, itemId = null, onSave = null) {
        const plan = this.getAnnualPlan(year, { createIfMissing: true });
        const item = plan.items.find(i => i.id === itemId) || null;
        const positions = this.getUniquePositions();
        // ? ?? ???????: ??????? ApprovedContractors ???
        const contractors = (typeof Contractors !== 'undefined' && typeof Contractors.getAllContractorsForModules === 'function')
            ? Contractors.getAllContractorsForModules().map(contractor => contractor.name || contractor.companyName).filter(Boolean)
            : (AppState.appData.approvedContractors || []).map(contractor => contractor.companyName || contractor.name).filter(Boolean);
        const topics = this.getAllTrainingTopics();
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-calendar-plus ml-2"></i>
                        ${item ? '????? ???? ?????' : '????? ???? ???? ?????'}
                    </h2>
                    <button class="modal-close" title="?????">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="annual-plan-item-form">
                    <div class="modal-body space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="plan-item-topic" class="block text-sm font-semibold text-gray-700 mb-2">??????? ???????? *</label>
                                <input type="text" id="plan-item-topic" class="form-input" required value="${Utils.escapeHTML(item?.topic || '')}" placeholder="????? ???????? ????????">
                            </div>
                            <div>
                                <label for="plan-item-date" class="block text-sm font-semibold text-gray-700 mb-2">??????? ?????? *</label>
                                <input type="date" id="plan-item-date" class="form-input" required value="${item?.plannedDate ? new Date(item.plannedDate).toISOString().slice(0, 10) : ''}">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label for="plan-item-target-type" class="block text-sm font-semibold text-gray-700 mb-2">????? ????????? *</label>
                                <select id="plan-item-target-type" class="form-input" required>
                                    <option value="employees" ${item?.targetType === 'employees' ? 'selected' : ''}>????????</option>
                                    <option value="contractors" ${item?.targetType === 'contractors' ? 'selected' : ''}>?????????</option>
                                    <option value="mixed" ${item?.targetType === 'mixed' ? 'selected' : ''}>????</option>
                                </select>
                            </div>
                            <div>
                                <label for="plan-item-status" class="block text-sm font-semibold text-gray-700 mb-2">??????</label>
                                <select id="plan-item-status" class="form-input">
                                    <option value="????" ${item?.status === '????' ? 'selected' : ''}>????</option>
                                    <option value="??? ???????" ${item?.status === '??? ???????' ? 'selected' : ''}>??? ???????</option>
                                    <option value="?????" ${item?.status === '?????' ? 'selected' : ''}>?????</option>
                                    <option value="????" ${item?.status === '????' ? 'selected' : ''}>????</option>
                                </select>
                            </div>
                            <div>
                                <label for="plan-item-year" class="block text-sm font-semibold text-gray-700 mb-2">?????</label>
                                <input type="text" id="plan-item-year" class="form-input" value="${year}" disabled>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="plan-item-roles" class="block text-sm font-semibold text-gray-700 mb-2">??????? ?????????</label>
                                <select id="plan-item-roles" class="form-input" multiple size="5">
                                    ${positions.map(position => `
                                        <option value="${Utils.escapeHTML(position)}" ${item?.targetRoles?.includes(position) ? 'selected' : ''}>${Utils.escapeHTML(position)}</option>
    
        
        modal.querySelector('#quick-training-form')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                const subject = modal.querySelector('#quick-training-subject')?.value.trim();
                const trainer = modal.querySelector('#quick-training-trainer')?.value.trim();
                const trainingType = modal.querySelector('#quick-training-type')?.value || '?????';
                const dateValue = modal.querySelector('#quick-training-date')?.value;
                const location = modal.querySelector('#quick-training-location')?.value.trim();
                const status = modal.querySelector('#quick-training-status')?.value || '?????';
                const startTime = modal.querySelector('#quick-training-start-time')?.value;
                const endTime = modal.querySelector('#quick-training-end-time')?.value;
                const hoursValue = parseFloat(modal.querySelector('#quick-training-hours')?.value || '0');
                const topicsSelected = this.getSelectedOptionsFromElement(modal.querySelector('#quick-training-topics'));
                
                if (!subject || !trainer || !dateValue) {
                    Notification.warning('???? ????? ???????? ???????? ???????');
                    return;
                }
                
                let computedHours = hoursValue;
                if ((!computedHours || computedHours <= 0) && startTime && endTime) {
                    const start = new Date(`2000-01-01T${startTime}:00`);
                    const end = new Date(`2000-01-01T${endTime}:00`);
                    const diffMs = end - start;
                    if (diffMs > 0) {
                        computedHours = diffMs / (1000 * 60 * 60);
                    }
                }
                
                const trainingId = Utils.generateId('TRAINING');
                const isoDate = new Date(dateValue).toISOString();
                
                const participantEntry = {
                    name: employee.name || '',
                    code: employee.employeeNumber || employee.sapId || '',
                    employeeNumber: employee.employeeNumber || employee.sapId || '',
                    employeeCode: employee.employeeNumber || employee.employeeCode || '',
                    department: employee.department || '',
                    position: employee.position || '',
                    workLocation: employee.location || employee.workLocation || '',
                    type: 'employee',
                    personType: 'employee',
                    topics: topicsSelected
                };
                
                const trainingRecord = {
                    id: trainingId,
                    name: subject,
                    trainer: trainer,
                    trainingType: trainingType,
                    location: location || '',
                    date: isoDate,
                    startDate: isoDate,
                    startTime: startTime || '',
                    endTime: endTime || '',
                    status: status,
                    hours: computedHours > 0 ? computedHours.toFixed(2) : '',
                    participants: [participantEntry],
                    participantsCount: 1,
                    topics: topicsSelected,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                AppState.appData.training.push(trainingRecord);
                this.syncEmployeeTrainingMatrix(trainingRecord);
                
                if (topicsSelected.length) {
                    const year = new Date(dateValue).getFullYear();
                    const plan = this.getAnnualPlan(year, { createIfMissing: false });
                    if (plan) {
                        const nowIso = new Date().toISOString();
                        topicsSelected.forEach(topicName => {
                            const planItem = plan.items.find(item => {
                                if (item.linkedTrainingId) return false;
                                const matchesTopic = item.topic === topicName || (Array.isArray(item.requiredTopics) && item.requiredTopics.includes(topicName));
                                if (!matchesTopic) return false;
                                if (Array.isArray(item.targetRoles) && item.targetRoles.length) {
                                    return item.targetRoles.includes(employee.position);
                                }
                                return item.targetType !== 'contractors';
                            });
                            if (planItem) {
                                planItem.linkedTrainingId = trainingId;
                                planItem.status = '?????';
                                planItem.updatedAt = nowIso;
                            }
                        });
                    }
                }
                
                const dm = (typeof window !== 'undefined' && window.DataManager) || 
                           (typeof DataManager !== 'undefined' && DataManager);
                if (dm && typeof dm.save === 'function') {
                    dm.save();
                }
                await Promise.allSettled([
                    Backend.autoSave?.('Training', AppState.appData.training),
                    Backend.autoSave?.('EmployeeTrainingMatrix', AppState.appData.employeeTrainingMatrix)
                ]);
                
                await this.refreshTrainingMatrix();
                this.loadTrainingList();
                Notification.success('?? ????? ??????? ?????');
                close();
            } catch (error) {
                Utils.safeError('??? ?? ????? ??????? ??????:', error);
                Notification.error('???? ????? ???????: ' + error.message);
            }
        });
    },
    
    
    
    
    showAnnualPlanModal(initialYear = new Date().getFullYear()) {
        this.ensureData();
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 1100px; max-height: 92vh; overflow-y: auto;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-calendar-check ml-2"></i>
                        ????? ????????? ???????
                    </h2>
                    <div class="flex items-center gap-2 mr-auto">
                        <button class="btn-icon btn-icon-secondary" id="annual-plan-prev-year" title="????? ???????">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                        <input type="number" id="annual-plan-year" class="form-input" style="width: 120px;" value="${initialYear}">
                        <button class="btn-icon btn-icon-secondary" id="annual-plan-next-year" title="????? ???????">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                    </div>
                    <button class="modal-close" title="?????">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body space-y-6" id="annual-plan-body"></div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" data-action="close">?????</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', close);
        modal.querySelector('[data-action="close"]')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
        
        const traineesInput = modal.querySelector('#contractor-training-trainees');
        const durationInput = modal.querySelector('#contractor-training-duration');
        const totalHoursInput = modal.querySelector('#contractor-training-hours');
        const recalculateTotalHours = () => {
            if (!traineesInput || !durationInput || !totalHoursInput) return;
            const trainees = parseInt(traineesInput.value || '0', 10);
            const duration = parseInt(durationInput.value || '0', 10);
            if (Number.isFinite(trainees) && trainees > 0 && Number.isFinite(duration) && duration > 0) {
                const computed = Number(((trainees * duration) / 60).toFixed(2));
                totalHoursInput.value = computed > 0 ? computed.toFixed(2) : '';
            } else {
                totalHoursInput.value = '';
            }
        };
        traineesInput?.addEventListener('input', () => {
            if (traineesInput.value && parseInt(traineesInput.value, 10) < 0) traineesInput.value = '';
            recalculateTotalHours();
        });
        durationInput?.addEventListener('input', () => {
            if (durationInput.value && parseInt(durationInput.value, 10) < 0) durationInput.value = '';
            recalculateTotalHours();
        });
        recalculateTotalHours();
        
        const yearInput = modal.querySelector('#annual-plan-year');
        const bodyContainer = modal.querySelector('#annual-plan-body');
        const render = async () => {
            const year = parseInt(yearInput.value, 10) || new Date().getFullYear();
            bodyContainer.innerHTML = this.renderAnnualPlanContent(year);
            this.bindAnnualPlanEvents(modal, year);
        };
        
        modal.querySelector('#annual-plan-prev-year')?.addEventListener('click', () => {
            yearInput.value = (parseInt(yearInput.value, 10) || initialYear) - 1;
            render();
        });
        modal.querySelector('#annual-plan-next-year')?.addEventListener('click', () => {
            yearInput.value = (parseInt(yearInput.value, 10) || initialYear) + 1;
            render();
        });
        yearInput?.addEventListener('change', render);
        
        render();
    },
    
    renderAnnualPlanContent(year) {
        const plan = this.getAnnualPlan(year, { createIfMissing: this.isCurrentUserAdmin() });
        if (!plan) {
            return `
                <div class="border border-dashed border-gray-300 rounded-lg p-6 text-center text-gray-500">
                    ?? ??? ????? ??? ??????? ????? ${year} ???.
                    ${this.isCurrentUserAdmin() ? '<div class="mt-3"><button class="btn-primary" id="create-annual-plan-btn"><i class="fas fa-plus ml-2"></i>????? ????? ????????? ?????</button></div>' : ''}
                </div>
            `;
        }
        
        const stats = this.getAnnualPlanStats(plan);
        
        return `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div class="flex flex-wrap gap-4 items-center justify-between">
                    <div>
                        <h3 class="text-lg font-semibold text-blue-900">??? ?????: ${year}</h3>
                        <p class="text-sm text-blue-700">?? ????? ????? ??????: ${Utils.escapeHTML(plan.createdBy?.name || '??? ?????')} ?? ${Utils.formatDate(plan.createdAt)}</p>
                    </div>
                    ${this.isCurrentUserAdmin() ? `
                        <div>
                            <button class="btn-primary" id="add-annual-plan-item-btn">
                                <i class="fas fa-plus ml-2"></i>
                                ????? ???? ?????
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="content-card h-full">
                    <p class="text-sm text-gray-500">?????? ???????</p>
                    <p class="text-2xl font-bold text-gray-900">${stats.total}</p>
                </div>
                <div class="content-card h-full">
                    <p class="text-sm text-gray-500">????? ??????</p>
                    <p class="text-2xl font-bold text-green-600">${stats.completed}</p>
                </div>
                <div class="content-card h-full">
                    <p class="text-sm text-gray-500">??? ???????</p>
                    <p class="text-2xl font-bold text-blue-600">${stats.inProgress}</p>
                </div>
                <div class="content-card h-full">
                    <p class="text-sm text-gray-500">?????</p>
                    <p class="text-2xl font-bold text-yellow-600">${stats.delayed}</p>
                </div>
            </div>
            
            <div class="content-card">
                <div class="card-header">
                    <h3 class="card-title">
                        <i class="fas fa-clipboard-list ml-2"></i>
                        ??? ??????? ????????? (${plan.items.length} ???)
                    </h3>
                </div>
                <div class="card-body">
                    ${plan.items.length ? this.renderAnnualPlanTable(plan, year) : `
                        <div class="text-center text-gray-500 py-8">
                            ?? ???? ????? ????? ??? ????? ???????.
                        </div>
                    `}
                </div>
            </div>
        `;
    },
    
    bindAnnualPlanEvents(modal, year) {
        const plan = this.getAnnualPlan(year, { createIfMissing: false });
        if (!plan) {
            modal.querySelector('#create-annual-plan-btn')?.addEventListener('click', () => {
                this.createAnnualPlan(year);
                modal.querySelector('#annual-plan-body').innerHTML = this.renderAnnualPlanContent(year);
                this.bindAnnualPlanEvents(modal, year);
            });
            return;
        }
        
        if (this.isCurrentUserAdmin()) {
            const rerender = () => {
                modal.querySelector('#annual-plan-body').innerHTML = this.renderAnnualPlanContent(year);
                this.bindAnnualPlanEvents(modal, year);
            };
            modal.querySelector('#add-annual-plan-item-btn')?.addEventListener('click', () => this.openAnnualPlanItemForm(year, null, rerender));
            modal.querySelectorAll('[data-action="delete-plan-item"]').forEach(button => {
                button.addEventListener('click', () => {
                    const itemId = button.getAttribute('data-item-id');
                    this.removeAnnualPlanItem(year, itemId);
                    rerender();
                });
            });
            modal.querySelectorAll('[data-action="edit-plan-item"]').forEach(button => {
                button.addEventListener('click', () => {
                    const itemId = button.getAttribute('data-item-id');
                    this.openAnnualPlanItemForm(year, itemId, rerender);
                });
            });
            modal.querySelectorAll('.plan-status-select').forEach(select => {
                select.addEventListener('change', (event) => {
                    const itemId = select.getAttribute('data-item-id');
                    this.updateAnnualPlanItemStatus(year, itemId, event.target.value);
                });
            });
            modal.querySelectorAll('.plan-training-link').forEach(select => {
                select.addEventListener('change', (event) => {
                    const itemId = select.getAttribute('data-item-id');
                    const trainingId = event.target.value;
                    this.linkTrainingToPlanItem(year, itemId, trainingId);
                    rerender();
                });
            });
        }
    },
    
    renderAnnualPlanTable(plan, year) {
        const trainings = AppState.appData.training || [];
        const trainingOptions = trainings
            .map(training => ({
                id: training.id,
                name: training.name || '???? ?????',
                date: training.startDate || training.date || ''
            }))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        
        const renderTargets = (item) => {
            const parts = [];
            if (item.targetType === 'employees') {
                parts.push('????????');
            } else if (item.targetType === 'contractors') {
                parts.push('?????????');
            } else {
                parts.push('???????? ??????????');
            }
            if (Array.isArray(item.targetRoles) && item.targetRoles.length) {
                parts.push(`???????: ${item.targetRoles.map(r => Utils.escapeHTML(r)).join(', ')}`);
            }
            if (Array.isArray(item.targetContractors) && item.targetContractors.length) {
                parts.push(`?????????: ${item.targetContractors.map(c => Utils.escapeHTML(c)).join(', ')}`);
            }
            return parts.join(' — ');
        };
        
        const statusOptions = ['????', '??? ???????', '?????', '????'];
        
        return `
            <div class="overflow-x-auto">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>???????</th>
                            <th>??????? ??????</th>
                            <th>????? ?????????</th>
                            <th>??????</th>
                            <th>??? ???????</th>
                            <th>???????</th>
                            ${this.isCurrentUserAdmin() ? '<th>?????????</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${plan.items.sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || '')).map(item => `
                            <tr>
                                <td>
                                    <div class="font-semibold text-gray-900">${Utils.escapeHTML(item.topic || '')}</div>
                                    ${item.requiredTopics && item.requiredTopics.length ? `
                                        <div class="text-xs text-blue-600 mt-1">???????: ${item.requiredTopics.map(topic => Utils.escapeHTML(topic)).join(', ')}</div>
                                    ` : ''}
                                </td>
                                <td>${item.plannedDate ? Utils.formatDate(item.plannedDate) : '—'}</td>
                                <td>${renderTargets(item)}</td>
                                <td>
                                    ${this.isCurrentUserAdmin() ? `
                                        <select class="form-input plan-status-select" data-item-id="${item.id}">
                                            ${statusOptions.map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${status}</option>`).join('')}
                                        </select>
                                    ` : `
                                        <span class="badge ${
                                            item.status === '?????' ? 'badge-success' :
                                            item.status === '??? ???????' ? 'badge-info' :
                                            item.status === '????' ? 'badge-warning' : 'badge-secondary'
                                        }">${Utils.escapeHTML(item.status || '????')}</span>
                                    `}
                                </td>
                                <td>
                                    ${this.isCurrentUserAdmin() ? `
                                        <select class="form-input plan-training-link" data-item-id="${item.id}">
                                            <option value="">—</option>
                                            ${trainingOptions.map(option => `
                                                <option value="${option.id}" ${option.id === item.linkedTrainingId ? 'selected' : ''}>
                                                    ${Utils.escapeHTML(option.name)} (${option.date ? Utils.formatDate(option.date) : '???? ?????'})
                                                </option>
                                            `).join('')}
                                        </select>
                                    ` : `
                                        ${item.linkedTrainingId ? `<span class="text-sm text-blue-600">????? ???? ?????</span>` : '<span class="text-xs text-gray-400">??? ?????</span>'}
                                    `}
                                </td>
                                <td>${Utils.escapeHTML(item.notes || '')}</td>
                                ${this.isCurrentUserAdmin() ? `
                                    <td>
                                        <div class="flex items-center gap-2">
                                            <button class="btn-icon btn-icon-primary" data-action="edit-plan-item" data-item-id="${item.id}" title="????? ??????">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn-icon btn-icon-danger" data-action="delete-plan-item" data-item-id="${item.id}" title="??? ??????">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    openAnnualPlanItemForm(year, itemId = null, onSave = null) {
        const plan = this.getAnnualPlan(year, { createIfMissing: true });
        const item = plan.items.find(i => i.id === itemId) || null;
        const positions = this.getUniquePositions();
        // ? ?? ???????: ??????? ApprovedContractors ???
        const contractors = (typeof Contractors !== 'undefined' && typeof Contractors.getAllContractorsForModules === 'function')
            ? Contractors.getAllContractorsForModules().map(contractor => contractor.name || contractor.companyName).filter(Boolean)
            : (AppState.appData.approvedContractors || []).map(contractor => contractor.companyName || contractor.name).filter(Boolean);
        const topics = this.getAllTrainingTopics();
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h2 class="modal-title">
                        <i class="fas fa-calendar-plus ml-2"></i>
                        ${item ? '????? ???? ?????' : '????? ???? ???? ?????'}
                    </h2>
                    <button class="modal-close" title="?????">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <form id="annual-plan-item-form">
                    <div class="modal-body space-y-5">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="plan-item-topic" class="block text-sm font-semibold text-gray-700 mb-2">??????? ???????? *</label>
                                <input type="text" id="plan-item-topic" class="form-input" required value="${Utils.escapeHTML(item?.topic || '')}" placeholder="????? ???????? ????????">
                            </div>
                            <div>
                                <label for="plan-item-date" class="block text-sm font-semibold text-gray-700 mb-2">??????? ?????? *</label>
                                <input type="date" id="plan-item-date" class="form-input" required value="${item?.plannedDate ? new Date(item.plannedDate).toISOString().slice(0, 10) : ''}">
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label for="plan-item-target-type" class="block text-sm font-semibold text-gray-700 mb-2">????? ????????? *</label>
                                <select id="plan-item-target-type" class="form-input" required>
                                    <option value="employees" ${item?.targetType === 'employees' ? 'selected' : ''}>????????</option>
                                    <option value="contractors" ${item?.targetType === 'contractors' ? 'selected' : ''}>?????????</option>
                                    <option value="mixed" ${item?.targetType === 'mixed' ? 'selected' : ''}>????</option>
                                </select>
                            </div>
                            <div>
                                <label for="plan-item-status" class="block text-sm font-semibold text-gray-700 mb-2">??????</label>
                                <select id="plan-item-status" class="form-input">
                                    <option value="????" ${item?.status === '????' ? 'selected' : ''}>????</option>
                                    <option value="??? ???????" ${item?.status === '??? ???????' ? 'selected' : ''}>??? ???????</option>
                                    <option value="?????" ${item?.status === '?????' ? 'selected' : ''}>?????</option>
                                    <option value="????" ${item?.status === '????' ? 'selected' : ''}>????</option>
                                </select>
                            </div>
                            <div>
                                <label for="plan-item-year" class="block text-sm font-semibold text-gray-700 mb-2">?????</label>
                                <input type="text" id="plan-item-year" class="form-input" value="${year}" disabled>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label for="plan-item-roles" class="block text-sm font-semibold text-gray-700 mb-2">??????? ?????????</label>
                                <select id="plan-item-roles" class="form-input" multiple size="5">
                                    ${positions.map(position => `
                                        <option value="${Utils.escapeHTML(position)}" ${item?.targetRoles?.includes(position) ? 'selected' : ''}>${Utils.escapeHTML(position)}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div>
                                <label for="plan-item-contractors" class="block text-sm font-semibold text-gray-700 mb-2">????????? ??????????</label>
                                <select id="plan-item-contractors" class="form-input" multiple size="5">
                                    ${contractors.map(name => `
                                        <option value="${Utils.escapeHTML(name)}" ${item?.targetContractors?.includes(name) ? 'selected' : ''}>${Utils.escapeHTML(name)}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label for="plan-item-topics" class="block text-sm font-semibold text-gray-700 mb-2">????????? ???????? (???????)</label>
                            <select id="plan-item-topics" class="form-input" multiple size="5">
                                ${topics.map(topic => `
                                    <option value="${Utils.escapeHTML(topic)}" ${item?.requiredTopics?.includes(topic) ? 'selected' : ''}>${Utils.escapeHTML(topic)}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div>
                            <label for="plan-item-notes" class="block text-sm font-semibold text-gray-700 mb-2">???????</label>
                            <textarea id="plan-item-notes" class="form-input" rows="3" placeholder="?????? ?????? ?? ????? ????????">${Utils.escapeHTML(item?.notes || '')}</textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" data-action="close">?????</button>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-save ml-2"></i>
                            ${item ? '??? ?????????' : '????? ?????'}
                        </button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', close);
        modal.querySelector('[data-action="close"]')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
        
        modal.querySelector('#annual-plan-item-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const topic = modal.querySelector('#plan-item-topic')?.value.trim();
            const plannedDate = modal.querySelector('#plan-item-date')?.value;
            const targetType = modal.querySelector('#plan-item-target-type')?.value || 'employees';
            const status = modal.querySelector('#plan-item-status')?.value || '????';
            const targetRoles = this.getSelectedOptionsFromElement(modal.querySelector('#plan-item-roles'));
            const targetContractors = this.getSelectedOptionsFromElement(modal.querySelector('#plan-item-contractors'));
            const requiredTopics = this.getSelectedOptionsFromElement(modal.querySelector('#plan-item-topics'));
            const notes = modal.querySelector('#plan-item-notes')?.value.trim();
            
            if (!topic || !plannedDate) {
                Notification.warning('???? ????? ??????? ???????? ??????');
                return;
            }
            
            const entry = {
                id: item?.id || Utils.generateId('PLANITEM'),
                topic,
                plannedDate: new Date(plannedDate).toISOString(),
                targetType,
                status,
                targetRoles,
                targetContractors,
                requiredTopics,
                notes,
                linkedTrainingId: item?.linkedTrainingId || '',
                createdAt: item?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            this.upsertAnnualPlanItem(year, entry);
            Notification.success(item ? '?? ????? ?????? ?????' : '?? ????? ?????? ??? ?????');
            close();
            if (typeof onSave === 'function') {
                onSave();
            }
        });
    },
    
    isCurrentUserAdmin() {
        return this.isCurrentUserEffectiveAdmin();
    },
    
    getAnnualPlan(year, { createIfMissing = false } = {}) {
        this.ensureData();
        if (!Array.isArray(AppState.appData.annualTrainingPlans)) {
            AppState.appData.annualTrainingPlans = [];
        }
        let plan = AppState.appData.annualTrainingPlans.find(p => p.year === year);
        if (!plan && createIfMissing && this.isCurrentUserAdmin()) {
            plan = this.createAnnualPlan(year);
        }
        return plan || null;
    },
    
    createAnnualPlan(year) {
        const plan = {
            id: `PLAN-${year}`,
            year,
            createdBy: {
                id: AppState.currentUser?.id || '',
                name: AppState.currentUser?.name || AppState.currentUser?.displayName || AppState.currentUser?.email || '????? ??????',
                email: AppState.currentUser?.email || ''
            },
            createdAt: new Date().toISOString(),
            items: []
        };
        AppState.appData.annualTrainingPlans.push(plan);
        const dm = (typeof window !== 'undefined' && window.DataManager) || 
                   (typeof DataManager !== 'undefined' && DataManager);
        if (dm && typeof dm.save === 'function') {
            dm.save();
        }
        Notification.success(`?? ????? ????? ????????? ????? ${year}`);
        return plan;
    },
    
    upsertAnnualPlanItem(year, entry) {
        const plan = this.getAnnualPlan(year, { createIfMissing: true });
        const index = plan.items.findIndex(i => i.id === entry.id);
        if (index >= 0) {
            plan.items[index] = entry;
        } else {
            plan.items.push(entry);
        }
        plan.updatedAt = new Date().toISOString();
        const dm = (typeof window !== 'undefined' && window.DataManager) || 
                   (typeof DataManager !== 'undefined' && DataManager);
        if (dm && typeof dm.save === 'function') {
            dm.save();
        }
    },
    
    getAnnualPlanStats(plan) {
        const stats = {
            total: plan.items.length,
            completed: plan.items.filter(item => item.status === '?????').length,
            inProgress: plan.items.filter(item => item.status === '??? ???????').length,
            delayed: plan.items.filter(item => item.status === '????').length
        };
        return stats;
    },
    
    updateAnnualPlanItemStatus(year, itemId, status) {
        const plan = this.getAnnualPlan(year, { createIfMissing: false });
        if (!plan) return;
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;
        item.status = status;
        item.updatedAt = new Date().toISOString();
        const dm = (typeof window !== 'undefined' && window.DataManager) || 
                   (typeof DataManager !== 'undefined' && DataManager);
        if (dm && typeof dm.save === 'function') {
            dm.save();
        }
        Notification.success('?? ????? ???? ??????');
    },
    
    linkTrainingToPlanItem(year, itemId, trainingId) {
        const plan = this.getAnnualPlan(year, { createIfMissing: false });
        if (!plan) return;
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;
        item.linkedTrainingId = trainingId || '';
        if (trainingId) {
            item.status = '?????';
        }
        item.updatedAt = new Date().toISOString();
        const dm = (typeof window !== 'undefined' && window.DataManager) || 
                   (typeof DataManager !== 'undefined' && DataManager);
        if (dm && typeof dm.save === 'function') {
            dm.save();
        }
        Notification.success('?? ????? ??? ?????? ???? ???????');
    },
    
    removeAnnualPlanItem(year, itemId) {
        const plan = this.getAnnualPlan(year, { createIfMissing: false });
        if (!plan) return;
        plan.items = plan.items.filter(item => item.id !== itemId);
        plan.updatedAt = new Date().toISOString();
        const dm = (typeof window !== 'undefined' && window.DataManager) || 
                   (typeof DataManager !== 'undefined' && DataManager);
        if (dm && typeof dm.save === 'function') {
            dm.save();
        }
        Notification.success('?? ??? ???? ????? ?????????');
    },
    */

    /**
     * ?????? ??? ????? ??????? ??????? ???????? ??????
     */
    getAccessibleModules(includeDefault = false) {
        const user = AppState.currentUser;
        if (!user) return [];
        if (this.isAdminRole(user.role)) return ['*'];

        // ?? ??? ????? dashboard ???????? - ??? ??? ???????? ?????? ?? ??? ??????
        const modules = new Set();
        const effectivePermissions = this.getEffectivePermissions(user);

        // ????? ??? ????????? ???????? ?????? ?? ??? ???? ??????
        Object.entries(effectivePermissions).forEach(([module, allowed]) => {
            if (allowed === true) {
                modules.add(module);
            }
        });

        // ?? ??? ??????? ????????? ?????????? - ??? ????? ?? ??? ?????? ???
        // (?? ???????? ???????? includeDefault ??????? ?? ????? ??????? ???? ?? ????)

        return Array.from(modules);
    },

    /**
     * ?????/????? ????? ??????? ??? ?????????
     */
    updateNavigation() {
        // ? ?????: ?????? ?? ???? ???????? ??????
        if (!AppState.currentUser) {
            Utils.safeWarn('?? ?? ???? ?????? ???? ???? - ?? ???? ????? ???????');
            return;
        }

        if (typeof Utils !== 'undefined' && typeof Utils.canonicalizeUserRole === 'function') {
            AppState.currentUser.role = Utils.canonicalizeUserRole(AppState.currentUser.role);
        }

        const navItems = document.querySelectorAll('.nav-item');
        if (navItems.length === 0) {
            // ??? ?? ??? ????? ??????? ?????? ???? ???? ???????? ??? ????
            setTimeout(() => {
                if (document.querySelectorAll('.nav-item').length > 0) {
                    this.updateNavigation();
                }
            }, 500);
            return;
        }

        navItems.forEach(item => {
            const module = item.getAttribute('data-section');
            if (module) {
                const hasAccess = this.hasAccess(module);
                if (!hasAccess) {
                    item.style.display = 'none';
                    item.setAttribute('data-permission-hidden', 'true');
                } else {
                    item.style.display = '';
                    item.setAttribute('data-permission-hidden', 'false');
                }
            }
        });

        // ??? ??? ?? ??? ?????? ??? ?? ???????? ???? — ??? ??????? (???? ????? ?? role ??? ?????)
        let visibleCount = Array.from(navItems).filter(item => item.style.display !== 'none').length;
        if (visibleCount === 0 && this.isAdminRole(AppState.currentUser.role)) {
            navItems.forEach(item => {
                if (item.getAttribute('data-section')) {
                    item.style.display = '';
                    item.setAttribute('data-permission-hidden', 'false');
                }
            });
            visibleCount = Array.from(navItems).filter(item => item.style.display !== 'none').length;
        }

        // ? ?????: ????? ???????? ?? ???????
        if (AppState.debugMode) {
            Utils.safeLog(`? ?? ????? ???????: ${visibleCount} ???? ???? ?? ${navItems.length} ????`);
        }

        // ????? ????? ????? ????? ???? ?????? ??? ????? ????????? (??????/????)
        if (typeof Dashboard !== 'undefined' && typeof Dashboard.applyDashboardLayoutPermissions === 'function') {
            try {
                Dashboard.applyDashboardLayoutPermissions();
            } catch (dashPermErr) {
                if (typeof Utils !== 'undefined' && Utils.safeWarn) {
                    Utils.safeWarn('?? ???? ????? ??????? ????? ???? ??????:', dashPermErr);
                }
            }
        }
    },

    /**
     * ?????? ?? ????????? ??? ??? ?????
     * @param {string} moduleName - ??? ????????
     * @param {boolean} suppressMessage - ??? ??? true? ?? ??? ??? ????? ????? (???? ??? ?????? ??????)
     * @returns {boolean} - true ??? ??? ???? ??????? false ??? ?? ??? ???? ??????
     */
    checkBeforeShow(moduleName, suppressMessage = false) {
        if (!this.hasAccess(moduleName)) {
            const errorMessage = '??? ???? ?????? ?????? ??? ??? ?????';

            // ??? ??????? ??? ??? ?? ??? suppressMessage = true (?? ??? ?????? ?????? ???????)
            if (!suppressMessage) {
                // ?????? ??? ??????? ??? Notification.error
                try {
                    if (typeof Notification !== 'undefined' && typeof Notification.error === 'function') {
                        Notification.error(errorMessage);
                    } else {
                        // ?? ???? ??? ???? Notification? ?????? console.error ? alert ?????
                        console.error('?? ' + errorMessage);
                        alert(errorMessage);
                    }
                } catch (error) {
                    // ?? ???? ??? Notification.error? ?????? console.error ? alert ?????
                    console.error('?? ' + errorMessage);
                    alert(errorMessage);
                }
            }

            return false;
        }
        return true;
    },

    /**
     * ?????? ??? ????? ??? ???????? ????????
     */
    getRoleLabel(role) {
        const labels = {
            'admin': '???? ??????',
            'safety_officer': '????? ???????',
            'user': '??????'
        };
        return labels[role] || role;
    },

    /**
     * ?????? ?? ?? ???????? ?????? ?? ???? ??????
     */
    isAdmin() {
        return this.isCurrentUserEffectiveAdmin();
    }
};

// ===== Global State =====
const DEFAULT_COMPANY_NAME = '';

const AppState = {
    /** fallback ??? — ?????? ??????: frontend/version.json (??????? ??? saas-version.js) */
    appVersion: '2.2.169',
    /** ?? ??????? ?????? ??????? (???? ?????????). ?? ????? ????? ??????? ???? ?????????. */
    updateMessage: '',
    debugMode: false,
    currentUser: null,
    currentSection: 'dashboard',
    currentLanguage: 'ar',
    navigationHistory: [], // ??? ?????? ??? ???????
    isPageRefresh: false, // ????? ????? ?? ????? ????? ??????
    isNavigatingBack: false, // ????? ????? ?? ?????? ?????
    runningWithoutBackend: false, // true ??? ??? ????? ?????? (file://) ???? ???
    _noBackendWarningLogged: false, // ?????? ????? "???? ????" ??? ????? ???
    appData: {
        users: [],
        incidents: [],
        nearmiss: [],
        ptw: [],
        ptwRegistry: [],
        training: [],
        clinicVisits: [],
        medications: [],
        sickLeave: [],
        injuries: [],
        clinicInventory: [],
        fireEquipment: [],
        fireEquipmentAssets: [],
        fireEquipmentInspections: [],
        periodicInspectionCategories: [],
        periodicInspectionRecords: [],
        periodicInspectionSchedules: [],
        periodicInspectionChecklists: [],
        ppe: [],
        violations: [],
        violationTypes: [],
        contractors: [],
        approvedContractors: [],
        contractorEvaluations: [],
        contractorEvaluationCriteria: [],
        contractorApprovalRequests: [],
        employees: [],
        behaviorMonitoring: [],
        contractorBehaviorMonitoring: [],
        chemicalSafety: [],
        dailyObservations: [],
        observationSites: [],
        isoDocuments: [],
        isoProcedures: [],
        isoForms: [],
        emergencyAlerts: [],
        safetyCalendarEvents: [],
        emergencyPlans: [],
        emergencyPlansUpdates: [],
        riskAssessments: [],
        sopJHA: [],
        legalDocuments: [], // ????????? ????????? ??????????
        legalInventory: [], // ??? ??? ????????? ?????????
        hseAudits: [], // ?????? ??????? ?????????
        hseNonConformities: [], // ??? ????????
        hseCorrectiveActions: [], // ????????? ?????????
        hseObjectives: [], // ???? HSE
        hseRiskAssessments: [], // ??????? ??????? HSE
        environmentalAspects: [], // ??????? ???????
        environmentalMonitoring: [], // ???????? ???????
        sustainability: [], // ????????? ???????
        carbonFootprint: [], // ?????? ?????????
        wasteManagement: [], // ????? ???????
        energyEfficiency: [], // ???? ??????
        waterManagement: [], // ????? ??????
        /** ????? ??????? ??????/????????/????? — ??????? ????? ?? ????? *_Records ??? ???????? */
        resourceConsumption: {
            water: [],
            electricity: [],
            gas: []
        },
        recyclingPrograms: [], // ????? ????? ???????
        safetyTeamMembers: [], // ????? ???? ???????
        safetyOrganizationalStructure: [], // ?????? ??????? ????? ???????
        safetyJobDescriptions: [], // ????? ??????? ????? ???????
        safetyTeamKPIs: [], // ?????? ???? ???? ???????
        safetyTeamAttendance: [], // ???? ???? ???????
        safetyTeamLeaves: [], // ?????? ???? ???????
        safetyTeamTasks: [], // ???? ???? ???????
        safetyPerformanceKPIs: [], // ?????? ?????? ???????
        employeeTrainingMatrix: {}, // ?????? ??????? ??? ????
        trainingTopicsByRole: {}, // ??????? ??????? ???????? ??? ???????
        annualTrainingPlans: [], // ????? ????????? ???????
        employeePPEMatrix: {}, // ???? ????? ??????? ??? ???? ??? ???????
        employeePPEMatrixByCode: {}, // ?????? ????? ??????? ??? ???? ?????? ?????? ??????
        actionTrackingRegister: [], // ??? ?????? ?????????
        orgSites: [], // ??????? ????????? (Company ? Site)
        orgDepartments: [], // ??????? ??? ??????
        notificationPrefs: [], // ??????? ??????? ????????
        complianceChecklists: [], // ????? ???? ?????? (ISO 45001 ?????)
        webhookEndpoints: [], // Webhooks ????? (enterprise stub)
        companySettings: [], // ??????? ?????? / onboarding
        safetyBudgets: [], // ??????? ????????? ????????
        safetyBudgetTransactions: [], // ?????? ????? ??????? ???????
        workflows: [], // ??? ????? ??????????
        incidentWorkflows: [], // ?????? ??? ???????
        auditLog: [], // ??? ?????? ?????? (Audit Log)
        user_activity_log: [], // ??? ????? ?????????? (User Activity Log)
        systemStatistics: {
            totalLogins: 0 // ?????? ??? ??????? ?????? ??????
        }
    },
    syncMeta: {
        users: 0,
        // ? ?????: ???? ???? ????? ?? ????
        sheets: {}, // { sheetName: timestamp }
        lastSyncTime: 0, // ??? ??? ?? ???? ??????? ??????
        userEmail: null // ?????? ?????????? ???????? ??????
    },
    /** ??????? ??????? (Google Maps API — ??????? ?? PTW ?????) */
    backendConfig: {
        maps: {
            enabled: false,
            apiKey: ''
        }
    },
    cloudStorageConfig: {
        onedrive: {
            enabled: false,
            clientId: '',
            clientSecret: '',
            accessToken: '',
            refreshToken: '',
            tokenExpiry: null,
            tenantId: '' // ????????
        },
        googleDrive: {
            enabled: false,
            clientId: '',
            clientSecret: '',
            accessToken: '',
            refreshToken: '',
            tokenExpiry: null,
            apiKey: ''
        },
        sharepoint: {
            enabled: false,
            clientId: '',
            clientSecret: '',
            accessToken: '',
            refreshToken: '',
            tokenExpiry: null,
            siteUrl: '',
            tenantId: ''
        }
    },
    companyLogo: '',
    companySettings: {
        name: DEFAULT_COMPANY_NAME,
        secondaryName: '',
        address: '',
        phone: '',
        email: '',
        approvalCircuits: {},
        formDepartments: [],
        safetyTeam: []
    },
    dateFormat: 'gregorian', // 'gregorian' or 'hijri'
    notificationEmails: [], // ????? ????????? ?????????
    emergencyChannels: ['SMS', 'Email', '??????? ???????', '??????? ????????'],
    emergencyTeams: ['???? ???????', '???? ?????? ??????', '???? ????????? ???????', '???? ?????'],
    legalPortalUrl: '', // ???? ????? ?????????
    legalKeywords: [], // ????? ??????? ???????? ?????????
    legalAutoNotify: false // ????? ????????? ????????? ????????? ?????????
};

(function applyMapsConfigFromStorage() {
    try {
        if (typeof localStorage === 'undefined' || !AppState.backendConfig) return;
        localStorage.removeItem('hse_google_config');
        const raw = localStorage.getItem('hse_backend_config');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.maps && typeof parsed.maps === 'object') {
            AppState.backendConfig.maps = { ...AppState.backendConfig.maps, ...parsed.maps };
        }
        localStorage.setItem('hse_backend_config', JSON.stringify({ maps: AppState.backendConfig.maps || {} }));
    } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }
})();

// ===== Utility Functions =====
const Utils = {
    /**
     * ????? ??? ????? ?????? (admin ???? ??? ????? ?????? ???????? ?? ??????)
     */
    canonicalizeUserRole(role) {
        const r = role == null || role === '' ? 'user' : String(role).trim();
        if (typeof Permissions !== 'undefined' && typeof Permissions.isAdminRole === 'function' && Permissions.isAdminRole(r)) {
            return 'admin';
        }
        return r || 'user';
    },

    /**
     * ?? ???? ???? ?????? ??? ?????? ??????? (????? + ???? Web App /exec)
     */
    hasCloudBackendSync() {
        return !!(typeof window !== 'undefined' && window.SAAS_CONFIG && window.SAAS_CONFIG.useSupabaseBackend && window.SaaSAdapter);
    },

    /**
     * ?????? ?? ???? ???????
     */
    isProduction() {
        if (typeof window === 'undefined') return true;
        const hostname = window.location.hostname;
        return hostname !== 'localhost' &&
            !hostname.includes('127.0.0.1') &&
            !hostname.includes('192.168.') &&
            !hostname.includes('10.') &&
            hostname !== '';
    },

    /**
     * ????? ??? - ?? ???? ?? ???????
     */
    safeLog(...args) {
        if (!Utils.isProduction()) {
            console.log(...args);
        }
    },

    /**
     * ????? ????? ??? - ?? ???? ??????? ????? ?? ???????
     */
    safeError(...args) {
        // ????? ????? Chrome extensions ? source maps
        if (args.length > 0) {
            // ??? ???? ?????? ?? ???? ????????? ?????? ??????
            let allArgsText = '';
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                if (typeof arg === 'string') {
                    allArgsText += arg + ' ';
                } else if (arg && typeof arg === 'object') {
                    // ?????? ?? message ? stack ? toString
                    if (arg.message) allArgsText += String(arg.message) + ' ';
                    if (arg.stack) allArgsText += String(arg.stack) + ' ';
                    if (arg.toString) allArgsText += String(arg.toString()) + ' ';
                }
            }
            allArgsText = allArgsText.toLowerCase();

            const firstArg = args[0];
            const firstArgStr = String(firstArg || '').toLowerCase();

            // ????? ??????? ???? ??? ???????
            const shouldIgnore =
                firstArgStr.includes('runtime.lasterror') ||
                firstArgStr.includes('message port closed') ||
                firstArgStr.includes('receiving end does not exist') ||
                firstArgStr.includes('could not establish connection') ||
                firstArgStr.includes('.map') ||
                firstArgStr.includes('sourcemap') ||
                firstArgStr.includes('content security policy') ||
                firstArgStr.includes('frame-ancestors') ||
                firstArgStr.includes('translator') ||
                firstArgStr.includes('uploadmanager') ||
                firstArgStr.includes('upload-manager') ||
                (firstArgStr.includes('cannot read properties of undefined') && firstArgStr.includes('document')) ||
                allArgsText.includes('uploadmanager') ||
                allArgsText.includes('upload-manager') ||
                (allArgsText.includes('cannot read properties of undefined') && allArgsText.includes('document')) ||
                allArgsText.includes('uploadmanager.js') ||
                firstArgStr.includes('???? google sheets ??? ????') ||
                firstArgStr.includes('google sheets id') ||
                firstArgStr.includes('spreadsheet id') ||
                firstArgStr.includes('sendrequest (savetosheet)') ||
                firstArgStr.includes('sendrequest (appendtosheet)') ||
                firstArgStr.includes('sendrequest (readfromsheet)') ||
                firstArgStr.includes('sendrequest (batchreadsheets)') ||
                firstArgStr.includes('? ??? batch') ||
                (firstArgStr.includes('??? ?? ?????? ??? ????????') && (allArgsText.includes('notallowederror') || allArgsText.includes('permission denied'))) ||
                (firstArgStr.includes('??? ?? ?????? ??? ????????') && allArgsText.includes('permissions policy violation'));

            if (typeof firstArg === 'string' && shouldIgnore) {
                return; // ????? ??? ???????
            }

            if (firstArg && typeof firstArg === 'object') {
                const msg = String(firstArg.message || firstArg.toString() || '').toLowerCase();
                const stack = String(firstArg.stack || '').toLowerCase();
                const combined = msg + ' ' + stack;

                if (combined.includes('runtime.lasterror') ||
                    combined.includes('message port closed') ||
                    combined.includes('receiving end does not exist') ||
                    combined.includes('could not establish connection') ||
                    combined.includes('.map') ||
                    combined.includes('sourcemap') ||
                    combined.includes('frame-ancestors') ||
                    combined.includes('translator') ||
                    combined.includes('uploadmanager') ||
                    combined.includes('upload-manager') ||
                    (combined.includes('cannot read properties of undefined') && combined.includes('document')) ||
                    combined.includes('uploadmanager.js') ||
                    combined.includes('???? google sheets ??? ????') ||
                    combined.includes('google sheets id') ||
                    combined.includes('spreadsheet id')) {
                    return; // ????? ??? ???????
                }
            }
        }

        // ??? ????? ???? ??? ????? - ?????? ?? ???? ?????????
        let allText = '';
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            if (typeof arg === 'string') {
                allText += arg + ' ';
            } else if (arg && typeof arg === 'object') {
                if (arg.message) allText += String(arg.message) + ' ';
                if (arg.stack) allText += String(arg.stack) + ' ';
                if (arg.toString) allText += String(arg.toString()) + ' ';
            }
        }
        allText = allText.toLowerCase();

        // ????? ????? uploadmanager ? document errors
        if (allText.includes('uploadmanager') ||
            allText.includes('upload-manager') ||
            allText.includes('uploadmanager.js') ||
            (allText.includes('cannot read properties of undefined') && allText.includes('document'))) {
            return; // ????? ??? ??????? ??????
        }

        // ????? ????? "Failed to fetch" ???????? ?? Google Sheets ????? ???? ??? ??????
        if (allText.includes('??? ?? ??? google sheets') &&
            (allText.includes('failed to fetch') || allText.includes('networkerror'))) {
            // ?????? ?? ???? Google Sheets
            const isGoogleAppsScriptEnabled = window.Utils.hasCloudBackendSync();
            if (!isGoogleAppsScriptEnabled) {
                return; // ????? ????? ??? ???? Google Sheets ??? ??????
            }
        }

        // ????? ????? ???????? ???????? ??????????
        if (allText.includes('??? ?? ?????? ??? ????????') &&
            (allText.includes('notallowederror') ||
                allText.includes('permission denied') ||
                allText.includes('permissions policy violation'))) {
            return; // ????? ????? ??????? ????????
        }

        if (!Utils.isProduction()) {
            console.error(...args);
        } else {
            // ?? ???????? ???? ??? ????? ???? ???? ??????
            const safeArgs = args.map(arg => {
                if (typeof arg === 'string') {
                    // ????? ?? ??????? ????? ??????
                    return arg.replace(/password|token|key|secret|hash/gi, '[REDACTED]');
                }
                if (arg && typeof arg === 'object') {
                    // ?????? ??????? ??????? ????? ?? ??????
                    if (arg instanceof Error) {
                        return {
                            name: arg.name,
                            message: String(arg.message || '').replace(/password|token|key|secret|hash/gi, '[REDACTED]'),
                            stack: arg.stack ? String(arg.stack).split('\n').slice(0, 3).join('\n') : undefined
                        };
                    }
                    if (arg.message) {
                        return {
                            message: String(arg.message).replace(/password|token|key|secret|hash/gi, '[REDACTED]'),
                            ...(arg.code ? { code: arg.code } : {}),
                            ...(arg.status ? { status: arg.status } : {}),
                            ...(arg.statusText ? { statusText: arg.statusText } : {})
                        };
                    }
                    // ?????? ????? ?????? ??? JSON ?? ?????? ???????
                    try {
                        const jsonStr = JSON.stringify(arg, null, 2);
                        if (jsonStr.length > 500) {
                            return JSON.parse(jsonStr.substring(0, 500) + '...');
                        }
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        return String(arg).replace(/password|token|key|secret|hash/gi, '[REDACTED]');
                    }
                }
                return String(arg || '[Object]');
            });
            // ????? ????? Chrome Extensions - ???? ???? ?? ???? ?????????
            for (let i = 0; i < safeArgs.length; i++) {
                const argStr = String(safeArgs[i] || '').toLowerCase();
                if (argStr.includes('runtime.lasterror') ||
                    argStr.includes('message port closed') ||
                    argStr.includes('receiving end does not exist') ||
                    argStr.includes('could not establish connection') ||
                    argStr.includes('extension context invalidated') ||
                    argStr.includes('the message port closed') ||
                    argStr.includes('uploadmanager') ||
                    argStr.includes('upload-manager') ||
                    argStr.includes('uploadmanager.js') ||
                    (argStr.includes('cannot read properties of undefined') && argStr.includes('document'))) {
                    return; // ????? ??? ??????? ??????
                }
                // ???? ?? ???????? ?????
                if (safeArgs[i] && typeof safeArgs[i] === 'object') {
                    try {
                        const objStr = JSON.stringify(safeArgs[i]).toLowerCase();
                        if (objStr.includes('runtime.lasterror') ||
                            objStr.includes('message port closed') ||
                            objStr.includes('receiving end does not exist') ||
                            objStr.includes('could not establish connection') ||
                            objStr.includes('uploadmanager') ||
                            objStr.includes('upload-manager') ||
                            objStr.includes('uploadmanager.js') ||
                            (objStr.includes('cannot read properties of undefined') && objStr.includes('document'))) {
                            return; // ????? ??? ??????? ??????
                        }
                    } catch (e) {
                        // ??? ??? JSON.stringify? ????? ?? message ? stack ??????
                        if (safeArgs[i].message) {
                            const msg = String(safeArgs[i].message).toLowerCase();
                            if (msg.includes('uploadmanager') ||
                                msg.includes('upload-manager') ||
                                (msg.includes('cannot read properties of undefined') && msg.includes('document')) ||
                                (msg.includes('htmlstyleelement') && msg.includes('document'))) {
                                return;
                            }
                        }
                        if (safeArgs[i].stack) {
                            const stack = String(safeArgs[i].stack).toLowerCase();
                            if (stack.includes('uploadmanager') ||
                                stack.includes('upload-manager') ||
                                stack.includes('uploadmanager.js') ||
                                (stack.includes('htmlstyleelement') && stack.includes('document'))) {
                                return;
                            }
                        }
                    }
                }
            }
            console.error(...safeArgs);
        }
    },

    /**
     * ????? Promise ?? timeout ?? ????? ??? timer ???? unhandled rejections
     * @param {Promise} promise - ??? Promise ??????
     * @param {number} timeoutMs - ?????? ??????? ?????
     * @param {string|Error|Function} timeoutError - ?????/??? ?? ???? ????? Error/Message
     * @returns {Promise}
     */
    promiseWithTimeout(promise, timeoutMs = 10000, timeoutError = '????? ???? ???????') {
        let timeoutId = null;
        let settled = false;

        const normalizedPromise = Promise.resolve(promise)
            .finally(() => {
                settled = true;
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            });

        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                // ??? ??? ??? promise ??????? ?????? ?? ???? ???
                if (settled) return;

                try {
                    const value = (typeof timeoutError === 'function') ? timeoutError() : timeoutError;
                    if (value instanceof Error) {
                        reject(value);
                    } else {
                        let msg = String(value || '????? ???? ???????');
                        // ??? ??????? HTML ?????? ??? (?? ??????? ?????? ?? ???? ???? ????? ?????)
                        if (msg.length > 80 && (msg.includes('<div') || msg.includes('class="') || msg.includes('</p>'))) {
                            msg = '????? ???? ???????';
                        }
                        reject(new Error(msg));
                    }
                } catch (e) {
                    reject(e instanceof Error ? e : new Error(String(e || '????? ???? ???????')));
                }
            }, timeoutMs);
        });

        return Promise.race([normalizedPromise, timeoutPromise]);
    },

    /**
     * ????? ??????? ???
     */
    safeWarn(...args) {
        // ????? ????????? ???????? ?? Google Sheets ? Chrome Extensions
        if (args.length > 0) {
            const argsStr = args.map(arg => String(arg || '')).join(' ');
            if (argsStr.includes('runtime.lastError') ||
                argsStr.includes('message port closed') ||
                argsStr.includes('translator') ||
                argsStr.includes('???? Google Sheets ??? ????') ||
                argsStr.includes('Google Sheets ID') ||
                argsStr.includes('Spreadsheet ID') ||
                argsStr.includes('sendRequest (saveToSheet)') ||
                argsStr.includes('sendRequest (appendToSheet)') ||
                argsStr.includes('sendRequest (readFromSheet)') ||
                argsStr.includes('???? Google Sheets ??? ????')) {
                return; // ????? ??? ?????????
            }

            // ??? ????? ???? ??? (file://) ?? ??? ??? timeout: ????? ????? ????? ?? ????? ?????????
            const isNoBackendWarning = (
                argsStr.includes('??? ??????? ??? ???? ?????? ????? ????????') ||
                (argsStr.includes('????? ???') && argsStr.includes('???? ?????')) ||
                argsStr.includes('????? ???? ??????? ???????') ||
                argsStr.includes('????? ???? ?????? ????? ????????') ||
                argsStr.includes('Timeout: ????? ????????') ||
                argsStr.includes('??? ?? ??????? ?? Backend') ||
                argsStr.includes('????? ???? ??????? ??????')
            );
            if (isNoBackendWarning && typeof AppState !== 'undefined') {
                AppState.runningWithoutBackend = true;
                if (!AppState._noBackendWarningLogged) {
                    AppState._noBackendWarningLogged = true;
                    console.warn('?? ??????? ???? ???? ??? (?? ????? ???????). ??? ???????? ??? ??????.');
                }
                return;
            }

            // ????? ????? ????? Circuit Breaker - ????? ??? ????? ?? 30 ?????
            if (argsStr.includes('Circuit Breaker ?????')) {
                const lastLogTime = this._circuitBreakerWarnTime || 0;
                const now = Date.now();
                if (now - lastLogTime < 30000) {
                    return; // ????? ??? ?? ??????? ??????
                }
                this._circuitBreakerWarnTime = now;
            }
        }

        if (!Utils.isProduction()) {
            console.warn(...args);
        }
    },

    /**
     * JSON.stringify ??? ?????? ?? ??????? ????????
     */
    safeStringify(obj, space) {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) {
                    return '[Circular Reference]';
                }
                seen.add(value);
            }
            return value;
        }, space);
    },

    /**
     * ????? ???? ???? XSS
     */
    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    /**
     * ????? HTML ???????? ???? ????? ??? ???? ?? DOM
     */
    sanitizeHTML(html) {
        const raw = String(html || '');
        if (!raw) return '';
        const template = document.createElement('template');
        template.innerHTML = raw;

        const blockedTags = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta']);
        const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach((el) => {
            const tag = String(el.tagName || '').toLowerCase();
            if (blockedTags.has(tag)) {
                el.remove();
                return;
            }
            const attrs = Array.from(el.attributes || []);
            attrs.forEach((attr) => {
                const name = String(attr.name || '').toLowerCase();
                const value = String(attr.value || '');
                if (name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                    return;
                }
                if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        return template.innerHTML;
    },

    /**
     * ????? innerHTML ??? ???????
     */
    setSafeHTML(element, html) {
        if (!element) return;
        element.innerHTML = this.sanitizeHTML(html);
    },

    extractImageSourceCandidate(source) {
        if (!source) return '';
        if (typeof source === 'string') return source;
        if (typeof source !== 'object') return '';

        const candidateKeys = [
            'photo',
            'photoUrl',
            'imageUrl',
            'image',
            'personalPhoto',
            'documentImage',
            'directLink',
            'shareableLink',
            'url'
        ];

        for (let i = 0; i < candidateKeys.length; i++) {
            const value = source[candidateKeys[i]];
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }

        return '';
    },

    extractDriveFileId(url) {
        try {
            const raw = String(url || '').trim();
            if (!raw) return '';
            if (typeof window !== 'undefined' && typeof window.__extractDriveFileId === 'function') {
                return String(window.__extractDriveFileId(raw) || '').trim();
            }
            const match = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/i)
                || raw.match(/\/file\/d\/([a-zA-Z0-9_-]+)/i)
                || raw.match(/\/d\/([a-zA-Z0-9_-]+)/i)
                || raw.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i)
                || raw.match(/\/thumbnail\?id=([a-zA-Z0-9_-]+)/i);
            return match ? String(match[1] || '').trim() : '';
        } catch (e) {
            return '';
        }
    },

    normalizeGoogleDriveImageUrl(url) {
        const raw = String(url || '').trim().replace(/^['"`]+|['"`]+$/g, '');
        if (!raw) return '';

        if (typeof window !== 'undefined' && typeof window.__convertGoogleDriveUrl === 'function') {
            const converted = window.__convertGoogleDriveUrl(raw);
            if (converted && typeof converted === 'string') {
                return converted.trim();
            }
        }

        const fileId = this.extractDriveFileId(raw);
        if (!fileId) {
            return raw;
        }

        if (typeof window !== 'undefined' && typeof window.__googleDrivePreviewUrlFromId === 'function') {
            return window.__googleDrivePreviewUrlFromId(fileId);
        }

        return `https://drive.google.com/uc?export=view&id=${fileId}`;
    },

    normalizeImageSource(source) {
        const rawSource = this.extractImageSourceCandidate(source);
        if (!rawSource) return '';

        let trimmed = String(rawSource).trim().replace(/^['"`]+|['"`]+$/g, '');
        if (!trimmed) return '';

        if (trimmed.startsWith('blob:')) {
            return trimmed;
        }

        if (/^data:image\//i.test(trimmed)) {
            const commaIndex = trimmed.indexOf(',');
            if (commaIndex === -1) {
                return trimmed.replace(/\s+/g, '');
            }

            const header = trimmed.slice(0, commaIndex).replace(/\s+/g, '');
            const payload = trimmed.slice(commaIndex + 1).replace(/\s+/g, '');
            return payload ? `${header},${payload}` : '';
        }

        if (/^https?:\/\//i.test(trimmed)) {
            if (/drive\.google\.com|googleusercontent\.com/i.test(trimmed)) {
                return this.normalizeGoogleDriveImageUrl(trimmed);
            }
            return trimmed;
        }

        const compactBase64 = trimmed.replace(/\s+/g, '');
        if (compactBase64.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compactBase64.substring(0, Math.min(120, compactBase64.length)))) {
            return `data:image/jpeg;base64,${compactBase64}`;
        }

        return '';
    },

    /**
     * ???? ??? Apps Script (Web App) ?? ???? ?? ?????????.
     */
    getAppsScriptScriptUrl() {
        return '';
    },

    /**
     * URL ???? getProfileImage (???? ?? Drive ?? JSON ???? dataUri) — ?????? ??? hotlinking ?? Google Drive ?? ??? img.
     */
    buildGetProfileImageProxyUrl(fileId) {
        const id = String(fileId || '').trim();
        if (!id) return '';
        const scriptUrl = this.getAppsScriptScriptUrl();
        if (!scriptUrl || scriptUrl.indexOf('script.google.com') === -1) return '';
        return scriptUrl + (scriptUrl.indexOf('?') !== -1 ? '&' : '?') + 'action=getProfileImage&id=' + encodeURIComponent(id);
    },

    /**
     * ??? ???? Drive ??? ??????? ?????? data URI ????? ?? img.
     */
    async fetchDriveImageDataUri(fileId) {
        const url = this.buildGetProfileImageProxyUrl(fileId);
        if (!url) return null;
        try {
            const res = await fetch(url, { method: 'GET', credentials: 'omit' });
            const data = await res.json();
            if (data && data.success && data.dataUri) return String(data.dataUri);
        } catch (e) {
            Utils.safeWarn?.('app-utils: operation failed', e);
        }
        return null;
    },

    /**
     * ????? ????? img ???? ???? data-drive-proxy-id ?????? ?????? ??? ??????.
     * @param {ParentNode|null|undefined} rootEl
     * @param {{ onFetchFail?: (img: HTMLImageElement) => void }} [callbacks]
     */
    hydrateDriveProxyImages(rootEl, callbacks) {
        try {
            const root = rootEl || document;
            if (!root || typeof root.querySelectorAll !== 'function') return;
            const scriptUrl = this.getAppsScriptScriptUrl();
            if (!scriptUrl || scriptUrl.indexOf('script.google.com') === -1) return;

            const imgs = root.querySelectorAll('img[data-drive-proxy-id]');
            if (!imgs || !imgs.length) return;

            const onFetchFail = callbacks && typeof callbacks.onFetchFail === 'function' ? callbacks.onFetchFail : null;

            imgs.forEach((img) => {
                if (!img || img.dataset.driveProxyHydrated === '1') return;
                const id = String(img.getAttribute('data-drive-proxy-id') || '').trim();
                if (!id) return;
                img.dataset.driveProxyHydrated = '1';
                this.fetchDriveImageDataUri(id).then((dataUri) => {
                    if (dataUri) {
                        img.src = dataUri;
                        try {
                            if (img.dataset.photoUrl !== undefined) img.dataset.photoUrl = dataUri;
                        } catch (e2) { Utils.safeWarn?.('app-utils: operation failed', e2); }
                    } else if (onFetchFail) {
                        onFetchFail(img);
                    }
                });
            });
        } catch (e) {
            Utils.safeWarn?.('app-utils: operation failed', e);
        }
    },

    /** ???? ????? 1×1 ??????? ?? src ???? ??? ??? ??? Drive ??? ?????? */
    IMG_DRIVE_PLACEHOLDER_GIF: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',

    /**
     * ????? ???? ??? ?????: ????? Google Drive ????? ??? ???? getProfileImage ??? ???? scriptUrl.
     * @param {*} source - ?? ?? ???? ??????? ??? normalizeImageSource
     * @returns {{ canonical: string, displaySrc: string, proxyFileId: string, needsProxy: boolean }}
     */
    resolveDriveAwareImgDisplay(source) {
        const empty = { canonical: '', displaySrc: '', proxyFileId: '', needsProxy: false };
        try {
            const canonical = this.normalizeImageSource(source);
            if (!canonical) return empty;

            if (/^data:image\//i.test(canonical) || String(canonical).indexOf('blob:') === 0) {
                return { canonical, displaySrc: canonical, proxyFileId: '', needsProxy: false };
            }
            if (!/^https?:\/\//i.test(canonical)) {
                return { canonical, displaySrc: canonical, proxyFileId: '', needsProxy: false };
            }
            if (!/drive\.google\.com|googleusercontent\.com/i.test(canonical)) {
                return { canonical, displaySrc: canonical, proxyFileId: '', needsProxy: false };
            }
            const fileId = this.extractDriveFileId(canonical);
            const scriptUrl = this.getAppsScriptScriptUrl();
            const canProxy = !!(fileId && scriptUrl && scriptUrl.indexOf('script.google.com') !== -1);
            if (canProxy) {
                return {
                    canonical,
                    displaySrc: this.IMG_DRIVE_PLACEHOLDER_GIF,
                    proxyFileId: fileId,
                    needsProxy: true
                };
            }
            return { canonical, displaySrc: canonical, proxyFileId: '', needsProxy: false };
        } catch (e) {
            return empty;
        }
    },

    /**
     * ???? HTML ???? img ??? ??????? ???? Drive (?? resolveDriveAwareImgDisplay).
     * @param {{ needsProxy?: boolean, proxyFileId?: string }} info
     */
    driveProxyImgAttrs(info) {
        if (!info || !info.needsProxy || !info.proxyFileId) return '';
        return ` data-drive-proxy-id="${this.escapeHTML(String(info.proxyFileId))}"`;
    },

    normalizeContractorIdentityValue(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/[\u200e\u200f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    },

    canonicalizeContractorName(value) {
        const normalized = this.normalizeContractorIdentityValue(value);
        if (!normalized) return '';
        return normalized
            .replace(/["'`.,??:(){}\[\]<>_\-\/\\|]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    getPreferredContractorLookupKey(contractor, fallbackValue = '') {
        const base = contractor && typeof contractor === 'object' ? contractor : {};
        const candidates = [
            base.code,
            base.isoCode,
            base.contractorCode,
            base.entityCode,
            base.licenseNumber,
            base.contractNumber,
            base.contractorId,
            base.id,
            base.approvedEntityId,
            fallbackValue
        ];
        for (let i = 0; i < candidates.length; i++) {
            const normalized = this.normalizeContractorIdentityValue(candidates[i]);
            if (normalized) {
                return String(candidates[i]).replace(/[\u200e\u200f]/g, '').trim();
            }
        }
        return '';
    },

    sanitizeContractorIdentity(contractor) {
        const base = contractor && typeof contractor === 'object' ? { ...contractor } : {};
        const normalizeValue = (value) => this.normalizeContractorIdentityValue(value);
        const canonicalizeName = (value) => this.canonicalizeContractorName(value);
        const collectCandidateIds = (record) => {
            if (!record || typeof record !== 'object') return [];
            const values = [
                record.id,
                record.contractorId,
                record.code,
                record.isoCode,
                record.contractorCode,
                record.entityCode,
                record.licenseNumber,
                record.contractNumber,
                record.approvedEntityId
            ];
            ['aliasIds', 'identityIds', 'legacyIds', 'altIds'].forEach((field) => {
                if (Array.isArray(record[field])) values.push(...record[field]);
            });
            return Array.from(new Set(values.map(value => String(value == null ? '' : value).replace(/[\u200e\u200f]/g, '').trim()).filter(Boolean)));
        };
        const baseCode = normalizeValue(base.code || base.isoCode || base.contractorCode || base.entityCode);
        const baseName = canonicalizeName(base.companyName || base.name || base.contractorName || base.company || base.contractorCompany);
        const linkedContractors = Array.isArray(AppState?.appData?.contractors) ? AppState.appData.contractors.filter(Boolean) : [];
        const resolveLinkedRecord = (value) => {
            const normalized = normalizeValue(value);
            if (!normalized) return null;
            return linkedContractors.find((record) => {
                return [
                    record?.id,
                    record?.contractorId,
                    record?.code,
                    record?.isoCode,
                    record?.contractorCode,
                    record?.entityCode
                ].some(candidate => normalizeValue(candidate) === normalized);
            }) || null;
        };
        const matchesBaseIdentity = (record) => {
            if (!record || typeof record !== 'object') return false;
            const recordCode = normalizeValue(record.code || record.isoCode || record.contractorCode || record.entityCode);
            if (baseCode && recordCode) {
                return recordCode === baseCode;
            }
            const recordName = canonicalizeName(record.name || record.companyName || record.contractorName || record.company || record.contractorCompany);
            if (baseName && recordName) {
                return recordName === baseName;
            }
            return !(baseCode || baseName);
        };
        const conflictingIds = new Set();
        ['contractorId', 'id'].forEach((field) => {
            const normalized = normalizeValue(base[field]);
            if (!normalized) return;
            const linkedRecord = resolveLinkedRecord(base[field]);
            if (linkedRecord && !matchesBaseIdentity(linkedRecord)) {
                conflictingIds.add(normalized);
            }
        });

        if (conflictingIds.has(normalizeValue(base.contractorId))) {
            delete base.contractorId;
        }

        if (conflictingIds.has(normalizeValue(base.id))) {
            const replacementId = this.getPreferredContractorLookupKey({
                ...base,
                id: '',
                contractorId: ''
            });
            base.id = replacementId || '';
        }

        ['aliasIds', 'identityIds', 'legacyIds', 'altIds'].forEach((field) => {
            if (!Array.isArray(base[field])) return;
            base[field] = base[field].filter(value => !conflictingIds.has(normalizeValue(value)));
        });

        const safeIds = collectCandidateIds(base);
        if (safeIds.length) {
            base.aliasIds = Array.from(new Set([...(Array.isArray(base.aliasIds) ? base.aliasIds : []), ...safeIds]));
        }

        return base;
    },

    buildContractorIdentityMatcher(contractor, contractorIdParam) {
        const base = contractor && typeof contractor === 'object' ? contractor : {};
        const normalizeValue = (value) => this.normalizeContractorIdentityValue(value);
        const canonicalizeName = (value) => this.canonicalizeContractorName(value);
        const baseIdFields = ['id', 'contractorId', 'contractorCode', 'code', 'isoCode', 'licenseNumber', 'contractNumber', 'approvedEntityId', 'entityCode'];
        const recordIdFields = ['contractorId', 'contractorCode', 'code', 'isoCode', 'licenseNumber', 'contractNumber', 'approvedEntityId', 'entityCode'];
        const nameFields = ['contractorName', 'companyName', 'company', 'contractorCompany', 'name', 'externalName', 'contractorWorkerName', 'contractorWorker'];
        const idsSet = new Set();
        const exactNameSet = new Set();
        const canonicalNameSet = new Set();
        const addId = (value) => {
            const normalized = normalizeValue(value);
            if (normalized) idsSet.add(normalized);
        };
        const addIdCollection = (values) => {
            if (!Array.isArray(values)) return;
            values.forEach(addId);
        };
        const addName = (value) => {
            const normalized = normalizeValue(value);
            if (normalized) exactNameSet.add(normalized);
            const canonical = canonicalizeName(value);
            if (canonical) canonicalNameSet.add(canonical);
        };
        const collectRecordIds = (record) => {
            if (!record || typeof record !== 'object') return [];
            return recordIdFields
                .map(field => normalizeValue(record[field]))
                .filter(Boolean);
        };
        const collectRecordNames = (record) => {
            if (!record || typeof record !== 'object') return [];
            const names = [];
            nameFields.forEach(field => {
                const value = record[field];
                if (value === undefined || value === null) return;
                const normalized = String(value).replace(/\s+/g, ' ').trim();
                if (normalized) names.push(normalized);
            });
            return names;
        };
        const collectContractorEntityNames = (record) => {
            if (!record || typeof record !== 'object') return [];
            return ['contractorName', 'companyName', 'company', 'contractorCompany', 'name', 'externalName']
                .map(field => record[field])
                .filter(value => value !== undefined && value !== null)
                .map(value => String(value).replace(/\s+/g, ' ').trim())
                .filter(Boolean);
        };
        const matchesNameValue = (value) => {
            const normalized = normalizeValue(value);
            if (normalized && exactNameSet.has(normalized)) return true;
            const canonical = canonicalizeName(value);
            return !!(canonical && canonicalNameSet.has(canonical));
        };

        addId(contractorIdParam);
        baseIdFields.forEach(field => addId(base[field]));
        addIdCollection(base.aliasIds);
        addIdCollection(base.identityIds);
        addIdCollection(base.legacyIds);
        addIdCollection(base.altIds);
        nameFields.forEach(field => addName(base[field]));

        const matchesContractor = (record) => {
            if (!record || typeof record !== 'object') return false;
            const recordIds = collectRecordIds(record);
            if (recordIds.some(id => idsSet.has(id))) return true;
            if (recordIds.length > 0) return false;
            return collectRecordNames(record).some(matchesNameValue);
        };

        const contractorName = String(base.name || base.companyName || base.contractorName || '').replace(/\s+/g, ' ').trim();

        return {
            contractorName,
            idsSet,
            exactNameSet,
            canonicalNameSet,
            normalizeValue,
            canonicalizeName,
            collectRecordIds,
            collectRecordNames,
            hasAnyRecordIds(record) {
                return collectRecordIds(record).length > 0;
            },
            matchesNameValue,
            matchFieldsByName(values) {
                return (Array.isArray(values) ? values : []).some(matchesNameValue);
            },
            matchesContractor,
            violationBelongsToContractor(record) {
                if (!record || typeof record !== 'object') return false;
                const personType = normalizeValue(record.personType);
                if ((personType === 'employee' || personType === '????') &&
                    !record.contractorName &&
                    !record.contractorId &&
                    !record.contractorCode &&
                    !record.code &&
                    !record.isoCode) {
                    return false;
                }
                const recordIds = collectRecordIds(record);
                const hasRecordIds = recordIds.length > 0;
                const idsMatch = recordIds.some(id => idsSet.has(id));
                if (hasRecordIds && !idsMatch) return false;
                const entityNames = collectContractorEntityNames(record);
                const hasEntityNames = entityNames.length > 0;
                const namesMatch = entityNames.some(matchesNameValue);
                if (hasEntityNames && !namesMatch) return false;
                // Prefer explicit IDs as source of truth across modules/sheets.
                // Name mismatches (spacing/spelling variants) should not hide valid records.
                if (hasRecordIds) return idsMatch;
                if (hasEntityNames) return namesMatch;
                return matchesContractor(record);
            },
            evaluationBelongsToContractor(record) {
                if (!record || typeof record !== 'object') return false;
                const recordIds = collectRecordIds(record);
                const hasRecordIds = recordIds.length > 0;
                const idsMatch = recordIds.some(id => idsSet.has(id));
                if (hasRecordIds) return idsMatch;
                const entityNames = collectContractorEntityNames(record);
                const hasEntityNames = entityNames.length > 0;
                if (hasEntityNames) return entityNames.some(matchesNameValue);
                return matchesContractor(record);
            }
        };
    },

    findApprovedContractorByTerm(term, approvedContractors = []) {
        const normalizedTerm = this.normalizeContractorIdentityValue(term);
        const canonicalTerm = this.canonicalizeContractorName(term);
        const approvedList = Array.isArray(approvedContractors) ? approvedContractors.filter(Boolean) : [];
        if (!normalizedTerm) {
            return { contractor: null, matches: [], ambiguous: false, reason: 'empty', matchType: null };
        }

        const collectMatches = (predicate) => approvedList.filter(contractor => {
            try {
                return predicate(contractor);
            } catch (error) {
                return false;
            }
        });

        let matches = collectMatches(contractor => {
            const sanitized = this.sanitizeContractorIdentity(contractor);
            const ctx = this.buildContractorIdentityMatcher(sanitized, this.getPreferredContractorLookupKey(sanitized, contractor?.contractorId || contractor?.id));
            return ctx.idsSet.has(normalizedTerm);
        });
        let matchType = 'exact-id';

        if (!matches.length) {
            matches = collectMatches(contractor => {
                const sanitized = this.sanitizeContractorIdentity(contractor);
                const ctx = this.buildContractorIdentityMatcher(sanitized, this.getPreferredContractorLookupKey(sanitized, contractor?.contractorId || contractor?.id));
                return ctx.matchesNameValue(term);
            });
            matchType = 'exact-name';
        }

        if (!matches.length && normalizedTerm.length >= 3) {
            matches = collectMatches(contractor => {
                const sanitized = this.sanitizeContractorIdentity(contractor);
                const ctx = this.buildContractorIdentityMatcher(sanitized, this.getPreferredContractorLookupKey(sanitized, contractor?.contractorId || contractor?.id));
                return Array.from(ctx.idsSet).some(value => value.startsWith(normalizedTerm));
            });
            matchType = 'prefix-id';
        }

        if (!matches.length && canonicalTerm && canonicalTerm.length >= 3) {
            matches = collectMatches(contractor => {
                const sanitized = this.sanitizeContractorIdentity(contractor);
                const ctx = this.buildContractorIdentityMatcher(sanitized, this.getPreferredContractorLookupKey(sanitized, contractor?.contractorId || contractor?.id));
                return Array.from(ctx.canonicalNameSet).some(value => value.startsWith(canonicalTerm));
            });
            matchType = 'prefix-name';
        }

        if (matches.length === 1) {
            return {
                contractor: matches[0],
                matches,
                ambiguous: false,
                reason: 'matched',
                matchType
            };
        }

        return {
            contractor: null,
            matches,
            ambiguous: matches.length > 1,
            reason: matches.length > 1 ? 'ambiguous' : 'not-found',
            matchType
        };
    },

    /**
     * ?????? ?? ??? ?????? ??????????
     */
    isValidEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email.trim());
    },

    async sha256(value) {
        if (value === undefined || value === null) value = '';
        const input = String(value);

        if (window.crypto && window.crypto.subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(input);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        if (window.CryptoJS && window.CryptoJS.SHA256) {
            return window.CryptoJS.SHA256(input).toString();
        }

        throw new Error('SHA-256 not supported in this environment');
    },

    isSha256Hex(value) {
        if (!value || typeof value !== 'string') return false;
        return /^[a-f0-9]{64}$/i.test(value.trim());
    },

    async normalizePasswordForComparison(inputPassword, storedPassword) {
        Utils.safeLog('?? normalizePasswordForComparison:', {
            inputPasswordLength: inputPassword?.length || 0,
            storedPasswordLength: storedPassword?.length || 0,
            storedPasswordPrefix: storedPassword ? (storedPassword.substring(0, 20) + '...') : '??? ?????',
            isStoredPasswordHash: storedPassword ? this.isSha256Hex(storedPassword) : false
        });

        if (storedPassword && this.isSha256Hex(storedPassword)) {
            try {
                const hashedInput = await this.sha256(inputPassword);
                Utils.safeLog('? ?? ????? ???? ?????? ???????:', {
                    inputPasswordLength: inputPassword.length,
                    hashedInputLength: hashedInput.length,
                    hashedInputPrefix: hashedInput.substring(0, 20) + '...',
                    storedPasswordPrefix: storedPassword.substring(0, 20) + '...'
                });
                return hashedInput;
            } catch (error) {
                Utils.safeWarn('? ???? ????? SHA-256 ????????:', error);
                return inputPassword;
            }
        }

        Utils.safeWarn('? storedPassword ??? hash ???? - ????? inputPassword ??? ??');
        return inputPassword;
    },

    /**
     * ????? ???????
     */
    formatDateForInput(date) {
        if (!date) return '';
        try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return '';
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        } catch (e) {
            return '';
        }
    },

    formatDate(date, locale = null) {
        if (!date) return '-';

        const dateFormat = (typeof AppState !== 'undefined' && AppState.dateFormat) ? AppState.dateFormat : 'gregorian';
        const useLocale = locale || (dateFormat === 'hijri' ? 'ar-SA-u-ca-islamic' : 'en-GB');

        try {
            let d;
            if (date instanceof Date) {
                if (isNaN(date.getTime())) return '-';
                d = date;
            } else {
                let dateStr = String(date).trim();
                const dmyMatch = dateStr.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
                if (dmyMatch) {
                    const [, day, month, year, hours, minutes, seconds] = dmyMatch;
                    d = new Date(
                        Number(year),
                        Number(month) - 1,
                        Number(day),
                        Number(hours || 0),
                        Number(minutes || 0),
                        Number(seconds || 0),
                        0
                    );
                } else if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+') || dateStr.match(/-\d{2}:\d{2}$/))) {
                    d = new Date(dateStr);
                } else if (dateStr.length === 10 && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    d = new Date(dateStr + 'T00:00:00');
                } else {
                    d = new Date(dateStr);
                }
                if (isNaN(d.getTime())) return '-';
            }

            return d.toLocaleDateString(useLocale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                calendar: dateFormat === 'hijri' ? 'islamic' : 'gregory'
            });
        } catch (error) {
            Utils.safeError('??? ?? ????? ???????:', error);
            return '-';
        }
    },

    /**
     * ????? ??????? ??????
     */
    formatDateTime(date, locale = null) {
        if (!date) return '-';

        const dateFormat = (typeof AppState !== 'undefined' && AppState.dateFormat) ? AppState.dateFormat : 'gregorian';
        const useLocale = locale || (dateFormat === 'hijri' ? 'ar-SA-u-ca-islamic' : 'ar-EG');
        const isArabicLocale = useLocale.startsWith('ar');

        try {
            let d;
            
            // ? ?????? ????? ????? ????? ???????
            // ??? ??? Date object ??????
            if (date instanceof Date) {
                if (isNaN(date.getTime())) return '-';
                d = date;
            } else {
                // ?????? strings
                let dateStr = String(date).trim();
                
                const dmyMatch = dateStr.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
                if (dmyMatch) {
                    const [, day, month, year, hours, minutes, seconds] = dmyMatch;
                    d = new Date(
                        Number(year),
                        Number(month) - 1,
                        Number(day),
                        Number(hours || 0),
                        Number(minutes || 0),
                        Number(seconds || 0),
                        0
                    );
                }
                // ??? ???? ????? ISO ????? (????? ??? T ? Z ?? +)
                else if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+') || dateStr.match(/-\d{2}:\d{2}$/))) {
                    d = new Date(dateStr);
                }
                // ??? ???? ????? yyyy-MM-dd ??? (10 ????)? ???? ??? ???????
                else if (dateStr.length === 10 && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    // ?????? 00:00:00 ???? ??????? ???????? ???????
                    d = new Date(dateStr + 'T00:00:00');
                }
                // ?????? ????? ?? ???? ????
                else {
                    d = new Date(dateStr);
                }
                
                if (isNaN(d.getTime())) return '-';
            }

            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                calendar: dateFormat === 'hijri' ? 'islamic' : 'gregory'
            };
            
            // Ensure AM/PM is displayed for Arabic locales
            if (isArabicLocale) {
                options.hour12 = true;
            }

            return d.toLocaleString(useLocale, options);
        } catch (error) {
            Utils.safeError('??? ?? ????? ??????? ??????:', error);
            return '-';
        }
    },

    /**
     * ????? ISO string ?? Date ??? ????? datetime-local ????? ?? ???? ???????
     * ???? ?????? ??????? ?? UTC ??? ??????? ?????? ???? ????
     * @param {string|Date} isoOrDate - ????? ?????? ISO string ?? ???? Date
     * @returns {string} ????? ?????? yyyy-MM-ddTHH:mm ????????? ?? ???? datetime-local
     */
    toDateTimeLocalString(isoOrDate) {
        if (!isoOrDate) return '';
        try {
            const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
            if (isNaN(date.getTime())) return '';
            // ????? ?? UTC ??? ??????? ??????
            const offset = date.getTimezoneOffset();
            const localDate = new Date(date.getTime() - offset * 60000);
            return localDate.toISOString().slice(0, 16);
        } catch (error) {
            Utils.safeError('??? ?? ????? ??????? ??? datetime-local:', error);
            return '';
        }
    },

    /**
     * ????? datetime-local string ??? ISO string ???? ????
     * ????? ??? ????? ?????? ?????? ?? ??? ????????
     * @param {string} dateTimeLocalString - ???? datetime-local ????? YYYY-MM-DDTHH:mm
     * @returns {string|null} ISO string ?? null ??? ???? ?????? ??? ?????
     */
    dateTimeLocalToISO(dateTimeLocalString) {
        if (!dateTimeLocalString || !dateTimeLocalString.trim()) return null;
        try {
            // datetime-local ???? ???? local time ????? YYYY-MM-DDTHH:mm
            // ????? ?????? Date object ???? ??? ????? ?????? ???? ????
            const [datePart, timePart] = dateTimeLocalString.trim().split('T');
            if (datePart && timePart) {
                const [year, month, day] = datePart.split('-').map(Number);
                const [hours, minutes] = timePart.split(':').map(Number);
                
                // ????? Date object ???????? ????? ??????
                const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
                if (!isNaN(localDate.getTime())) {
                    // ????? ??? ISO string (???? ?????? ??? UTC ????????)
                    return localDate.toISOString();
                }
            }
            // Fallback: ??????? ??????? ??????? ??? ??? ???????
            const date = new Date(dateTimeLocalString);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
            return null;
        } catch (error) {
            Utils.safeError('??? ?? ????? datetime-local ??? ISO:', error);
            return null;
        }
    },

    /**
     * ????? ???? ???? (??????? ??????? - ??????? ?? ????? ??????)
     */
    generateId(prefix = 'ID') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * ????? ???? ?????? ?????? [PREFIX]_[NUMBER]
     * ??? PTW_01, INC_01, ???
     * 
     * @param {string} prefix - ??????? (3 ????) ??? PTW, INC, NRM
     * @param {Array} existingData - ???????? ???????? ?? ????? ????????
     * @returns {string} ???? ???? ???????? PREFIX_NUMBER
     */
    generateSequentialId(prefix, existingData = []) {
        try {
            if (!prefix || prefix.length !== 3) {
                console.warn('Invalid prefix:', prefix, '- must be exactly 3 characters');
                // Fallback to old method if prefix is invalid
                return this.generateId(prefix);
            }

            // ????? ??????? ??? ???? ?????
            prefix = prefix.toUpperCase();

            // ??????? ???? ??????? ???????? ?????? PREFIX_NUMBER
            const existingNumbers = [];
            if (existingData && Array.isArray(existingData)) {
                existingData.forEach(record => {
                    if (record && record.id) {
                        const id = record.id.toString();
                        // ?????? ?? ???????: PREFIX_NUMBER (??? PTW_01, PTW_100, ???)
                        const pattern = new RegExp('^' + prefix + '_\\d+$');
                        if (pattern.test(id)) {
                            // ??????? ?????
                            const numberPart = id.split('_')[1];
                            const number = parseInt(numberPart, 10);
                            if (!isNaN(number) && number > 0) {
                                existingNumbers.push(number);
                            }
                        }
                    }
                });
            }

            // ???? ????? ??????
            let nextNumber = 1;
            if (existingNumbers.length > 0) {
                nextNumber = Math.max(...existingNumbers) + 1;
            }

            // ?????? ?? ??? ????? ???? ?????? (1000000)
            if (nextNumber > 1000000) {
                console.warn('Warning: Sequential number exceeded maximum (1000000), using fallback');
                return this.generateId(prefix);
            }

            // ????? ?????? ??????
            return prefix + '_' + nextNumber.toString();

        } catch (error) {
            console.error('Error in generateSequentialId:', error);
            // ?? ???? ?????? ?????? ??????? ??????? ?????
            return this.generateId(prefix);
        }
    },

    /**
     * ?????? ??? ??????? ???????? ????????
     * @param {string} moduleName - ??? ????????
     * @returns {string} ??????? (3 ????)
     */
    getModulePrefix(moduleName) {
        const prefixMap = {
            // ??????? ????????
            'incidents': 'INC',
            'Incidents': 'INC',
            'nearmiss': 'NRM',
            'NearMiss': 'NRM',
            'ptw': 'PTW',
            'PTW': 'PTW',
            'violations': 'VIO',
            'Violations': 'VIO',

            // ??????? ?????????
            'training': 'TRN',
            'Training': 'TRN',
            'employees': 'EMP',
            'Employees': 'EMP',

            // ??????? ????????
            'fireequipment': 'FEA',
            'FireEquipment': 'FEA',
            'fireequipmentassets': 'EFA',
            'FireEquipmentAssets': 'EFA',
            'fireequipmentinspections': 'FEI',
            'FireEquipmentInspections': 'FEI',
            'ppe': 'PPE',
            'PPE': 'PPE',
            'periodicinspections': 'PIN',
            'PeriodicInspections': 'PIN',
            'periodicinspectioncategories': 'PIC',
            'PeriodicInspectionCategories': 'PIC',
            'periodicinspectionchecklists': 'PIC',
            'PeriodicInspectionChecklists': 'PIC',
            'periodicinspectionschedules': 'PIS',
            'PeriodicInspectionSchedules': 'PIS',
            'periodicinspectionrecords': 'PIR',
            'PeriodicInspectionRecords': 'PIR',

            // ????????? ????????
            // ? ?? ????? 'contractors' ? 'Contractors' - ????? ??? ??? ApprovedContractors
            'approvedcontractors': 'ACN',
            'ApprovedContractors': 'ACN',
            'contractorevaluations': 'CEV',
            'ContractorEvaluations': 'CEV',
            'clinic': 'CLN',
            'ClinicVisits': 'CLV',
            'clinicvisits': 'CLV',
            'medications': 'MED',
            'Medications': 'MED',
            'sickleave': 'SKL',
            'SickLeave': 'SKL',
            'injuries': 'INJ',
            'Injuries': 'INJ',
            'clinicinventory': 'CLI',
            'ClinicInventory': 'CLI',

            // ISO ? HSE
            'iso': 'ISO',
            'isodocuments': 'ISD',
            'ISODocuments': 'ISD',
            'isoprocedures': 'ISP',
            'ISOProcedures': 'ISP',
            'isoforms': 'ISF',
            'ISOForms': 'ISF',
            'hse': 'HSE',
            'hseaudits': 'HSA',
            'HSEAudits': 'HSA',
            'hsenonconformities': 'HSN',
            'HSENonConformities': 'HSN',
            'hsecorrectiveactions': 'HSC',
            'HSECorrectiveActions': 'HSC',
            'hseobjectives': 'HSO',
            'HSEObjectives': 'HSO',
            'hseriskassessments': 'HSR',
            'HSERiskAssessments': 'HSR',

            // ????? ??????? ??????????
            'riskassessments': 'RSA',
            'RiskAssessments': 'RSA',
            'legaldocuments': 'LGD',
            'LegalDocuments': 'LGD',
            'sopjha': 'SOP',
            'SOPJHA': 'SOP',

            // ???????? ??????????
            'behaviormonitoring': 'BHM',
            'BehaviorMonitoring': 'BHM',
            'chemicalsafety': 'CHS',
            'ChemicalSafety': 'CHS',
            'dailyobservations': 'DOB',
            'DailyObservations': 'DOB',
            'observationsites': 'OBS',
            'ObservationSites': 'OBS',

            // ????????? ???????
            'sustainability': 'SUS',
            'Sustainability': 'SUS',
            'environmentalaspects': 'ENA',
            'EnvironmentalAspects': 'ENA',
            'environmentalmonitoring': 'ENM',
            'EnvironmentalMonitoring': 'ENM',
            'carbonfootprint': 'CFP',
            'CarbonFootprint': 'CFP',
            'wastemanagement': 'WAM',
            'WasteManagement': 'WAM',
            'energyefficiency': 'ENE',
            'EnergyEfficiency': 'ENE',
            'watermanagement': 'WAM',
            'WaterManagement': 'WAM',
            'recyclingprograms': 'RCP',
            'RecyclingPrograms': 'RCP',

            // ??????? ??????????
            'emergency': 'EMG',
            'emergencyalerts': 'EMA',
            'EmergencyAlerts': 'EMA',
            'emergencyplans': 'EMP',
            'EmergencyPlans': 'EMP',
            'emergencyplansupdates': 'EPU',
            'EmergencyPlansUpdates': 'EPU',
            'safetybudget': 'SAB',
            'SafetyBudgets': 'SAB',
            'safetybudgettransactions': 'SBT',
            'SafetyBudgetTransactions': 'SBT',

            // ?????? ?????? ???????
            'safetyperformancekpis': 'SPK',
            'SafetyPerformanceKPIs': 'SPK',
            'safetyteamkpis': 'STK',
            'SafetyTeamKPIs': 'STK',
            'actiontrackingregister': 'ATR',
            'ActionTrackingRegister': 'ATR',
            'usertasks': 'UTK',
            'UserTasks': 'UTK',
            'userinstructions': 'UIN',
            'UserInstructions': 'UIN',

            // ????? ??????? ?????? ???????
            'safetyhealthmanagement': 'SHM',
            'SafetyHealthManagement': 'SHM',
            'safetyteammembers': 'STM',
            'SafetyTeamMembers': 'STM',
            'safetyorganizationalstructure': 'SOS',
            'SafetyOrganizationalStructure': 'SOS',
            'safetyjobdescriptions': 'SJD',
            'SafetyJobDescriptions': 'SJD',
            'safetyteamattendance': 'STA',
            'SafetyTeamAttendance': 'STA',
            'safetyteamleaves': 'STL',
            'SafetyTeamLeaves': 'STL',
            'safetyteamtasks': 'STT',
            'SafetyTeamTasks': 'STT',

            // ????? ?????????
            'violationtypes': 'VTY',
            'ViolationTypes': 'VTY',
            'violation_types_db': 'VTY',
            'Violation_Types_DB': 'VTY',
            'blacklist_register': 'BLR',
            'Blacklist_Register': 'BLR',

            // ??????? ??????
            'ppematrix': 'PPM',
            'PPEMatrix': 'PPM',
            'ppe_stock': 'PPS',
            'PPE_Stock': 'PPS',
            'ppe_transactions': 'PPT',
            'PPE_Transactions': 'PPT',

            // ??????? ???????
            'employeetrainingmatrix': 'ETM',
            'EmployeeTrainingMatrix': 'ETM',
            'contractortrainings': 'CTR',
            'ContractorTrainings': 'CTR',
            'annualtrainingplans': 'ATP',
            'AnnualTrainingPlans': 'ATP',

            // ??????? ??????????
            'auditlog': 'AUD',
            'AuditLog': 'AUD',
            'useractivitylog': 'UAL',
            'UserActivityLog': 'UAL',
            'notifications': 'NOT',
            'Notifications': 'NOT',
            'incidentnotifications': 'INO',
            'IncidentNotifications': 'INO',

            // ???????
            'form_settings_db': 'FSD',
            'Form_Settings_DB': 'FSD',
            'aiassistantsettings': 'AIA',
            'AIAssistantSettings': 'AIA',
            'userailog': 'UAI',
            'UserAILog': 'UAI',
            'safetyhealthmanagementsettings': 'SHS',
            'SafetyHealthManagementSettings': 'SHS',
            'actiontrackingsettings': 'ATS',
            'ActionTrackingSettings': 'ATS'
        };

        return prefixMap[moduleName] || 'ID';
    },

    /**
     * ????? ???? ?????? ???????? SHA-256
     */
    async hashPassword(password) {
        if (!password) return '';
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * ?????? ?? ???? ?????? (??????? ??? - ????? ??? ???? ??????)
     */
    async verifyPassword(password, storedPassword) {
        if (!password || !storedPassword) return false;
        // ?????? ????? ??????? ??? - ?? ??? ???? ??????
        if (!this.isSha256Hex(storedPassword)) {
            Utils.safeWarn('?? ?????? ?????? ?? ???? ???? ??? ????? - ??????');
            return false;
        }
        // ?????? ?? ???? ?????? ???????
        const hashedPassword = await this.hashPassword(password);
        return hashedPassword.toLowerCase() === storedPassword.toLowerCase();
    },

    /**
     * ?????? ?? ?? ???? ?????? ?????
     */
    isHashedPassword(password) {
        return password && password.length === 64 && /^[a-f0-9]+$/i.test(password);
    },

    /**
     * Rate Limiting ?????? ??????
     */
    RateLimiter: {
        MAX_ATTEMPTS: 5,
        LOCKOUT_DURATION: 15 * 60 * 1000, // 15 ?????
        ATTEMPT_WINDOW: 60 * 1000, // ????? 1 ?????

        getAttemptsKey(email) {
            return `login_attempts_${email.toLowerCase()}`;
        },

        getLockoutKey(email) {
            return `login_lockout_${email.toLowerCase()}`;
        },

        async checkLockout(email) {
            const lockoutKey = this.getLockoutKey(email);
            try {
                const lockout = JSON.parse(localStorage.getItem(lockoutKey) || '{}');

                if (lockout.locked && Date.now() < lockout.until) {
                    const minutesLeft = Math.ceil((lockout.until - Date.now()) / 60000);
                    throw new Error(`?????? ???? ?????? ???? ??????? ????? ???? ????? ??????. ???? ???????? ??? ${minutesLeft} ?????.`);
                }

                // ????? ????? ??? ????? ?????
                if (lockout.locked && Date.now() >= lockout.until) {
                    localStorage.removeItem(lockoutKey);
                    localStorage.removeItem(this.getAttemptsKey(email));
                }
            } catch (error) {
                // ?? ???? ??? ?? parsing? ???? ???????? ???????
                localStorage.removeItem(lockoutKey);
                localStorage.removeItem(this.getAttemptsKey(email));
            }
        },

        async recordFailedAttempt(email) {
            const key = this.getAttemptsKey(email);
            try {
                const attempts = JSON.parse(localStorage.getItem(key) || '[]');
                const now = Date.now();

                // ????? ????????? ??????? (???? ?? ????? ?????)
                const recentAttempts = attempts.filter(time => now - time < this.ATTEMPT_WINDOW);
                recentAttempts.push(now);

                localStorage.setItem(key, JSON.stringify(recentAttempts));

                // ??? ????? ????? ??? ??????
                if (recentAttempts.length >= this.MAX_ATTEMPTS) {
                    const lockoutKey = this.getLockoutKey(email);
                    localStorage.setItem(lockoutKey, JSON.stringify({
                        locked: true,
                        until: now + this.LOCKOUT_DURATION
                    }));
                    const minutes = Math.ceil(this.LOCKOUT_DURATION / 60000);
                    throw new Error(`?? ??? ?????? ?????? ???? ??????? ????? ???? ????? ??????. ???? ???????? ??? ${minutes} ?????.`);
                }

                const remaining = this.MAX_ATTEMPTS - recentAttempts.length;
                if (remaining > 0) {
                    throw new Error(`???? ?????? ??? ?????. ??????? ??????: ${remaining}`);
                }
            } catch (error) {
                // ??? ??? ????? ?? recordFailedAttempt ????? ?????
                if (error.message.includes('???') || error.message.includes('??????')) {
                    throw error;
                }
                // ???? ???? ????? ????????
                localStorage.setItem(key, JSON.stringify([Date.now()]));
                throw new Error(`???? ?????? ??? ?????. ??????? ??????: ${this.MAX_ATTEMPTS - 1}`);
            }
        },

        async clearAttempts(email) {
            localStorage.removeItem(this.getAttemptsKey(email));
            localStorage.removeItem(this.getLockoutKey(email));
        }
    },

    /**
     * ??? ??????? ????????
     */
    FileValidator: {
        ALLOWED_MIME_TYPES: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'application/vnd.ms-excel'
        ],

        ALLOWED_EXTENSIONS: [
            '.jpg', '.jpeg', '.png', '.gif', '.webp',
            '.pdf',
            '.xlsx', '.xls',
            '.docx', '.doc'
        ],

        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

        // Magic Bytes ?????? ?? ??? ????? ??????
        FILE_SIGNATURES: {
            'image/jpeg': [0xFF, 0xD8, 0xFF],
            'image/png': [0x89, 0x50, 0x4E, 0x47],
            'image/gif': [0x47, 0x49, 0x46, 0x38],
            'application/pdf': [0x25, 0x50, 0x44, 0x46]
        },

        async validateFile(file) {
            // 1. ??? ??? ?????
            if (file.size > this.MAX_FILE_SIZE) {
                throw new Error(`??? ????? ???? ????. ???? ??????: ${Math.round(this.MAX_FILE_SIZE / 1024 / 1024)}MB`);
            }

            // 2. ??? ????????
            const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            if (!this.ALLOWED_EXTENSIONS.includes(extension)) {
                throw new Error(`?????? ????? ??? ?????: ${extension}. ??????? ????????: ${this.ALLOWED_EXTENSIONS.join(', ')}`);
            }

            // 3. ??? ??? MIME
            if (file.type && !this.ALLOWED_MIME_TYPES.includes(file.type)) {
                throw new Error(`??? ????? ??? ?????: ${file.type}`);
            }

            // 4. ??? ??? ????? (??? ????? ?????)
            if (this.isDangerousFileName(file.name)) {
                throw new Error('??? ????? ??? ???. ???? ??????? ??? ??? ????');
            }

            // 5. ??? Magic Bytes (??????? - ????? ???? PDF ???)
            if (file.type && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
                try {
                    const arrayBuffer = await file.slice(0, 4).arrayBuffer();
                    const bytes = new Uint8Array(arrayBuffer);
                    const mimeType = this.detectMimeTypeFromBytes(bytes);

                    if (mimeType && mimeType !== file.type) {
                        throw new Error('??? ????? ?????? ?? ????? ????? ????? ??????');
                    }
                } catch (error) {
                    // ??? ??? ?????? ???? ?????? (???? ?? ???? ??? ????)
                    Utils.safeWarn('?????: ??? ??? ????? ?????:', error);
                }
            }

            return true;
        },

        detectMimeTypeFromBytes(bytes) {
            for (const [mimeType, signature] of Object.entries(this.FILE_SIGNATURES)) {
                if (signature.every((byte, index) => bytes[index] === byte)) {
                    return mimeType;
                }
            }
            return null;
        },

        isDangerousFileName(fileName) {
            const dangerousPatterns = [
                /\.\./,           // Path traversal
                /[<>:"|?*]/,      // Invalid characters
                /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Reserved names (Windows)
                /\.(exe|bat|cmd|sh|ps1|js|vbs)$/i // Executable extensions
            ];

            return dangerousPatterns.some(pattern => pattern.test(fileName));
        }
    },

    /**
     * ????? ????? ??? ??????? ????????
     * @param {string|Error} error - ????? ????? ?? ???? ?????
     * @param {string} defaultMessage - ??????? ?????????? ??? ?? ??? ?????? ??? ??? ?????
     * @returns {object} - ???? ????? ??? message ? recommendation
     */
    formatBackendError(error, defaultMessage = '??? ??? ?? ??????? ????????') {
        const errorMessage = error?.message || error?.toString() || String(error || '');
        let message = defaultMessage;
        let recommendation = '???? ?? ??????? Google Integration ?????? ????????';

        // ?????? ?? ??? ????? ?????? ???????
        if (errorMessage.includes('?????? ??????? ??? ????') ||
            errorMessage.includes('??? ?????') ||
            errorMessage.includes('??? ????')) {
            message = '?????? ??????? ??? ?????';
            recommendation = '???? ????? ?????? ??????? ?? ????????? ?????? ???? ??????';
        } else if (errorMessage.includes('????') && (errorMessage.includes('??? ????') || errorMessage.includes('??? ????'))) {
            message = '???? ?????? ??????? ??? ???? ?? ??? ????';
            recommendation = '??? ?? ????? ???? ?????? ?? /exec (????: https://script.google.com/macros/s/.../exec)';
        } else if (errorMessage.includes('Timeout') ||
            errorMessage.includes('????? ????') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('timed out')) {
            message = '????? ???? ??????? ???????';
            recommendation = '???? ??:\n1. ????? ????????\n2. ?? ?????? ??????? ????? ??????\n3. ??? ???? ???? ??? ??????';
        } else if (errorMessage.includes('Failed to fetch') ||
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('CORS') ||
            errorMessage.includes('Network request failed')) {
            message = '??? ??????? ???????';
            recommendation = '???? ??:\n1. ????? ????????\n2. ???? ?????? ??????? ????\n3. ?? ?????? ????? ??????';
        } else if (errorMessage.includes('??? ????? ??') ||
            errorMessage.includes('Action not recognized') ||
            errorMessage.includes('ACTION_NOT_RECOGNIZED')) {
            message = errorMessage; // ??????? ??????? ????????? ?? ??????
            recommendation = '???? ?? ?? ????? ?????? ???? ??????? ?? ????? ???????';
        } else if (errorMessage.includes('??? ???????') ||
            errorMessage.includes('Connection failed')) {
            message = errorMessage.includes('??? ???????') ? errorMessage : '??? ??????? ????????';
            recommendation = '???? ??:\n1. ??????? Google Integration\n2. ????? ????????\n3. ?? ?????? ??????? ????? ??????';
        } else if (errorMessage.trim() !== '') {
            // ??? ???? ??????? ?????? ???????? ??? ??
            message = errorMessage;
        }

        return { message, recommendation };
    },

    /**
     * ??? ????? ?????
     * @param {string} title - ????? ???????
     * @param {string} message - ????? ???????
     * @param {string} confirmText - ?? ?? ???????
     * @param {string} cancelText - ?? ?? ???????
     * @returns {Promise<boolean>} - true ??? ?? ???????? false ??? ?? ???????
     */
    confirmDialog(title, message, confirmText = '?????', cancelText = '?????') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.style.zIndex = '10001';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3 class="modal-title">${Utils.escapeHTML(title)}</h3>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div style="text-align: right; direction: rtl; padding: 1rem 0;">
                            <p style="white-space: pre-line; line-height: 1.6;">${Utils.escapeHTML(message)}</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" id="confirm-dialog-cancel">
                            <i class="fas fa-times ml-2"></i>
                            ${Utils.escapeHTML(cancelText)}
                        </button>
                        <button class="btn-primary" id="confirm-dialog-confirm">
                            <i class="fas fa-check ml-2"></i>
                            ${Utils.escapeHTML(confirmText)}
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const confirmBtn = modal.querySelector('#confirm-dialog-confirm');
            const cancelBtn = modal.querySelector('#confirm-dialog-cancel');
            const closeBtn = modal.querySelector('.modal-close');

            const closeModal = (result) => {
                modal.style.animation = 'fadeOut 0.2s ease';
                setTimeout(() => {
                    modal.remove();
                    resolve(result);
                }, 200);
            };

            confirmBtn.addEventListener('click', () => closeModal(true));
            cancelBtn.addEventListener('click', () => closeModal(false));
            closeBtn.addEventListener('click', () => closeModal(false));

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(false);
                }
            });

            // ????? ??? ????? ??? ESC
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    closeModal(false);
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);
        });
    },

    /**
     * Debounce — ????? ????? ?????? ??? ????? ????????? ??????? (????? ?????).
     */
    debounce(fn, delay = 300) {
        let timer = null;
        return (...args) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                fn(...args);
                timer = null;
            }, delay);
        };
    }
};

// ===== Constants =====
const DEFAULT_PERIODIC_INSPECTION_CATEGORIES = [
    {
        id: 'default_periodic_vehicle',
        name: '??? ?????? ????????',
        description: '?????? ?????? ?????? ???????? ????????? ???????? ???????.',
        defaultFrequency: 'monthly',
        defaultReminderDays: 5,
        isDefault: true,
        checklist: [
            { id: 'default_periodic_vehicle_1', label: '?????? ??????? ???????', required: true },
            { id: 'default_periodic_vehicle_2', label: '??? ???????? ?????? ??????', required: true },
            { id: 'default_periodic_vehicle_3', label: '???? ????? ????????? ?????? ????', required: false }
        ]
    },
    {
        id: 'default_periodic_forklift',
        name: '??? ???????? ??????? (?????????)',
        description: '???? ?? ????? ?????? ???????? ??????? ?? ????? ?????.',
        defaultFrequency: 'weekly',
        defaultReminderDays: 3,
        isDefault: true,
        checklist: [
            { id: 'default_periodic_forklift_1', label: '????? ???? ??????? ????????', required: true },
            { id: 'default_periodic_forklift_2', label: '????? ????? ????? ???? ???? ??????', required: true },
            { id: 'default_periodic_forklift_3', label: '??? ???????? ?? ?????? ??????????', required: true }
        ]
    },
    {
        id: 'default_periodic_pallet',
        name: '??? ?????? ????? ??????????',
        description: '?????? ?????? ?????? ????? ??????? ??????????.',
        defaultFrequency: 'weekly',
        defaultReminderDays: 3,
        isDefault: true,
        checklist: [
            { id: 'default_periodic_pallet_1', label: '????? ???????? ??????', required: true },
            { id: 'default_periodic_pallet_2', label: '???? ?? ????? ??????? ????????', required: true },
            { id: 'default_periodic_pallet_3', label: '????? ??????? ???? ???? ???? ????', required: false }
        ]
    },
    {
        id: 'default_periodic_emergency_light',
        name: '??? ?????? ???????',
        description: '?????? ?? ??? ?????? ??????? ??????? ????????? ????????.',
        defaultFrequency: 'monthly',
        defaultReminderDays: 5,
        isDefault: true,
        checklist: [
            { id: 'default_periodic_emergency_light_1', label: '????? ???? ?????? ??????? ?? ???????', required: true },
            { id: 'default_periodic_emergency_light_2', label: '???? ???????? ??????? ?????', required: true },
            { id: 'default_periodic_emergency_light_3', label: '????? ??? ?????? ????? ?? ?????', required: false }
        ]
    },
    {
        id: 'default_periodic_ladders',
        name: '??? ??????? ??????? ?????????',
        description: '???? ??????? ?????? ?? ??????? ????????? ??????????.',
        defaultFrequency: 'quarterly',
        defaultReminderDays: 10,
        isDefault: true,
        checklist: [
            { id: 'default_periodic_ladders_1', label: '???? ????? ???? ???? ??????', required: true },
            { id: 'default_periodic_ladders_2', label: '????? ??????? ???? ???? ??? ?? ??????', required: true },
            { id: 'default_periodic_ladders_3', label: '????? ????? ????? ?? ?????? ?? ??????', required: false }
        ]
    }
];

const DEFAULT_VIOLATION_TYPES = [
    {
        id: 'default_violation_1',
        name: '??? ??????? ????? ???????',
        description: '',
        fineAmount: 0,
        isDefault: true,
        order: 1
    },
    {
        id: 'default_violation_2',
        name: '??? ????? ??????? ???????',
        description: '',
        fineAmount: 0,
        isDefault: true,
        order: 2
    },
    {
        id: 'default_violation_3',
        name: '??????? ? ??????? ????????',
        description: '',
        fineAmount: 0,
        isDefault: true,
        order: 3
    },
    {
        id: 'default_violation_4',
        name: '??? ?????? ??? ????? ???',
        description: '',
        fineAmount: 0,
        isDefault: true,
        order: 4
    },
    {
        id: 'default_violation_5',
        name: '????',
        description: '',
        fineAmount: 0,
        isDefault: true,
        order: 5
    }
];

// ===== Violation Types Manager =====
const ViolationTypesManager = {
    ensureInitialized() {
        if (!AppState || !AppState.appData) return [];

        const now = new Date().toISOString();
        const existing = Array.isArray(AppState.appData.violationTypes)
            ? AppState.appData.violationTypes.slice()
            : [];
        const backendEnabled = (typeof Backend !== 'undefined'
            && typeof Backend._isBackendRpcConfigured === 'function'
            && Backend._isBackendRpcConfigured());
        const hasViolationTypesSynced = !!(AppState?.syncMeta?.sheets && AppState.syncMeta.sheets.ViolationTypes);

        // ??? ???? ??????? ????? ??? ?? ??? ????? ViolationTypes ???? ?? ???? ??????????? ??? ?? ???? ??? ???????? ???????? ??? ???????
        if (backendEnabled && !hasViolationTypesSynced && existing.length === 0) {
            AppState.appData.violationTypes = [];
            return [];
        }
        const normalized = [];
        const seenNames = new Map();
        const seenIds = new Set();
        let shouldSave = false;

        const normalizeItem = (item, index) => {
            if (!item) return null;

            if (typeof item === 'string') {
                shouldSave = true;
                return {
                    id: Utils.generateId('VTYPE'),
                    name: item.trim(),
                    description: '',
                    isDefault: false,
                    createdAt: now,
                    updatedAt: now
                };
            }

            const name = (item.name || item.label || '').trim();
            if (!name) return null;

            let id = item.id && typeof item.id === 'string' && item.id.trim() !== ''
                ? item.id.trim()
                : '';
            if (!id) {
                id = Utils.generateId('VTYPE');
                shouldSave = true;
            }

            const description = (item.description || item.notes || '').trim();
            const parsedFineAmount = Number(item.fineAmount ?? item.defaultFineAmount ?? 0);
            const fineAmount = Number.isFinite(parsedFineAmount) && parsedFineAmount >= 0 ? parsedFineAmount : 0;
            const createdAt = item.createdAt || now;
            const updatedAt = item.updatedAt || now;
            const isDefault = item.isDefault === true;
            const order = typeof item.order === 'number' ? item.order : undefined;

            return {
                id,
                name,
                description,
                fineAmount,
                isDefault,
                createdAt,
                updatedAt,
                order
            };
        };

        existing.forEach((item, index) => {
            const normalizedItem = normalizeItem(item, index);
            if (!normalizedItem) {
                shouldSave = true;
                return;
            }

            const lowerName = normalizedItem.name.toLowerCase();
            if (seenNames.has(lowerName)) {
                shouldSave = true;
                return;
            }

            if (seenIds.has(normalizedItem.id)) {
                normalizedItem.id = Utils.generateId('VTYPE');
                shouldSave = true;
            }

            seenNames.set(lowerName, normalizedItem);
            seenIds.add(normalizedItem.id);
            normalized.push(normalizedItem);
        });

        // ???? ??????? ?????????? ??? ????? ??? ??? ??????? ?????? (????? ?? ???? ?? ????? ??????)
        if (normalized.length === 0) {
            DEFAULT_VIOLATION_TYPES.forEach(defaultType => {
                normalized.push({
                    id: defaultType.id,
                    name: defaultType.name,
                    description: defaultType.description || '',
                    fineAmount: Number(defaultType.fineAmount) || 0,
                    isDefault: true,
                    createdAt: now,
                    updatedAt: now,
                    order: defaultType.order
                });
                seenNames.set(defaultType.name.toLowerCase(), normalized[normalized.length - 1]);
                seenIds.add(defaultType.id);
                shouldSave = true;
            });
        }

        normalized.sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : 9999;
            const orderB = typeof b.order === 'number' ? b.order : 9999;
            if (orderA !== orderB) return orderA - orderB;
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name, 'ar');
        });

        AppState.appData.violationTypes = normalized;

        if (shouldSave) {
            // ??????? window.DataManager ????? ??? ?? ??? DataManager ?????? ??????
            const dm = (typeof window !== 'undefined' && window.DataManager) ||
                (typeof DataManager !== 'undefined' && DataManager);
            if (dm && typeof dm.save === 'function') {
                dm.save();
            }
        }

        this.ensureViolationsTypeIds(normalized);
        return normalized;
    },

    ensureViolationsTypeIds(types = null) {
        const violations = AppState?.appData?.violations;
        if (!Array.isArray(violations) || violations.length === 0) return;

        const list = Array.isArray(types) ? types : (AppState.appData.violationTypes || []);
        const typeByName = new Map(list.map(type => [type.name.toLowerCase(), type]));
        let changed = false;

        violations.forEach(violation => {
            if (!violation) return;
            const currentId = violation.violationTypeId;
            const currentName = (violation.violationType || '').trim();
            if (currentId) return;
            if (!currentName) return;
            const match = typeByName.get(currentName.toLowerCase());
            if (match) {
                violation.violationTypeId = match.id;
                changed = true;
            }
        });

        if (changed) {
            // ??????? window.DataManager ????? ??? ?? ??? DataManager ?????? ??????
            const dm = (typeof window !== 'undefined' && window.DataManager) ||
                (typeof DataManager !== 'undefined' && DataManager);
            if (dm && typeof dm.save === 'function') {
                dm.save();
            }
        }
    },

    getAll() {
        return this.ensureInitialized().slice();
    },

    getTypeById(id) {
        if (!id) return null;
        return (AppState.appData.violationTypes || []).find(type => type.id === id) || null;
    },

    getTypeByName(name) {
        if (!name) return null;
        const lower = name.trim().toLowerCase();
        return (AppState.appData.violationTypes || []).find(type => type.name.toLowerCase() === lower) || null;
    },

    countUsage(typeOrId) {
        const violations = AppState?.appData?.violations;
        if (!Array.isArray(violations)) return 0;

        let target = null;
        if (typeof typeOrId === 'string') {
            target = this.getTypeById(typeOrId) || this.getTypeByName(typeOrId);
        } else {
            target = typeOrId;
        }
        if (!target) return 0;

        const lowerName = target.name.toLowerCase();
        return violations.reduce((count, violation) => {
            if (!violation) return count;
            if (violation.violationTypeId === target.id) return count + 1;
            const name = (violation.violationType || '').trim().toLowerCase();
            if (!violation.violationTypeId && name === lowerName) return count + 1;
            return count;
        }, 0);
    },

    addType({ name, description = '', fineAmount = 0 } = {}) {
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            throw new Error('???? ????? ??? ??? ????????');
        }

        this.ensureInitialized();

        if (this.getTypeByName(trimmedName)) {
            throw new Error('??? ???????? ????? ??????');
        }

        const now = new Date().toISOString();
        const parsedFineAmount = Number(fineAmount);
        const newType = {
            id: Utils.generateId('VTYPE'),
            name: trimmedName,
            description: (description || '').trim(),
            fineAmount: Number.isFinite(parsedFineAmount) && parsedFineAmount >= 0 ? parsedFineAmount : 0,
            isDefault: false,
            createdAt: now,
            updatedAt: now
        };

        AppState.appData.violationTypes.push(newType);
        this.sortTypes();
        this.persist(true);
        return newType;
    },

    updateType(id, { name, description, fineAmount, isDefault } = {}) {
        if (!id) {
            throw new Error('???? ??? ???????? ??? ????');
        }

        this.ensureInitialized();
        const type = this.getTypeById(id);

        if (!type) {
            throw new Error('??? ???????? ??? ?????');
        }

        const newName = (name ?? type.name).trim();
        if (!newName) {
            throw new Error('?? ???? ?? ???? ??? ????? ??????');
        }

        const lowerOld = type.name.toLowerCase();
        const lowerNew = newName.toLowerCase();
        if (lowerNew !== lowerOld) {
            const existing = this.getTypeByName(newName);
            if (existing && existing.id !== id) {
                throw new Error('???? ??? ??? ???? ?????');
            }
        }

        const previousName = type.name;
        const parsedFineAmount = Number(fineAmount);
        type.name = newName;
        type.description = (description ?? type.description).trim();
        if (fineAmount !== undefined) {
            type.fineAmount = Number.isFinite(parsedFineAmount) && parsedFineAmount >= 0 ? parsedFineAmount : 0;
        } else if (!Number.isFinite(Number(type.fineAmount)) || Number(type.fineAmount) < 0) {
            type.fineAmount = 0;
        }
        if (typeof isDefault === 'boolean') {
            type.isDefault = isDefault;
        }
        type.updatedAt = new Date().toISOString();

        const renamed = this.propagateTypeRename(type.id, previousName, type.name);
        this.sortTypes();
        this.persist(true);
        if (renamed) {
            this.syncViolations();
        }
        return type;
    },

    deleteType(id) {
        if (!id) {
            throw new Error('???? ??? ???????? ??? ????');
        }

        this.ensureInitialized();
        const index = (AppState.appData.violationTypes || []).findIndex(type => type.id === id);
        if (index === -1) {
            throw new Error('??? ???????? ??? ?????');
        }

        const removed = AppState.appData.violationTypes.splice(index, 1)[0];
        const violations = AppState?.appData?.violations || [];
        let changedViolations = false;

        violations.forEach(violation => {
            if (!violation) return;
            if (violation.violationTypeId === id) {
                violation.violationTypeId = '';
                if (!violation.violationType) {
                    violation.violationType = removed.name;
                }
                changedViolations = true;
            }
        });

        this.persist(true);
        if (changedViolations) {
            this.syncViolations();
        }
        return removed;
    },

    propagateTypeRename(typeId, oldName, newName) {
        const violations = AppState?.appData?.violations || [];
        if (!Array.isArray(violations) || violations.length === 0) return false;

        const lowerOld = (oldName || '').toLowerCase();
        let changed = false;

        violations.forEach(violation => {
            if (!violation) return;
            const currentName = (violation.violationType || '').trim();
            if (violation.violationTypeId === typeId) {
                if (currentName !== newName) {
                    violation.violationType = newName;
                    changed = true;
                }
            } else if (!violation.violationTypeId && currentName && currentName.toLowerCase() === lowerOld) {
                violation.violationType = newName;
                violation.violationTypeId = typeId;
                changed = true;
            }
        });

        return changed;
    },

    sortTypes() {
        const list = AppState?.appData?.violationTypes;
        if (!Array.isArray(list)) return;
        list.sort((a, b) => {
            const orderA = typeof a.order === 'number' ? a.order : 9999;
            const orderB = typeof b.order === 'number' ? b.order : 9999;
            if (orderA !== orderB) return orderA - orderB;
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;
            return a.name.localeCompare(b.name, 'ar');
        });
    },

    persist(syncSheets = true) {
        // ??????? window.DataManager ????? ??? ?? ??? DataManager ?????? ??????
        const dm = (typeof window !== 'undefined' && window.DataManager) ||
            (typeof DataManager !== 'undefined' && DataManager);
        if (dm && typeof dm.save === 'function') {
            dm.save();
        }

        if (syncSheets && typeof Backend !== 'undefined' && typeof Backend.sendRequest === 'function') {
            // ??? ???? ??????? ??????? ?? ViolationTypes ??? ?????? (diff + ??? ???? ?????)
            Backend.sendRequest({
                action: 'saveViolationTypes',
                data: {
                    violationTypes: AppState.appData.violationTypes || [],
                    userData: AppState.currentUser || {}
                }
            }).catch(() => { });
        }
    },

    syncViolations() {
        if (typeof Backend !== 'undefined' && typeof Backend.autoSave === 'function') {
            Backend.autoSave('Violations', AppState.appData.violations).catch(() => { });
        }
    }
};

// ===== QR Code Helper =====
const QRCode = (() => {
    const existing = (typeof window !== 'undefined' && window.QRCode && typeof window.QRCode.generate === 'function')
        ? window.QRCode
        : (typeof globalThis !== 'undefined' && globalThis.QRCode && typeof globalThis.QRCode.generate === 'function')
            ? globalThis.QRCode
            : null;
    const FALLBACK_ENDPOINT = 'https://api.qrserver.com/v1/create-qr-code/';
    const MIN_SIZE = 80;
    const MAX_SIZE = 600;

    function clampSize(size) {
        const parsed = Number(size) || 0;
        return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(parsed)));
    }

    function tryExisting(data, size) {
        if (!existing) return null;
        try {
            const result = existing.generate(data, size);
            if (result) {
                return result;
            }
        } catch (error) {
            Utils.safeWarn('?? ??? ??????? ???? QR ??????:', error);
        }
        return null;
    }

    function tryQrcodeLibrary(data, size) {
        if (typeof qrcode !== 'function') return null;
        try {
            const qr = qrcode(0, 'M');
            qr.addData(String(data));
            qr.make();
            const moduleCount = typeof qr.getModuleCount === 'function' ? qr.getModuleCount() : 0;
            const cellSize = moduleCount ? Math.max(1, Math.floor(size / moduleCount)) : Math.max(2, Math.floor(size / 25));
            return qr.createDataURL(cellSize, 2);
        } catch (error) {
            Utils.safeWarn('?? ??? ??????? ????? qrcode:', error);
        }
        return null;
    }

    function buildFallbackUrl(data, size) {
        const encoded = encodeURIComponent(String(data));
        return `${FALLBACK_ENDPOINT}?size=${size}x${size}&data=${encoded}`;
    }

    function generate(data, size = 200) {
        if (!data) return null;
        const clampedSize = clampSize(size);

        const trimmed = String(data).trim();
        if (!trimmed) return null;

        const existingResult = tryExisting(trimmed, clampedSize);
        if (existingResult) return existingResult;

        const libraryResult = tryQrcodeLibrary(trimmed, clampedSize);
        if (libraryResult) return libraryResult;

        return buildFallbackUrl(trimmed, clampedSize);
    }

    return { generate };
})();

if (typeof window !== 'undefined') {
    window.QRCode = QRCode;
}

// ===== Notification System =====
// ????? Notification ?????? ??? (global) ????? ?????? ????? ???????
window.Notification = {
    // ????? ????????? ??????
    activeNotifications: new Map(),

    /**
     * ??? ????? ???? ?? ??? ???????? ???????? ????????
     * @param {string|object} messageOrOptions - ??????? ?? ???? ????????
     * @param {string} type - ??? ??????? (info, success, warning, error, emergency)
     * @param {number} duration - ??? ????? ??????? ????? (0 = ???? ??? ??????? ??????)
     * @param {object} options - ?????? ?????? (title, description, actions, priority, persistent, sound)
     */
    show(messageOrOptions, type = 'info', duration = 3000, options = {}) {
        // ??? ????????: show(message, type, duration) ? show({message, type, ...})
        let config = {};
        if (typeof messageOrOptions === 'string') {
            config = {
                message: messageOrOptions,
                type: type,
                duration: duration,
                ...options
            };
        } else {
            config = {
                message: messageOrOptions.message || '',
                type: messageOrOptions.type || type,
                duration: messageOrOptions.duration !== undefined ? messageOrOptions.duration : duration,
                title: messageOrOptions.title,
                description: messageOrOptions.description,
                actions: messageOrOptions.actions || [],
                priority: messageOrOptions.priority || 'normal', // normal, high, critical
                persistent: messageOrOptions.persistent || false,
                sound: messageOrOptions.sound !== false, // true by default for critical
                onClick: messageOrOptions.onClick,
                appendTo: messageOrOptions.appendTo,
                ...options
            };
        }

        let container = document.getElementById('notification-container');
        if (config.appendTo) {
            const el = typeof config.appendTo === 'string'
                ? document.querySelector(config.appendTo)
                : config.appendTo;
            if (el && el.nodeType === 1) container = el;
        }
        if (!container) {
            console.warn('?? notification-container ??? ?????');
            return null;
        }

        // ????? ??? ????? ????? ??? ????????
        if (config.priority === 'critical' && !config.persistent) {
            config.duration = config.duration || 10000; // 10 ????? ????????? ??????
        } else if (config.priority === 'high' && !config.persistent) {
            config.duration = config.duration || 6000; // 6 ????? ????????? ???????
        } else if (!config.persistent && config.duration === undefined) {
            config.duration = 3000; // 3 ????? ?????????
        }

        // ????? ????? ????????? ??????
        if (config.sound && (config.priority === 'critical' || config.priority === 'high' || config.type === 'emergency')) {
            this.playNotificationSound(config.priority);
        }

        // ????? ???? ???????
        const notificationId = 'notification-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const notification = document.createElement('div');
        notification.id = notificationId;
        notification.className = `notification notification-${config.type} notification-priority-${config.priority}`;
        notification.setAttribute('data-priority', config.priority);

        // ????? ????? ????? ????????? ??????
        if (config.priority === 'critical') {
            notification.classList.add('notification-critical-pulse');
        }

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle',
            emergency: 'fa-bell'
        };

        const icon = icons[config.type] || icons.info;

        // ???? ????? ???????
        let contentHTML = '';

        if (config.title) {
            contentHTML += `<div class="notification-title">${Utils.escapeHTML(config.title)}</div>`;
        }

        contentHTML += `<div class="notification-message">${Utils.escapeHTML(config.message)}</div>`;

        if (config.description) {
            contentHTML += `<div class="notification-description">${Utils.escapeHTML(config.description)}</div>`;
        }

        // ????? ??????? ??? ???? ??????
        let actionsHTML = '';
        if (config.actions && config.actions.length > 0) {
            actionsHTML = '<div class="notification-actions">';
            config.actions.forEach((action, index) => {
                const actionClass = action.primary ? 'notification-action-primary' : 'notification-action-secondary';
                actionsHTML += `<button class="notification-action ${actionClass}" data-action-index="${index}">${Utils.escapeHTML(action.label)}</button>`;
            });
            actionsHTML += '</div>';
        }

        notification.innerHTML = `
            <div class="notification-icon-wrapper">
                <i class="fas ${icon} notification-icon"></i>
            </div>
            <div class="notification-content">
                ${contentHTML}
                ${actionsHTML}
            </div>
            ${config.persistent ? '<button class="notification-close" aria-label="?????">&times;</button>' : ''}
        `;

        // ????? ?????? ???????
        if (config.onClick) {
            notification.style.cursor = 'pointer';
            notification.addEventListener('click', (e) => {
                if (!e.target.closest('.notification-action') && !e.target.closest('.notification-close')) {
                    config.onClick(notificationId);
                }
            });
        }

        // ????? ?????? ??????? ???????
        if (config.actions && config.actions.length > 0) {
            notification.querySelectorAll('.notification-action').forEach((btn, index) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = config.actions[index];
                    if (action.onClick) {
                        action.onClick(notificationId);
                    }
                    if (action.dismiss !== false) {
                        this.dismiss(notificationId);
                    }
                });
            });
        }

        // ????? ?? ??????? ????????? ???????
        if (config.persistent) {
            const closeBtn = notification.querySelector('.notification-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.dismiss(notificationId);
                });
            }
        }

        // ????? ??????? ??? ???????
        container.appendChild(notification);

        // ????? ??? ??????? ??????
        this.activeNotifications.set(notificationId, {
            element: notification,
            config: config,
            timeoutId: null
        });

        // ????? ????? ??????
        setTimeout(() => {
            notification.classList.add('notification-visible');
        }, 10);

        // ????? ??????? ??? ?? ??? ??????
        if (!config.persistent && config.duration > 0) {
            const timeoutId = setTimeout(() => {
                this.dismiss(notificationId);
            }, config.duration);

            const notificationData = this.activeNotifications.get(notificationId);
            if (notificationData) {
                notificationData.timeoutId = timeoutId;
            }
        }

        return notificationId;
    },

    /**
     * ????? ????? ????
     */
    dismiss(notificationId) {
        const notificationData = this.activeNotifications.get(notificationId);
        if (!notificationData) return;

        const { element, timeoutId } = notificationData;

        // ????? ??? timeout ??? ??? ???????
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        // ????? ????? ???????
        element.classList.add('notification-dismissing');

        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
            this.activeNotifications.delete(notificationId);
        }, 300);
    },

    /**
     * ????? ???? ?????????
     */
    dismissAll() {
        this.activeNotifications.forEach((data, id) => {
            this.dismiss(id);
        });
    },

    /**
     * ????? ??? ???????
     */
    playNotificationSound(priority = 'normal') {
        try {
            // ??????? Web Audio API ?????? ??? ????
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // ?????? ?????? ??? ????????
            const frequencies = {
                critical: [800, 600, 800, 600], // ???? ?????? ?????
                high: [600, 500],
                normal: [400]
            };

            const freq = frequencies[priority] || frequencies.normal;
            let currentTime = audioContext.currentTime;

            freq.forEach((f, index) => {
                oscillator.frequency.setValueAtTime(f, currentTime);
                gainNode.gain.setValueAtTime(0.3, currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.2);
                currentTime += 0.2;
            });

            oscillator.start(currentTime);
            oscillator.stop(currentTime + 0.1);
        } catch (error) {
            // ?? ???? ??? Web Audio API? ???? ??????? ??? HTML5
            console.debug('Web Audio API ??? ????:', error);
        }
    },

    /**
     * ????? ???? ???? ????????? ??????
     */
    emergency(options) {
        return this.show({
            ...options,
            type: 'emergency',
            priority: 'critical',
            persistent: options.persistent !== false, // ???? ????????? ???????
            sound: true,
            duration: 0 // ?? ????? ????????
        });
    },

    // ???? ???????? ???????
    success(message, options = {}) {
        try {
            if (this && typeof this.show === 'function') {
                return this.show({ message, type: 'success', ...options });
            }
        } catch (error) {
            console.warn('?? ??? ?? Notification.success:', error);
        }
    },

    error(message, options = {}) {
        try {
            if (this && typeof this.show === 'function') {
                return this.show({ message, type: 'error', priority: 'high', ...options });
            }
        } catch (error) {
            console.warn('?? ??? ?? Notification.error:', error);
        }
    },

    warning(message, options = {}) {
        try {
            if (this && typeof this.show === 'function') {
                return this.show({ message, type: 'warning', priority: 'high', ...options });
            }
        } catch (error) {
            console.warn('?? ??? ?? Notification.warning:', error);
        }
    },

    info(message, options = {}) {
        try {
            if (this && typeof this.show === 'function') {
                return this.show({ message, type: 'info', ...options });
            }
        } catch (error) {
            console.warn('?? ??? ?? Notification.info:', error);
        }
    }
};

// ===== Loading System =====
const Loading = {
    normalizeOverlayPresentation(overlay, isVisible) {
        if (!overlay) return;

        const important = 'important';
        const currentDir = (document && document.documentElement && document.documentElement.dir === 'ltr') ? 'ltr' : 'rtl';

        overlay.style.setProperty('position', 'fixed', important);
        overlay.style.setProperty('inset', '0', important);
        overlay.style.setProperty('top', '0', important);
        overlay.style.setProperty('right', '0', important);
        overlay.style.setProperty('bottom', '0', important);
        overlay.style.setProperty('left', '0', important);
        overlay.style.setProperty('width', '100vw', important);
        overlay.style.setProperty('height', '100vh', important);
        overlay.style.setProperty('min-height', '100vh', important);
        overlay.style.setProperty('z-index', '999999', important);
        overlay.style.setProperty('transform', 'none', important);
        overlay.style.setProperty('rotate', 'none', important);
        overlay.style.setProperty('writing-mode', 'horizontal-tb', important);
        overlay.style.setProperty('direction', currentDir, important);
        overlay.style.setProperty('display', isVisible ? 'flex' : 'none', important);
        overlay.style.setProperty('visibility', isVisible ? 'visible' : 'hidden', important);
        overlay.style.setProperty('opacity', isVisible ? '1' : '0', important);
        overlay.style.setProperty('pointer-events', isVisible ? 'auto' : 'none', important);
        overlay.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
        overlay.dataset.loadingVisible = isVisible ? '1' : '0';

        const card = overlay.querySelector('.loading-card') || overlay.querySelector('.loading-spinner');
        if (card) {
            card.style.setProperty('transform', 'none', important);
            card.style.setProperty('rotate', 'none', important);
            card.style.setProperty('writing-mode', 'horizontal-tb', important);
            card.style.setProperty('direction', currentDir, important);
            card.style.setProperty('margin', '0 auto', important);
            card.style.setProperty('width', 'min(92vw, 400px)', important);
            card.style.setProperty('max-width', 'min(92vw, 400px)', important);
        }
    },
    currentProgress: 0,
    currentMessage: '',
    defaultMessage: '???? ???????...',

    show(message = '???? ???????...', progress = null) {
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;

        try {
            const isAppActive = document.body && document.body.classList.contains('app-active');
            const normalizedMessage = String(message || '').trim();
            const isGenericMessage = !normalizedMessage || normalizedMessage === this.defaultMessage;
            if (isAppActive && isGenericMessage) {
                return;
            }
        } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }

        try {
            window._hseLoadingSince = Date.now();
        } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }

        this.normalizeOverlayPresentation(overlay, true);
        this.currentMessage = message;

        if (typeof window.EnhancedLoader !== 'undefined') {
            window.EnhancedLoader.init();
            window.EnhancedLoader.loadingState.total = 100;
            window.EnhancedLoader.loadingState.startTime = Date.now();
            window.EnhancedLoader.setMode('loading');
            window.EnhancedLoader.setStatus(message);
            if (progress !== null) {
                window.EnhancedLoader.updateProgress(progress);
            } else {
                window.EnhancedLoader.updateProgress(0);
            }
            return;
        }

        const messageEl = overlay.querySelector('.loading-message') || overlay.querySelector('#loading-status-text');
        if (messageEl) messageEl.textContent = message;
        if (progress !== null) this.setProgress(progress);
    },

    setProgress(percentage, message = null) {
        const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
        this.currentProgress = pct;

        if (typeof window.EnhancedLoader !== 'undefined') {
            window.EnhancedLoader.init();
            window.EnhancedLoader.loadingState.total = 100;
            if (message) {
                window.EnhancedLoader.setStatus(message);
            }
            window.EnhancedLoader.updateProgress(pct, message && pct < 100 ? message : null);
            if (pct >= 100 && message && /????|??/i.test(String(message))) {
                window.EnhancedLoader.setMode('success');
            }
            return;
        }

        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        const fill = overlay.querySelector('.loading-progress-fill') || overlay.querySelector('#loading-progress-bar');
        const text = overlay.querySelector('.loading-progress-text') || overlay.querySelector('#loading-progress-text');
        const messageEl = overlay.querySelector('.loading-message');
        if (message && messageEl) messageEl.textContent = message;
        if (fill) fill.style.width = `${pct}%`;
        if (text) text.textContent = `${Math.round(pct)}%`;
    },

    updateMessage(message) {
        this.currentMessage = message;
        if (typeof window.EnhancedLoader !== 'undefined') {
            window.EnhancedLoader.setStatus(message);
            return;
        }
        const overlay = document.getElementById('loading-overlay');
        if (!overlay) return;
        const messageEl = overlay.querySelector('.loading-message');
        if (messageEl) messageEl.textContent = message;
    },

    hide() {
        const overlay = document.getElementById('loading-overlay');
        if (typeof window.EnhancedLoader !== 'undefined') {
            window.EnhancedLoader.hide();
        }
        if (overlay) {
            this.normalizeOverlayPresentation(overlay, false);
            this.currentProgress = 0;
            this.currentMessage = '';
        }
        try {
            delete window._hseLoadingSince;
        } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }
    }
};

// ===== PDF Templates =====
const PDFTemplates = {
    buildDocument({
        title = '',
        content = '',
        formCode = '',
        createdAt = new Date(),
        updatedAt = null,
        meta = {},
        includeQRCode = true,
        qrData = null
    } = {}) {
        const escape = (value) => {
            if (value === undefined || value === null) return '';
            if (typeof Utils !== 'undefined' && Utils && typeof Utils.escapeHTML === 'function') {
                return Utils.escapeHTML(String(value));
            }
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        };

        const fallbackCompanyName = typeof DEFAULT_COMPANY_NAME !== 'undefined' ? DEFAULT_COMPANY_NAME : 'HSEHub 360';
        const companyNameRaw = AppState?.companySettings?.name || fallbackCompanyName;
        const companySecondaryNameRaw = AppState?.companySettings?.secondaryName || '';
        const companySecondaryNameTrimmed = companySecondaryNameRaw ? String(companySecondaryNameRaw).trim() : '';
        const companyName = escape(companyNameRaw);
        const companySecondaryName = escape(companySecondaryNameTrimmed);
        const companyAddress = escape(AppState?.companySettings?.address || '');
        const contactPhone = escape(AppState?.companySettings?.phone || '');
        const contactEmail = escape(AppState?.companySettings?.email || '');
        const logo = AppState?.companyLogo || '';
        const companyInitials = escape(companyNameRaw.trim().slice(0, 2) || 'HS');

        // ?????? ??? ??????? ???? ??????
        const nameFontSize = AppState?.companySettings?.nameFontSize || 16;
        const secondaryNameFontSize = AppState?.companySettings?.secondaryNameFontSize || 14;
        const secondaryNameColor = AppState?.companySettings?.secondaryNameColor || '#6B7280';

        const generateDate = createdAt ? new Date(createdAt) : new Date();
        const updateDate = updatedAt ? new Date(updatedAt) : generateDate;

        const formatDateTime = (date) => {
            if (!date) return '';
            if (typeof Utils !== 'undefined' && Utils && typeof Utils.formatDateTime === 'function') {
                return Utils.formatDateTime(date, 'ar-EG');
            }
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                const formatted = d.toLocaleString('ar-EG', {
                    hour12: true,
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                // Ensure AM/PM is displayed correctly in Arabic
                return formatted.replace(/?/g, '?').replace(/?/g, '?');
            } catch (error) {
                return escape(date);
            }
        };

        const enhancedContent = (content || '')
            .replace(/<table(?![^>]*class=)/g, '<table class="report-table"')
            .replace(/<ul(?![^>]*class=)/g, '<ul class="report-list"');

        const isDailySafetyTemplate = String(meta?.source || '').trim() === 'DailySafetyCheckList';
        const excludedMetaKeys = ['version', 'releaseDate', 'revisionDate', 'issueDate', 'includeQRCode', 'qrData', 'modifiedAt', 'titleEn', 'titleAr', 'footerLegendHtml', 'compactPdfFooter'];
        const metaRows = Object.entries(meta || {})
            .filter(([key, value]) => {
                if (value === undefined || value === null || value === '') return false;
                if (excludedMetaKeys.includes(key)) return false;
                if (isDailySafetyTemplate && key === 'source') return false;
                return true;
            })
            .map(([key, value]) => `
                <div class="meta-item">
                    <span class="meta-label">${escape(key)}</span>
                    <span class="meta-value">${escape(value)}</span>
                </div>
            `).join('');

        const contactLine = [companyAddress, contactPhone, contactEmail]
            .filter(Boolean)
            .join(' | ');

        // Get version from settings or meta, with fallback
        const defaultVersion = AppState?.companySettings?.formVersion || '1.0';
        const versionDisplay = escape(meta?.version || meta?.revisionNumber || defaultVersion);
        const issueDateSource = meta?.releaseDate || meta?.issueDate || createdAt;
        const revisionDateSource = meta?.revisionDate || meta?.modifiedAt || updatedAt || issueDateSource;
        const issueDateDisplay = issueDateSource ? escape(formatDateTime(issueDateSource)) : '-';
        const revisionDateDisplay = revisionDateSource ? escape(formatDateTime(revisionDateSource)) : '-';

        const metaIncludeQRCode = (meta && Object.prototype.hasOwnProperty.call(meta, 'includeQRCode')) ? Boolean(meta.includeQRCode) : true;
        const shouldRenderQRCode = includeQRCode !== false && metaIncludeQRCode;
        const footerLegendHtml = (typeof meta?.footerLegendHtml === 'string' && meta.footerLegendHtml.trim()) ? meta.footerLegendHtml : '';
        const compactPdfFooter = !!meta?.compactPdfFooter;
        const qrPayloadRaw = qrData != null ? qrData
            : (meta && meta.qrData != null ? meta.qrData
                : `Form: ${formCode || '-'} | Title: ${title || ''} | Company: ${companyNameRaw}`);
        const qrText = typeof qrPayloadRaw === 'string' ? qrPayloadRaw : JSON.stringify(qrPayloadRaw);
        const qrTextForScript = JSON.stringify(qrText);
        const formCodeDisplay = escape(formCode || '-');
        // ????? ??? ??????? - ???? ??????? ?? ??????? ??????
        const formCodeLabel = formCode ? '??? ???????' : '';
        return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>${escape(title || '')}</title>
    <style>
        :root { color-scheme: light; }
        @page { size: A4; margin: 25mm 20mm; }
        html {
            height: 100%;
        }
        body {
            font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
            background: #f3f4f6;
            margin: 0;
            color: #1f2937;
            line-height: 1.8;
            min-height: 100%;
            min-height: 100vh;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
        }
        .report-wrapper {
            width: 100%;
            max-width: none;
            margin: 0 auto;
            background: #ffffff;
            padding: 32px;
            box-sizing: border-box;
            box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
            border-radius: 24px;
            flex: 1 0 auto;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        .report-header {
            display: grid;
            grid-template-columns: minmax(220px, 1.2fr) minmax(320px, 2fr) minmax(96px, 140px);
            align-items: center;
            gap: 18px;
            width: 100%;
            box-sizing: border-box;
            border-bottom: 3px solid #003865;
            padding-bottom: 16px;
            margin-bottom: 20px;
            flex-shrink: 0;
        }
        .report-logo {
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 96px;
            width: 100%;
        }
        .report-logo img {
            max-height: 72px;
            max-width: min(100%, 120px);
            object-fit: contain;
            border-radius: 0;
            box-shadow: none;
        }
        .brand-placeholder {
            width: 80px;
            height: 80px;
            border-radius: 18px;
            background: linear-gradient(135deg, #003865, #1e40af);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 700;
            font-size: 20px;
            box-shadow: 0 15px 30px rgba(15, 23, 42, 0.2);
        }
        .company-brand {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 6px;
            min-width: 0;
            width: 100%;
            text-align: right;
            direction: rtl;
        }
        .company-brand .company-name {
            font-size: clamp(14px, ${nameFontSize}px, 24px);
            font-weight: 700;
            color: #0f172a;
            line-height: 1.45;
            word-break: break-word;
        }
        .company-brand .company-name-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
            width: 100%;
        }
        .company-brand .company-name-secondary {
            font-size: clamp(12px, ${secondaryNameFontSize}px, 20px);
            font-weight: 700;
            color: ${secondaryNameColor};
            line-height: 1.45;
            word-break: break-word;
        }
        .header-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            gap: 10px;
            min-width: 0;
            width: 100%;
        }
        .header-info h1 {
            margin: 0;
            font-size: clamp(20px, 2.2vw, 34px);
            font-weight: 800;
            color: #003865;
            line-height: 1.3;
            letter-spacing: 0.6px;
            word-break: break-word;
        }
        .header-title-dual {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            text-align: center;
        }
        .header-title-dual .header-title-en {
            margin: 0;
            font-size: clamp(18px, 2vw, 30px);
            font-weight: 800;
            color: #003865;
            line-height: 1.3;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #003865;
            padding-bottom: 2px;
            word-break: break-word;
        }
        .header-title-dual .header-title-ar {
            margin: 0;
            font-size: clamp(20px, 2.2vw, 32px);
            font-weight: 800;
            color: #003865;
            line-height: 1.3;
            letter-spacing: 0;
            direction: rtl;
            unicode-bidi: isolate;
            font-family: 'Tahoma', 'Cairo', 'Segoe UI', sans-serif;
            border-bottom: 2px solid #003865;
            padding-bottom: 2px;
            word-break: break-word;
        }
        .report-wrapper.dsc-report .report-header {
            direction: ltr;
            grid-template-columns: 110px minmax(0, 1fr) minmax(280px, 360px);
            grid-template-rows: auto auto;
            grid-template-areas:
                "logo company company"
                "logo title title";
            align-items: start;
            gap: 10px 14px;
        }
        .report-wrapper.dsc-report .report-logo {
            grid-area: logo;
            justify-content: flex-start;
            align-self: start;
            width: 100%;
            margin-top: 0;
            min-height: 64px;
            display: flex;
            align-items: flex-start;
        }
        .report-wrapper.dsc-report .report-logo img {
            max-height: 64px;
            max-width: 96px;
        }
        .report-wrapper.dsc-report .header-info {
            grid-area: title;
            justify-content: flex-start;
            align-self: start;
            min-width: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            margin-top: 0;
        }
        .report-wrapper.dsc-report .header-title-dual {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
        }
        .report-wrapper.dsc-report .header-title-dual .header-title-en {
            white-space: nowrap;
            line-height: 1.2;
            font-size: clamp(11px, 1.05vw, 17px);
            font-weight: 700;
            border-bottom-width: 1px;
        }
        .report-wrapper.dsc-report .header-title-dual .header-title-ar {
            white-space: nowrap;
            line-height: 1.2;
            font-size: clamp(12px, 1.15vw, 19px);
            font-weight: 700;
            width: 100%;
            letter-spacing: 0 !important;
            font-family: 'Cairo', 'Tahoma', 'Segoe UI', sans-serif !important;
            text-align: center;
            border-bottom-width: 1px;
        }
        .report-wrapper.dsc-report .company-brand {
            grid-area: company;
            align-items: flex-end;
            text-align: right;
            direction: rtl;
            justify-self: stretch;
            min-width: 0;
            gap: 4px;
            align-self: start;
            padding-top: 0;
        }
        .report-wrapper.dsc-report .company-brand .company-name,
        .report-wrapper.dsc-report .company-brand .company-name-secondary {
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            line-height: 1.15;
            letter-spacing: 0 !important;
            font-family: 'Cairo', 'Tahoma', 'Segoe UI', sans-serif !important;
        }
        .report-wrapper.dsc-report .company-brand .company-name {
            font-size: clamp(10px, 0.9vw, 14px);
            font-weight: 700;
        }
        .report-wrapper.dsc-report .company-brand .company-name-secondary {
            font-size: clamp(9px, 0.78vw, 12px);
            font-weight: 600;
        }
        .report-wrapper.dsc-report .footer-bottom-text span {
            display: block;
            direction: rtl;
            unicode-bidi: isolate;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            letter-spacing: 0;
            font-family: 'Cairo', 'Tahoma', 'Segoe UI', sans-serif;
            line-height: 1.25;
        }
        .header-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 12px 24px;
            font-size: 13px;
            color: #475569;
            justify-content: center;
        }
        .header-meta span {
            display: flex;
            gap: 6px;
            align-items: center;
        }
        .report-body {
            font-size: 15px;
            flex: 1 1 auto;
            min-height: 0;
        }
        .report-body p {
            margin-bottom: 16px;
        }
        .section-title {
            font-size: 20px;
            font-weight: 700;
            color: #1f2937;
            margin: 32px 0 16px;
            padding-right: 18px;
            border-right: 4px solid #003865;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 18px;
            margin-bottom: 28px;
        }
        .summary-card {
            background: linear-gradient(135deg, #eff6ff, #dbeafe);
            border: 1px solid #bfdbfe;
            border-radius: 16px;
            padding: 18px 20px;
            box-shadow: 0 20px 45px rgba(59, 130, 246, 0.16);
        }
        .summary-card .summary-label {
            display: block;
            font-size: 13px;
            color: #1d4ed8;
            margin-bottom: 6px;
            font-weight: 600;
        }
        .summary-card .summary-value {
            font-size: 24px;
            font-weight: 700;
            color: #1e40af;
        }
        .report-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
        }
        .report-table thead th {
            background: linear-gradient(135deg, #003865, #1e40af);
            color: #ffffff;
            padding: 16px 20px;
            font-size: 14px;
            font-weight: 600;
            text-align: right;
            letter-spacing: 0.3px;
        }
        .report-table tbody td {
            background: #ffffff;
            padding: 14px 20px;
            font-size: 14px;
            border-bottom: 1px solid #e2e8f0;
        }
        .report-table tbody tr:nth-child(even) td {
            background: #f8fafc;
        }
        .report-table tbody tr:hover td {
            background: #eff6ff;
        }
        .empty-state {
            padding: 22px;
            border: 2px dashed #bfdbfe;
            border-radius: 16px;
            background: #f8fafc;
            color: #1e3a8a;
            margin-bottom: 28px;
            font-size: 14px;
        }
        .meta-block {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 10px;
            max-width: 420px;
            width: 100%;
        }
        .meta-item {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            font-size: 13px;
            color: #475569;
            padding: 6px 0;
            border-bottom: 1px dashed rgba(148, 163, 184, 0.4);
        }
        .meta-label {
            font-weight: 600;
        }
        .report-footer {
            border-top: 2px solid #e0e7ff;
            margin-top: auto;
            padding: 12px 0 0;
            font-size: 12px;
            color: #475569;
            position: relative;
            width: 100%;
            box-sizing: border-box;
            flex-shrink: 0;
        }
        .pdf-footer-legend-wrap {
            width: 100%;
            box-sizing: border-box;
            margin-bottom: 6px;
            break-inside: avoid;
            page-break-inside: avoid;
        }
        .pdf-footer-legend-wrap .ia-export-legend {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
            padding: 8px 10px !important;
        }
        .pdf-compact-footer .report-footer {
            padding: 6px 0 0;
            font-size: 10px;
            border-top-width: 1px;
        }
        .pdf-compact-footer .footer-watermark-frame {
            padding: 8px 12px;
            margin-top: 4px;
            border-radius: 8px;
        }
        .pdf-compact-footer .footer-meta-line {
            font-size: 10px;
            gap: 8px;
            padding: 4px 0;
            margin-top: 2px;
        }
        .pdf-compact-footer .footer-meta-item {
            font-size: 10px;
            padding: 2px 4px;
            line-height: 1.45;
        }
        .pdf-compact-footer .footer-bottom {
            gap: 6px;
            margin-top: 0;
        }
        .pdf-compact-footer .footer-bottom-text {
            font-size: 10px;
            gap: 2px;
        }
        .footer-watermark-frame {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(37, 99, 235, 0.05));
            border: 2px solid rgba(59, 130, 246, 0.15);
            border-radius: 12px;
            padding: 16px 20px;
            margin-top: 12px;
            box-shadow: 0 3px 8px rgba(59, 130, 246, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.5);
            position: relative;
            overflow: hidden;
            width: 100%;
            box-sizing: border-box;
        }
        .footer-watermark-frame::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: repeating-linear-gradient(
                45deg,
                transparent,
                transparent 10px,
                rgba(59, 130, 246, 0.02) 10px,
                rgba(59, 130, 246, 0.02) 20px
            );
            pointer-events: none;
            z-index: 0;
        }
        .footer-watermark-frame > * {
            position: relative;
            z-index: 1;
        }
        .footer-bottom {
            margin-top: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            font-size: 12px;
            font-weight: 600;
            color: #0f172a;
            letter-spacing: 0.2px;
            width: 100%;
            box-sizing: border-box;
        }
        .footer-bottom-qr {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100px;
            height: 100px;
            border-radius: 12px;
            background: linear-gradient(135deg, rgba(30,64,175,0.12), rgba(59,130,246,0.1));
            box-shadow: 0 12px 24px rgba(30, 64, 175, 0.15);
        }
        .footer-meta-line {
            width: 100%;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            align-items: start;
            gap: 16px;
            font-size: 12px;
            font-weight: 600;
            color: #0f172a;
            padding: 8px 0;
            border-top: 1px solid rgba(59, 130, 246, 0.1);
            margin-top: 6px;
            box-sizing: border-box;
        }
        .footer-meta-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            white-space: normal;
            min-width: 0;
            font-size: 13px;
            line-height: 1.6;
            word-break: break-word;
            direction: rtl;
            unicode-bidi: isolate;
            letter-spacing: 0;
            font-family: 'Tahoma', 'Cairo', 'Segoe UI', sans-serif;
        }
        .footer-meta-left {
            justify-content: flex-start;
            text-align: left;
            flex: 1 1 0;
        }
        .footer-meta-center {
            justify-content: center;
            text-align: center;
            flex: 1 1 0;
        }
        .footer-meta-right {
            justify-content: flex-end;
            text-align: right;
            flex: 1 1 0;
        }
        .footer-bottom-text {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            text-align: center;
            width: 100%;
        }
        .report-list {
            padding-right: 20px;
            margin-bottom: 24px;
        }
        .report-list li {
            margin-bottom: 8px;
        }
        .permit-intro {
            background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(30, 64, 175, 0.08));
            border: 1px solid rgba(37, 99, 235, 0.25);
            border-radius: 18px;
            padding: 18px 22px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #0f172a;
            line-height: 1.9;
        }
        .permit-note {
            background: rgba(15, 23, 42, 0.04);
            border-radius: 16px;
            padding: 16px 20px;
            margin-bottom: 24px;
            font-size: 13px;
            color: #1f2937;
            border-right: 4px solid #2563eb;
        }
        .permit-section {
            margin-top: 36px;
        }
        .permit-section + .permit-section {
            margin-top: 32px;
        }
        .permit-section .section-description {
            font-size: 13px;
            color: #475569;
            margin-bottom: 16px;
            background: rgba(148, 163, 184, 0.15);
            padding: 14px 16px;
            border-radius: 14px;
        }
        .permit-table th {
            width: 22%;
            background: rgba(15, 23, 42, 0.82);
            color: #ffffff;
        }
        .permit-table td {
            width: 28%;
        }
        .checklist-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 18px;
            margin-top: 18px;
        }
        .checklist-group {
            background: rgba(15, 23, 42, 0.03);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 16px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .checklist-group h4 {
            margin: 0;
            font-size: 14px;
            color: #1e40af;
            border-right: 3px solid #1e40af;
            padding-right: 10px;
        }
        .check-item {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            color: #1f2937;
        }
        .check-item .check-symbol {
            width: 22px;
            height: 22px;
            border: 2px solid rgba(37, 99, 235, 0.5);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            color: rgba(37, 99, 235, 0.8);
            background: #ffffff;
        }
        .check-item.is-checked {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(37, 99, 235, 0.08));
            border-radius: 12px;
            padding: 6px 10px;
            box-shadow: inset 0 1px 2px rgba(37, 99, 235, 0.12);
        }
        .check-item.is-checked .check-symbol {
            background: #1e3a8a;
            border-color: #1e3a8a;
            color: #ffffff;
        }
        .check-extra {
            margin-right: auto;
            font-size: 12px;
            color: #475569;
        }
        .signature-table td {
            height: 48px;
        }
        .signature-table .empty-cell {
            min-height: 42px;
            border-bottom: 2px dotted rgba(148, 163, 184, 0.6);
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
            gap: 12px;
            margin: 18px 0;
        }
        .status-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 14px;
            border-radius: 14px;
            background: rgba(148, 163, 184, 0.12);
            font-size: 13px;
            color: #0f172a;
        }
        .status-item .check-symbol {
            width: 22px;
            height: 22px;
            border: 2px solid rgba(15, 23, 42, 0.35);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 700;
            background: #ffffff;
            color: rgba(15, 23, 42, 0.7);
        }
        .status-item.is-checked {
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(5, 150, 105, 0.1));
        }
        .status-item.is-checked .check-symbol {
            border-color: #0f766e;
            background: #0f766e;
            color: #ffffff;
        }
        .placeholder-line {
            display: inline-block;
            min-width: 120px;
            border-bottom: 1px dashed rgba(148, 163, 184, 0.8);
            height: 16px;
            vertical-align: middle;
        }
        .notes-block {
            background: rgba(148, 163, 184, 0.12);
            border-radius: 14px;
            padding: 12px 16px;
            font-size: 12px;
            color: #475569;
            margin-top: 12px;
        }
        .footer-bottom {
            margin-top: 24px;
            text-align: center;
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 13px;
            font-weight: 600;
            color: #0f172a;
            letter-spacing: 0.3px;
        }
        @media print {
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            html, body {
                height: auto;
                min-height: 100vh;
            }
            body {
                background: #ffffff !important;
                visibility: visible !important;
            }
            .report-wrapper {
                box-shadow: none;
                border-radius: 0;
                width: 100%;
                max-width: 100%;
                padding: 18px 16px;
                flex: 1 0 auto;
                min-height: 100vh;
                display: flex !important;
                flex-direction: column;
                visibility: visible !important;
                background: #ffffff !important;
            }
            .report-body {
                flex: 1 1 auto;
                visibility: visible !important;
            }
            .report-footer {
                margin-top: auto;
                visibility: visible !important;
                display: block !important;
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .report-header {
                visibility: visible !important;
                display: grid !important;
                break-inside: avoid;
                page-break-inside: avoid;
                grid-template-columns: minmax(180px, 1.3fr) minmax(280px, 2fr) minmax(84px, 110px);
                gap: 14px;
            }
            .pdf-footer-legend-wrap {
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .summary-card {
                box-shadow: none;
            }
            .footer-bottom-qr {
                box-shadow: none;
            }
            .footer-watermark-frame {
                box-shadow: 0 2px 6px rgba(59, 130, 246, 0.1);
                border: 2px solid rgba(59, 130, 246, 0.2);
            }
            .footer-meta-line {
                gap: 12px;
            }
            .pdf-compact-footer .footer-meta-line {
                gap: 8px;
            }
        }
        @media (max-width: 1100px) {
            .report-wrapper {
                width: 100%;
                padding: 24px;
            }
            .report-header {
                grid-template-columns: minmax(180px, 1fr) minmax(240px, 1.6fr) minmax(84px, 110px);
                gap: 14px;
            }
        }
        @media (max-width: 760px) {
            .report-wrapper {
                padding: 20px 16px;
                border-radius: 18px;
            }
            .report-header {
                grid-template-columns: 1fr;
                justify-items: center;
                text-align: center;
            }
            .company-brand {
                align-items: center;
                text-align: center;
            }
            .report-logo {
                order: -1;
            }
            .footer-meta-line {
                grid-template-columns: 1fr;
                gap: 8px;
            }
            .footer-meta-left,
            .footer-meta-center,
            .footer-meta-right {
                justify-content: center;
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="report-wrapper${isDailySafetyTemplate ? ' dsc-report' : ''}${compactPdfFooter ? ' pdf-compact-footer' : ''}">
        <div class="report-header">
            <div class="company-brand">
                <div class="company-name-group">
                    <div class="company-name">${companyName}</div>
                    ${companySecondaryNameTrimmed ? `<div class="company-name company-name-secondary">${companySecondaryName}</div>` : ''}
                </div>
            </div>
            <div class="header-info">
                ${(meta && meta.titleEn != null && meta.titleAr != null)
            ? `<div class="header-title-dual"><div class="header-title-ar">${escape(meta.titleAr)}</div><div class="header-title-en">${escape(meta.titleEn)}</div></div>`
            : `<h1>${escape(title || '')}</h1>`}
                ${metaRows ? `<div class="meta-block">${metaRows}</div>` : ''}
            </div>
            <div class="report-logo">
                ${logo ? `<img src="${logo}" alt="???? ??????">` : `<div class="brand-placeholder">${companyInitials}</div>`}
            </div>
        </div>
        <div class="report-body">
            ${enhancedContent}
        </div>
        <div class="report-footer">
            ${footerLegendHtml ? `<div class="pdf-footer-legend-wrap">${footerLegendHtml}</div>` : ''}
            <div class="footer-watermark-frame">
                <div class="footer-bottom">
                    ${shouldRenderQRCode ? `<div id="report-qr-code" class="footer-bottom-qr"></div>` : ''}
                    <div class="footer-meta-line">
                        ${formCode ? `<span class="footer-meta-item footer-meta-left" dir="rtl">??? ???????: ${formCodeDisplay}</span>` : ''}
                        <span class="footer-meta-item ${formCode ? 'footer-meta-center' : 'footer-meta-left'}" dir="rtl">????? ???????: ${issueDateDisplay}</span>
                        <span class="footer-meta-item ${formCode ? 'footer-meta-right' : 'footer-meta-center'}" dir="rtl">????? ???????: ${revisionDateDisplay}</span>
                        ${!formCode ? `<span class="footer-meta-item footer-meta-right" dir="rtl">??? ???????: ${versionDisplay}</span>` : ''}
                    </div>
                    <div class="footer-bottom-text">
                        <span>${companyName}</span>
                        ${companySecondaryNameTrimmed ? `<span>${companySecondaryName}</span>` : '<span>????? ??????? ?????? ??????? ???????</span>'}
                    </div>
                </div>
            </div>
        </div>
    </div>
    ${shouldRenderQRCode ? `
    <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
    <script>
        (function() {
            try {
                if (typeof qrcode === 'undefined') { return; }
                var container = document.getElementById('report-qr-code');
                if (!container) { return; }
                var qr = qrcode(0, 'M');
                qr.addData(${qrTextForScript});
                qr.make();
                container.innerHTML = qr.createImgTag(6, 0);
                var img = container.querySelector('img');
                if (img) {
                    img.style.width = '100%';
                    img.style.height = '100%';
                    img.style.objectFit = 'contain';
                    img.style.borderRadius = '12px';
                    img.alt = 'QR Code';
                }
            } catch (error) {
                Utils.safeError('Failed to generate QR code:', error);
            }
        })();
    </script>` : ''}
</body>
</html>`;
    }
};

const FormHeader = (typeof window !== 'undefined' && window.FormHeader) ? window.FormHeader : {};
FormHeader.generatePDFHTML = function (
    formCode,
    title,
    content,
    includeQrInHeader = false,
    includeQrInFooter = true,
    meta = {},
    createdAt = new Date(),
    updatedAt = null
) {
    const extendedMeta = Object.assign({}, meta);
    if (!Object.prototype.hasOwnProperty.call(extendedMeta, 'includeQRCode')) {
        extendedMeta.includeQRCode = includeQrInFooter;
    }
    const effectiveIncludeQr = extendedMeta.includeQRCode !== false && includeQrInFooter !== false;

    return PDFTemplates.buildDocument({
        title,
        content,
        formCode,
        createdAt,
        updatedAt,
        meta: extendedMeta,
        includeQRCode: effectiveIncludeQr,
        qrData: extendedMeta.qrData || null
    });
};

if (typeof window !== 'undefined') {
    window.FormHeader = FormHeader;
}

// ===== Employee Helper =====
const EmployeeHelper = {
    isResignedEmployee(employee) {
        if (!employee || typeof employee !== 'object') return false;
        const normalize = (v) => String(v ?? '').trim().toLowerCase();
        const statusFields = [
            employee.status,
            employee.employeeStatus,
            employee.workStatus,
            employee.employmentStatus,
            employee.state,
            employee.activeStatus
        ];
        const statusText = statusFields.map(normalize).filter(Boolean).join(' | ');
        if (!statusText) return false;
        return (
            statusText.includes('??????') ||
            statusText.includes('??????') ||
            statusText.includes('resign') ||
            statusText.includes('resigned') ||
            statusText.includes('terminated') ||
            statusText.includes('inactive')
        );
    },

    getEmployees(options = {}) {
        const includeResigned = options && typeof options === 'object' && options.includeResigned === true;
        const employees = AppState?.appData?.employees;
        const list = Array.isArray(employees) ? employees : [];
        if (includeResigned) return list;
        return list.filter(emp => !this.isResignedEmployee(emp));
    },

    _lookupSeq: 0,
    _employeesLoadPromise: null,

    /**
     * ????? ?????? ???????? ??? ?????? (lazy load).
     * ??? ??? ??? ??? ????? `clinic.js` ????? ??? EmployeeHelper ???? ??????? ????? ????????.
     */
    async ensureEmployeesLoaded({ includeInactive = true } = {}) {
        try {
            const employees = this.getEmployees();
            if (Array.isArray(employees) && employees.length > 0) return true;

            // ??? ??? ???? ????? ????? ????? ??? ??? Promise.
            if (this._employeesLoadPromise) {
                await this._employeesLoadPromise;
                const after = this.getEmployees();
                return Array.isArray(after) && after.length > 0;
            }

            // ????? ???? Backend (file://) ?? ??? ???? Backend/Config.
            if (AppState?.runningWithoutBackend) return false;
            if (typeof Backend === 'undefined' || typeof Backend.sendRequest !== 'function') return false;
            if (!Utils.hasCloudBackendSync()) return false;

            this._employeesLoadPromise = (async () => {
                let result = await Backend.sendRequest({
                    action: 'getAllEmployees',
                    data: { filters: { includeInactive } }
                });

                const needFallback = !result || !result.success || !Array.isArray(result.data) || result.data.length === 0;
                if (needFallback) {
                    try {
                        const alt = await Backend.sendRequest({
                            action: 'readFromSheet',
                            data: { sheetName: 'Employees' }
                        });
                        if (alt && alt.success && Array.isArray(alt.data) && alt.data.length > 0) {
                            result = { success: true, data: alt.data };
                        }
                    } catch (eAlt) {
                        // keep original result
                    }
                }

                if (result && result.success && Array.isArray(result.data)) {
                    AppState.appData = AppState.appData || {};
                    AppState.appData.employees = result.data;
                    if (typeof window.DataManager !== 'undefined' && typeof window.DataManager.save === 'function') {
                        window.DataManager.save();
                    }
                    return true;
                }

                return false;
            })();

            return await this._employeesLoadPromise;
        } catch (e) {
            return false;
        } finally {
            this._employeesLoadPromise = null;
        }
    },

    normalize(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim();
    },

    normalizeLower(value) {
        return this.normalize(value).toLowerCase();
    },

    getPrimaryCode(employee) {
        return this.normalize(
            employee?.employeeNumber ||
            employee?.employeeCode ||
            employee?.sapId ||
            employee?.id ||
            employee?.code ||
            employee?.cardId
        );
    },

    findByCode(term) {
        const normalized = this.normalizeLower(term);
        if (!normalized) return null;

        return this.getEmployees().find(emp => {
            return [
                emp?.employeeNumber,
                emp?.employeeCode,
                emp?.sapId,
                emp?.id,
                emp?.code,
                emp?.cardId
            ].some(value => this.normalizeLower(value) === normalized);
        }) || null;
    },

    findByName(term) {
        const normalized = this.normalizeLower(term);
        if (!normalized) return null;
        return this.getEmployees().find(emp => this.normalizeLower(emp?.name) === normalized) || null;
    },

    findByPartial(term) {
        const normalized = this.normalizeLower(term);
        if (!normalized) return null;

        return this.getEmployees().find(emp => {
            return (
                this.normalizeLower(emp?.employeeNumber).includes(normalized) ||
                this.normalizeLower(emp?.employeeCode).includes(normalized) ||
                this.normalizeLower(emp?.sapId).includes(normalized) ||
                this.normalizeLower(emp?.id).includes(normalized) ||
                this.normalizeLower(emp?.code).includes(normalized) ||
                this.normalizeLower(emp?.cardId).includes(normalized) ||
                this.normalizeLower(emp?.name).includes(normalized)
            );
        }) || null;
    },

    findByTerm(term) {
        return this.findByCode(term) || this.findByName(term) || this.findByPartial(term);
    },

    findMatches(term, limit = 10) {
        const normalized = this.normalizeLower(term);
        if (!normalized) return [];

        return this.getEmployees()
            .filter(emp => {
                return (
                    this.normalizeLower(emp?.employeeNumber).includes(normalized) ||
                    this.normalizeLower(emp?.employeeCode).includes(normalized) ||
                    this.normalizeLower(emp?.sapId).includes(normalized) ||
                    this.normalizeLower(emp?.id).includes(normalized) ||
                    this.normalizeLower(emp?.code).includes(normalized) ||
                    this.normalizeLower(emp?.cardId).includes(normalized) ||
                    this.normalizeLower(emp?.name).includes(normalized)
                );
            })
            .slice(0, limit);
    },

    formatEmployeeDisplay(employee) {
        if (!employee) return '';
        const code = this.getPrimaryCode(employee);
        const name = this.normalize(employee?.name);
        const position = this.normalize(employee?.position || employee?.jobTitle);
        const department = this.normalize(employee?.department || employee?.unit || employee?.section);
        const parts = [];
        if (code) parts.push(code);
        if (name) parts.push(name);
        if (position) parts.push(position);
        if (department) parts.push(department);
        return parts.join(' - ');
    },

    setupEmployeeCodeSearch(codeInputId, nameInputId = null, onSelect = null, options = {}) {
        const codeInput = typeof codeInputId === 'string' ? document.getElementById(codeInputId) : codeInputId;
        if (!codeInput) return;

        const inlineAlertId = options.inlineAlertId || null;
        /** blur-enter: ????? ??? ?????? ?? ????? ?? Enter (??? ????? ???????). enter: ????? ??? ??? Enter (????? ???????). never: ?? ????? */
        const notFoundWarn = options.employeeNotFoundWarn || 'blur-enter';

        const clearInlineAlert = () => {
            if (!inlineAlertId) return;
            const box = document.getElementById(inlineAlertId);
            if (box) {
                box.innerHTML = '';
                box.style.display = 'none';
            }
        };

        const showNotFoundMessage = (msg) => {
            if (inlineAlertId) {
                const box = document.getElementById(inlineAlertId);
                if (box) {
                    box.style.display = 'block';
                    const safe = Utils.escapeHTML(msg);
                    box.innerHTML = `<div class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 text-sm text-right shadow-sm" role="alert"><i class="fas fa-exclamation-triangle ml-2" aria-hidden="true"></i>${safe}</div>`;
                    try {
                        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }
                    return;
                }
            }
            if (typeof Notification !== 'undefined') {
                Notification.warning(msg);
            }
        };

        const nameInput = nameInputId ? document.getElementById(nameInputId) : null;

        /**
         * @param {'input-debounce'|'blur'|'enter'} source
         */
        const performLookup = async (source = 'input-debounce') => {
            const term = this.normalize(codeInput.value);
            if (!term) {
                if (nameInput) nameInput.value = '';
                onSelect?.(null);
                clearInlineAlert();
                return;
            }

            const lookupSeq = ++this._lookupSeq;
            await this.ensureEmployeesLoaded({ includeInactive: true });

            if (lookupSeq !== this._lookupSeq) return;

            // ????? ???????: ?????? ???? ??? ????? ?????? ???? ???? ??? ????? ?????? Enter/blur: findByTerm (???? ??????).
            const employee = source === 'input-debounce'
                ? (this.findByCode(term) || this.findByName(term))
                : this.findByTerm(term);
            if (employee) {
                clearInlineAlert();
                const primaryCode = this.getPrimaryCode(employee);
                if (primaryCode) codeInput.value = primaryCode;
                if (nameInput) nameInput.value = employee.name || '';
                onSelect?.(employee);
                return;
            }

            onSelect?.(null);

            const minLen = 4;
            if (term.length < minLen || notFoundWarn === 'never') return;

            let shouldWarn = false;
            if (notFoundWarn === 'enter') {
                shouldWarn = source === 'enter';
            } else if (notFoundWarn === 'blur-enter') {
                shouldWarn = source === 'blur' || source === 'enter';
            }

            if (shouldWarn) {
                showNotFoundMessage('?? ??? ?????? ??? ???? ???? ????? ?? ?????');
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                performLookup('enter').catch(() => {});
            }
        };

        let inputTimeout = null;
        const handleInput = () => {
            clearInlineAlert();
            if (inputTimeout) clearTimeout(inputTimeout);
            inputTimeout = setTimeout(() => {
                performLookup('input-debounce').catch(() => {});
            }, 300);
        };

        if (codeInput._employeeHelperLookupBlur) {
            codeInput.removeEventListener('blur', codeInput._employeeHelperLookupBlur);
        }
        if (codeInput._employeeHelperKeyDown) {
            codeInput.removeEventListener('keydown', codeInput._employeeHelperKeyDown);
        }
        if (codeInput._employeeHelperInput) {
            codeInput.removeEventListener('input', codeInput._employeeHelperInput);
        }

        const onBlur = () => performLookup('blur').catch(() => {});
        codeInput._employeeHelperLookupBlur = onBlur;
        codeInput._employeeHelperKeyDown = handleKeyDown;
        codeInput._employeeHelperInput = handleInput;

        codeInput.addEventListener('blur', onBlur);
        codeInput.addEventListener('keydown', handleKeyDown);
        codeInput.addEventListener('input', handleInput);
    },

    setupAutocomplete(nameInputId, onSelect = null) {
        const input = typeof nameInputId === 'string' ? document.getElementById(nameInputId) : nameInputId;
        if (!input) return;

        const listId = `${input.id || nameInputId}-employee-helper-list`;
        let dataList = document.getElementById(listId);
        if (!dataList) {
            dataList = document.createElement('datalist');
            dataList.id = listId;
            document.body.appendChild(dataList);
        }

        const rebuildOptions = () => {
            const optionsHTML = this.getEmployees().map(emp => {
                const display = Utils.escapeHTML(this.formatEmployeeDisplay(emp));
                const value = Utils.escapeHTML(emp?.name || '');
                return `<option value="${value}" data-code="${Utils.escapeHTML(this.getPrimaryCode(emp))}">${display}</option>`;
            }).join('');
            dataList.innerHTML = optionsHTML;
        };

        rebuildOptions();

        // Lazy load: ??? ???? ?????? ??? ??? ???? employees ??? ??????.
        this.ensureEmployeesLoaded({ includeInactive: true }).then(() => rebuildOptions()).catch(() => {});

        input.setAttribute('list', listId);

        const handleSelection = async () => {
            const term = this.normalize(input.value);
            if (!term) {
                onSelect?.(null);
                return;
            }

            try {
                let employee = this.findByTerm(term);
                if (!employee && term.length >= 4) {
                    await this.ensureEmployeesLoaded({ includeInactive: true });
                    employee = this.findByTerm(term);
                }
                onSelect?.(employee || null);
            } catch (e) {
                onSelect?.(null);
            }
        };

        if (input._employeeHelperAutocomplete) {
            input.removeEventListener('change', input._employeeHelperAutocomplete);
            input.removeEventListener('blur', input._employeeHelperAutocomplete);
        }

        input._employeeHelperAutocomplete = handleSelection;
        input.addEventListener('change', () => handleSelection().catch(() => {}));
        input.addEventListener('blur', () => handleSelection().catch(() => {}));
    }
};

if (typeof window !== 'undefined') {
    window.EmployeeHelper = EmployeeHelper;
}

// ===== PPE Matrix Helper =====
const PPEMatrix = {
    instances: {},
    activeContainerId: null,
    predefinedItems: [
        '???? ????',
        '?????? ?????',
        '??????',
        '????? ????',
        '???? ?????',
        '?????? ???',
        '?????',
        '???? ?????',
        '???? ????',
        '????? ????? ??????'
    ],

    collectPositions() {
        const matrix = AppState?.appData?.employeePPEMatrix || {};
        const employees = AppState?.appData?.employees || [];

        const fromMatrix = Object.keys(matrix);
        const fromEmployees = employees
            .map(emp => (emp?.position || '').trim())
            .filter(Boolean);

        return Array.from(new Set([...fromMatrix, ...fromEmployees]))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));
    },

    collectItems() {
        const matrix = AppState?.appData?.employeePPEMatrix || {};
        const ppeList = AppState?.appData?.ppe || [];

        const fromMatrix = Object.values(matrix)
            .flatMap(entry => entry?.requiredPPE || []);
        const fromReceipts = ppeList
            .map(item => item?.equipmentType || '')
            .filter(Boolean);

        return Array.from(new Set([
            ...this.predefinedItems,
            ...fromMatrix,
            ...fromReceipts
        ])).filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));
    },

    getPositionItems(position) {
        if (!position) return [];
        const matrix = AppState?.appData?.employeePPEMatrix || {};
        const entry = matrix[position];
        if (!entry) return [];
        return Array.isArray(entry.requiredPPE) ? entry.requiredPPE.filter(Boolean) : [];
    },

    renderCheckboxMarkup(items = [], selectedItems = []) {
        const selectedSet = new Set(selectedItems.filter(Boolean));
        if (!items.length) {
            return `
                <div class="text-sm text-gray-500 bg-gray-100 border border-dashed border-gray-300 rounded p-3">
                    ?? ???? ????? ????? ????? ????? ??????. ????? ????? ????? ????? ??????.
                </div>
            `;
        }

        return items.map(item => `
            <label class="ppe-matrix-option flex items-center p-2 border border-gray-200 rounded hover:bg-blue-50 transition-colors cursor-pointer">
                <input type="checkbox" class="ppe-matrix-item ml-2 rounded border-gray-300 text-blue-600"
                    value="${Utils.escapeHTML(item)}" ${selectedSet.has(item) ? 'checked' : ''}>
                <span class="text-sm font-medium text-gray-700">${Utils.escapeHTML(item)}</span>
            </label>
        `).join('');
    },

    generate(containerId = 'ppe-matrix', options = {}) {
        const positions = this.collectPositions();
        const availableItems = this.collectItems();
        const omitPositionSelector = options.omitPositionSelector === true;
        const omitFooterHint = options.omitFooterHint === true;

        const selectedPosition = options.selectedPosition && positions.includes(options.selectedPosition)
            ? options.selectedPosition
            : (positions[0] || '');
        const selectedItems = options.selectedItems && Array.isArray(options.selectedItems)
            ? options.selectedItems
            : (omitPositionSelector ? [] : this.getPositionItems(selectedPosition));

        const hasPositions = positions.length > 0;
        const positionSelectHTML = omitPositionSelector ? '' : (hasPositions ? `
            <div class="mb-4">
                <label for="ppe-matrix-position" class="block text-sm font-semibold text-gray-700 mb-2">???? ???????</label>
                <select id="ppe-matrix-position" class="form-input ppe-matrix-position">
                    <option value="">-- ???? ??????? --</option>
                    ${positions.map(position => `
                        <option value="${Utils.escapeHTML(position)}" ${position === selectedPosition ? 'selected' : ''}>
                            ${Utils.escapeHTML(position)}
                        </option>
                    `).join('')}
                    <option value="__custom__">???? (????? ????)</option>
                </select>
                <input type="text" class="form-input ppe-matrix-position-custom mt-2 hidden" placeholder="???? ??? ???????">
                <p class="text-xs text-gray-500 mt-1">??? ????? ????? ??????? ???????? ??? ?????? ??????? ??? ???? ????? ??????.</p>
            </div>
        ` : `
            <div class="mb-4 bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                ?? ???? ????? ????? ?? ?????? ????? ???????. ????? ????? ????? ??????? ???????? ?????? ????? ?? ??? ???????.
            </div>
        `);

        const rootExtraClass = omitPositionSelector ? ' ppe-matrix-standalone' : '';
        const footerHTML = omitFooterHint ? '' : `
                <p class="text-xs text-gray-500">
                    ??? ??? ?????????? ?? ??????? ?????? ???. ?????? ?????? ????? ??????? ???? ????? ?????? ???? "????? ????? ???????".
                </p>`;

        const html = `
            <div class="ppe-matrix-root space-y-4${rootExtraClass}" data-matrix-id="${containerId}">
                ${positionSelectHTML}
                <div class="ppe-matrix-items grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    ${this.renderCheckboxMarkup(availableItems, selectedItems)}
                </div>
                <div class="flex items-center gap-2">
                    <input type="text" class="form-input flex-1 ppe-matrix-custom-input" placeholder="??? ???? ????? ?????">
                    <button type="button" class="btn-secondary ppe-matrix-add-btn">
                        <i class="fas fa-plus ml-2"></i>?????
                    </button>
                </div>${footerHTML}
            </div>
            <script>
                setTimeout(() => {
                    if (window.PPEMatrix && typeof PPEMatrix.init === 'function') {
                        PPEMatrix.init('${containerId}', ${JSON.stringify({
            positions,
            items: availableItems,
            selectedPosition: omitPositionSelector ? '' : selectedPosition,
            selectedItems
        })});
                    }
                }, 0);
            </script>
        `;

        return html;
    },

    init(containerId, config = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const root = container.querySelector(`[data-matrix-id="${containerId}"]`);
        if (!root) return;

        const instance = {
            container,
            root,
            positions: Array.isArray(config.positions) ? [...config.positions] : [],
            items: Array.isArray(config.items) ? [...new Set(config.items.filter(Boolean))] : [],
            selectedItems: new Set((config.selectedItems || []).filter(Boolean)),
            selectedPosition: config.selectedPosition || '',
            customPosition: ''
        };

        this.instances[containerId] = instance;
        this.activeContainerId = containerId;

        this.bindEvents(instance);
    },

    bindEvents(instance) {
        const { root } = instance;
        if (!root) return;

        const positionSelect = root.querySelector('.ppe-matrix-position');
        const customPositionInput = root.querySelector('.ppe-matrix-position-custom');
        const addBtn = root.querySelector('.ppe-matrix-add-btn');
        const customInput = root.querySelector('.ppe-matrix-custom-input');

        if (positionSelect) {
            positionSelect.addEventListener('change', (event) => {
                const value = event.target.value;
                if (value === '__custom__') {
                    instance.selectedPosition = '';
                    instance.customPosition = '';
                    if (customPositionInput) {
                        customPositionInput.classList.remove('hidden');
                        customPositionInput.required = true;
                        customPositionInput.focus();
                    }
                    instance.selectedItems = new Set();
                    this.renderItems(instance);
                } else {
                    if (customPositionInput) {
                        customPositionInput.classList.add('hidden');
                        customPositionInput.required = false;
                        customPositionInput.value = '';
                    }
                    instance.selectedPosition = value;
                    instance.customPosition = '';
                    instance.selectedItems = new Set(this.getPositionItems(value));
                    instance.items = Array.from(new Set([...instance.items, ...instance.selectedItems]));
                    this.renderItems(instance);
                }
            });
        }

        if (customPositionInput) {
            customPositionInput.addEventListener('input', (event) => {
                instance.customPosition = event.target.value.trim();
            });
        }

        root.addEventListener('change', (event) => {
            if (event.target.matches('.ppe-matrix-item')) {
                const value = event.target.value;
                if (event.target.checked) {
                    instance.selectedItems.add(value);
                } else {
                    instance.selectedItems.delete(value);
                }
            }
        });

        if (addBtn && customInput) {
            addBtn.addEventListener('click', () => {
                const value = customInput.value.trim();
                if (!value) {
                    if (typeof Notification !== 'undefined') {
                        Notification.warning('???? ????? ??? ???? ??????? ??? ???????');
                    }
                    return;
                }
                if (!instance.items.includes(value)) {
                    instance.items.push(value);
                    instance.items.sort((a, b) => a.localeCompare(b, 'ar', { sensitivity: 'base' }));
                }
                instance.selectedItems.add(value);
                customInput.value = '';
                this.renderItems(instance);
            });
        }

        this.renderItems(instance);
    },

    renderItems(instance) {
        const itemsContainer = instance?.root?.querySelector('.ppe-matrix-items');
        if (!itemsContainer) return;

        const markup = this.renderCheckboxMarkup(instance.items, Array.from(instance.selectedItems));
        itemsContainer.innerHTML = markup;
    },

    getActiveInstance(containerId = null) {
        const id = containerId || this.activeContainerId;
        if (!id) return null;
        return this.instances[id] || null;
    },

    getSelected(containerId = null) {
        const instance = this.getActiveInstance(containerId);
        if (!instance) return [];
        return Array.from(instance.selectedItems);
    },

    setSelected(selectedItems = [], containerId = null) {
        const instance = this.getActiveInstance(containerId);
        if (!instance) return;
        instance.selectedItems = new Set((selectedItems || []).filter(Boolean));
        instance.items = Array.from(new Set([...instance.items, ...instance.selectedItems]));
        this.renderItems(instance);
    },

    getSelectedPosition(containerId = null) {
        const instance = this.getActiveInstance(containerId);
        if (!instance) return '';
        return instance.selectedPosition || instance.customPosition || '';
    },

    setPosition(position, containerId = null) {
        const instance = this.getActiveInstance(containerId);
        if (!instance) return;
        const select = instance.root.querySelector('.ppe-matrix-position');
        const customInput = instance.root.querySelector('.ppe-matrix-position-custom');
        if (select) {
            if (instance.positions.includes(position)) {
                select.value = position;
                instance.selectedPosition = position;
                instance.customPosition = '';
                if (customInput) {
                    customInput.classList.add('hidden');
                    customInput.required = false;
                    customInput.value = '';
                }
                instance.selectedItems = new Set(this.getPositionItems(position));
                instance.items = Array.from(new Set([...instance.items, ...instance.selectedItems]));
                this.renderItems(instance);
            } else if (position) {
                select.value = '__custom__';
                if (customInput) {
                    customInput.classList.remove('hidden');
                    customInput.required = true;
                    customInput.value = position;
                }
                instance.selectedPosition = '';
                instance.customPosition = position;
                instance.selectedItems = new Set();
                this.renderItems(instance);
            }
        }
    }
};

// Export to global scope
if (typeof window !== 'undefined') {
    window.Utils = Utils;
    window.Notification = Notification;
    window.Loading = Loading;
    window.QRCode = QRCode;
    window.ViolationTypesManager = ViolationTypesManager;
    window.DEFAULT_PERIODIC_INSPECTION_CATEGORIES = DEFAULT_PERIODIC_INSPECTION_CATEGORIES;
    window.DEFAULT_VIOLATION_TYPES = DEFAULT_VIOLATION_TYPES;
    window.PDFTemplates = PDFTemplates;
    window.EmployeeHelper = EmployeeHelper;
    window.PPEMatrix = PPEMatrix;
    window.Permissions = Permissions;
    window.AppState = AppState;

    // ? ???? ?????? ?????? ?? ??????? ??????? ???
    window.isReadOnlyRole = function(user = AppState.currentUser) {
        if (!user) return false;
        const role = (user.role || '').toLowerCase().trim();
        return role === 'read_only' || role === '????? ???';
    };

    window.canEdit = function(moduleKey, user = AppState.currentUser) {
        if (!user) return false;
        if (Permissions.isAdminRole(user.role)) return true;
        if (window.isReadOnlyRole(user)) return false;
        return Permissions.hasAccess(moduleKey || '', user);
    };

    window.canAdd = function(moduleKey, user = AppState.currentUser) {
        if (!user) return false;
        if (Permissions.isAdminRole(user.role)) return true;
        if (window.isReadOnlyRole(user)) return false;
        return Permissions.hasAccess(moduleKey || '', user);
    };

    window.canDelete = function(moduleKey, user = AppState.currentUser) {
        if (!user) return false;
        if (Permissions.isAdminRole(user.role)) return true;
        if (window.isReadOnlyRole(user)) return false;
        return Permissions.hasAccess(moduleKey || '', user);
    };

    // ??????? ?????? ?????? ????? ??????/?????? ?? ???? ?????????? ??? ?????? ????? ??????? ???????
    (function () {
        function refreshAllSiteDropdowns() {
            var names = ['Training', 'Clinic', 'PTW', 'Incidents', 'Violations', 'FireEquipment', 'PeriodicInspections', 'BehaviorMonitoring', 'Sustainability'];
            for (var i = 0; i < names.length; i++) {
                try {
                    var M = window[names[i]];
                    if (M && typeof M.refreshSiteDropdowns === 'function') M.refreshSiteDropdowns();
                } catch (e) { Utils.safeWarn?.('app-utils: operation failed', e); }
            }
        }
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('formSettingsUpdated', refreshAllSiteDropdowns);
        }
    })();

    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        AppState.runningWithoutBackend = true;
    }
    window.MODULE_PERMISSIONS_CONFIG = MODULE_PERMISSIONS_CONFIG;
    window.DEFAULT_ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS;
    window.AVAILABLE_ROLES = AVAILABLE_ROLES;
}

/**
 * ????? ?? ?????? ???????? legacy ?? ???????? ???????.
 * 
 * ?? ?????? ?????:
 * - ?? ???? ?????? ?????? ???????? ?? ???????.
 * - ??? ??? Cleanup ??? ?????? ????? ?? ????? ?? ??? ????? (??? ???? @hse.local).
 * 
 * @param {{persistRemote?: boolean}} options
 * @returns {{removed: number, removedEmails: string[]}}
 */
function removeDefaultUsersIfNeeded(options = {}) {
    try {
        const users = AppState?.appData?.users;
        if (!Array.isArray(users) || users.length === 0) {
            return { removed: 0, removedEmails: [] };
        }

        const isLegacyDefaultUser = (u) => {
            try {
                const email = String(u?.email || '').toLowerCase().trim();
                return (u?.isDefaultUser === true) || email.endsWith('@hse.local');
            } catch (e) {
                return false;
            }
        };

        const removedUsers = users.filter(isLegacyDefaultUser);
        if (removedUsers.length === 0) {
            return { removed: 0, removedEmails: [] };
        }

        AppState.appData.users = users.filter(u => !isLegacyDefaultUser(u));

        // ??? ????
        try {
            if (typeof window !== 'undefined' && window.DataManager && typeof window.DataManager.save === 'function') {
                window.DataManager.save();
            }
        } catch (e) {
            Utils.safeWarn?.('app-utils: operation failed', e);
        }

        // ??? ?? ??? (???????) - ??? ??? ????? ??????
        const persistRemote = options && options.persistRemote === true;
        if (persistRemote) {
            try {
                const isAdmin = (typeof Permissions !== 'undefined' && typeof Permissions.isCurrentUserAdmin === 'function')
                    ? Permissions.isCurrentUserAdmin()
                    : (AppState.currentUser?.role || '').toLowerCase() === 'admin';

                if (isAdmin && typeof Backend !== 'undefined' && typeof Backend.autoSave === 'function' &&
                    Utils.hasCloudBackendSync()) {
                    Backend.autoSave('Users', AppState.appData.users).catch(() => { });
                }
            } catch (e) {
                Utils.safeWarn?.('app-utils: operation failed', e);
            }
        }

        return {
            removed: removedUsers.length,
            removedEmails: removedUsers.map(u => String(u?.email || '')).filter(Boolean)
        };
    } catch (error) {
        return { removed: 0, removedEmails: [] };
    }
}

// Export cleanup helper globally (used by Users module)
if (typeof window !== 'undefined') {
    window.removeDefaultUsersIfNeeded = removeDefaultUsersIfNeeded;
}

/**
 * Module Lifecycle Manager
 * ????? ???? ???? ?????????? - ???? ????? ????? ?? ????? ??????
 */
const ModuleLifecycle = {
    /**
     * ????? ??? ??? ????? ???? ???????? ???????
     * @param {string} moduleId - ???? ????? (???: 'contractors-section')
     * @param {Function} callback - ?????? ?????? ???????
     * @returns {boolean} - ?? ?? ??????? ?? ??
     */
    executeIfModuleActive(moduleId, callback) {
        try {
            const section = document.getElementById(moduleId);
            if (section && document.contains(section)) {
                const style = getComputedStyle(section);
                // ?????? ?? ?? ????? ????
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    if (typeof callback === 'function') {
                        callback(section);
                        return true;
                    }
                }
            }
            return false;
        } catch (error) {
            Utils.safeWarn('?? ModuleLifecycle.executeIfModuleActive error:', error);
            return false;
        }
    },

    /**
     * ?????? ??? ?????? ???? ?? ????? ?????
     * @param {string} moduleId - ???? ?????
     * @param {Function} callback - ?????? ?????? ???????
     * @param {number} timeout - ???? ?????? ???????? (??????? ?????)
     * @returns {Promise<boolean>}
     */
    async waitForModuleActive(moduleId, callback, timeout = 10000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const check = () => {
                if (this.executeIfModuleActive(moduleId, callback)) {
                    resolve(true);
                    return;
                }
                
                if (Date.now() - startTime >= timeout) {
                    Utils.safeWarn(`?? ModuleLifecycle: timeout ?????? ???????? "${moduleId}"`);
                    resolve(false);
                    return;
                }
                
                requestAnimationFrame(check);
            };
            
            check();
        });
    },

    /**
     * ????? ????? ???? ??? ??????
     * @param {string} moduleId - ???? ?????
     * @param {Function} onOpen - ?????? ?????? ??????? ??? ?????
     * @param {Function} onClose - ?????? ?????? ??????? ??? ??????? (???????)
     */
    onModuleToggle(moduleId, onOpen, onClose = null) {
        try {
            // ??????? MutationObserver ??????? ??????? ?????
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && 
                        (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
                        const section = document.getElementById(moduleId);
                        if (section) {
                            const style = getComputedStyle(section);
                            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
                            
                            if (isVisible && typeof onOpen === 'function') {
                                onOpen(section);
                            } else if (!isVisible && typeof onClose === 'function') {
                                onClose(section);
                            }
                        }
                    }
                }
            });

            // ?????? ????????? ??? ????? ???????
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                observer.observe(mainContent, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['style', 'class']
                });
            }

            return observer;
        } catch (error) {
            Utils.safeWarn('?? ModuleLifecycle.onModuleToggle error:', error);
            return null;
        }
    },

    /**
     * ????? ??? Event Listeners ??? ????? DOM
     * @param {HTMLElement} container - ?????? ??????
     * @param {Object} handlers - ??????? ??????? {selector: {event: handler}}
     * @param {AbortController} abortController - ???????
     */
    rebindEventListeners(container, handlers, abortController = null) {
        if (!container || !document.contains(container) || !handlers) return;

        Object.entries(handlers).forEach(([selector, events]) => {
            const elements = container.querySelectorAll(selector);
            elements.forEach(element => {
                Object.entries(events).forEach(([eventType, handler]) => {
                    if (typeof handler === 'function') {
                        const options = abortController ? { signal: abortController.signal } : {};
                        element.addEventListener(eventType, handler, options);
                    }
                });
            });
        });
    },

    /**
     * ????? ?????? ?????? ???? listeners
     * @param {AbortController} abortController - AbortController ????????
     */
    cleanupModule(abortController) {
        if (abortController && typeof abortController.abort === 'function') {
            abortController.abort();
        }
    }
};

// Export ModuleLifecycle globally
if (typeof window !== 'undefined') {
    window.ModuleLifecycle = ModuleLifecycle;
}

// ????? const aliases ??????? ?? ????? ??????
// ??????: ?? ??????? ??? ????? ??????? ????? ???????
// const Notification = window.Notification;
// const Utils = window.Utils;
// const Loading = window.Loading;

// ========================================
// ???? ??????? ??????? (i18n)
// ========================================
const I18n = {
    // ????? ??????????
    defaultLanguage: 'ar',

    // ????? ????????
    translations: {
        ar: {
            // ????? ????
            'btn.add': '?????',
            'btn.edit': '?????',
            'btn.delete': '???',
            'btn.save': '???',
            'btn.cancel': '?????',
            'btn.close': '?????',
            'btn.refresh': '?????',
            'btn.search': '???',
            'btn.reset': '????? ?????',
            'btn.export': '?????',
            'btn.import': '???????',
            'btn.print': '?????',
            'btn.view': '???',
            'btn.details': '????????',
            'btn.back': '????',
            'btn.next': '??????',
            'btn.previous': '??????',
            'btn.submit': '?????',
            'btn.approve': '??????',
            'btn.reject': '???',
            'btn.filter': '?????',
            'btn.clear': '???',
            'btn.download': '?????',
            'btn.upload': '???',
            'btn.new': '????',
            'btn.create': '?????',
            'btn.update': '?????',
            'btn.confirm': '?????',
            'btn.yes': '???',
            'btn.no': '??',

            // ?????? ???????
            'table.actions': '?????????',
            'table.status': '??????',
            'table.date': '???????',
            'table.name': '?????',
            'table.type': '?????',
            'table.description': '?????',
            'table.notes': '???????',
            'table.priority': '????????',
            'table.department': '?????',
            'table.location': '??????',
            'table.code': '?????',
            'table.id': '??????',
            'table.created': '????? ???????',
            'table.updated': '????? ???????',
            'table.by': '??????',
            'table.count': '?????',
            'table.total': '???????',

            // ?????? ?????? (Skeleton)
            'skeleton.loading': '???? ???????...',
            'skeleton.noData': '?? ???? ??????',
            'skeleton.error': '??? ??? ????? ???????',
            'skeleton.retry': '????? ????????',
            'skeleton.empty': '?? ???? ????? ??????',

            // ????? ????
            'msg.success': '?? ?????',
            'msg.error': '??? ???',
            'msg.warning': '?????',
            'msg.info': '???????',
            'msg.confirm': '?? ??? ??????',
            'msg.saved': '?? ????? ?????',
            'msg.deleted': '?? ????? ?????',
            'msg.updated': '?? ??????? ?????',
            'msg.loading': '???? ???????...',
            'msg.processing': '???? ????????...',
            'msg.noResults': '?? ???? ?????',
            'msg.searchPlaceholder': '???? ???...',
            'msg.select': '????...',
            'msg.all': '????',
            'msg.none': '?? ???',
            'msg.required': '??? ?????',
            'msg.invalid': '?????? ??? ?????',
            'msg.networkError': '??? ?? ??????? ???????',
            'msg.serverError': '??? ?? ??????',
            'msg.timeout': '????? ??????',
            'msg.unauthorized': '??? ????',
            'msg.forbidden': '??? ?????',
            'msg.notFound': '??? ?????',

            // ?????
            'filter.all': '????',
            'filter.active': '???',
            'filter.inactive': '??? ???',
            'filter.pending': '????',
            'filter.approved': '?????',
            'filter.rejected': '?????',
            'filter.completed': '?????',
            'filter.open': '?????',
            'filter.closed': '????',
            'filter.dateFrom': '?? ?????',
            'filter.dateTo': '??? ?????',

            // ?????
            'pagination.prev': '??????',
            'pagination.next': '??????',
            'pagination.first': '?????',
            'pagination.last': '??????',
            'pagination.of': '??',
            'pagination.items': '?????',
            'pagination.page': '????',
            'pagination.showing': '???',
            'pagination.to': '???',

            // ????????
            'module.dashboard': '???? ??????',
            'module.users': '??????????',
            'module.employees': '????????',
            'module.incidents': '???????',
            'module.nearmiss': '???????? ???????',
            'module.ptw': '?????? ?????',
            'module.training': '???????',
            'module.clinic': '???????',
            'module.fireequipment': '????? ??????',
            'module.ppe': '????? ???????',
            'module.contractors': '?????????',
            'module.violations': '?????????',
            'module.reports': '????????',
            'module.settings': '?????????',
            'module.behavior': '?????? ??????',
            'module.chemicals': '?????? ??????????',
            'module.observations': '????????? ???????',
            'module.iso': 'ISO',
            'module.emergency': '???????',
            'module.risk': '????? ???????',
            'module.documents': '?????????',
            'module.audit': '???????',
            'module.sustainability': '?????????',
            'module.inspections': '????????',
            'module.safetyteam': '???? ???????',

            // Settings Module specific translations
            'settings.title': '?????????',
            'settings.subtitle': '????? ??????? ?????? ?????? ??????????',
            'settings.tabs.company': '?????? ?????? ???????',
            'settings.tabs.integration': '????? ????????',
            'settings.tabs.cloud': '????? ???????',
            'settings.tabs.drive': '???? ?????',
            'settings.tabs.sharepoint': '?????????? ??? ?????',
            'settings.tabs.system': '??????? ??????',
            'settings.tabs.forms': '??????? ???????',
            'settings.tabs.violations': '????? ?????????',
            'settings.tabs.reports': '???????? ??????????',
            'settings.tabs.email': '??????? ?????? ??????????',
            'settings.tabs.permissions': '????????? ??????????',
            'settings.tabs.circuit': '????? ????????',
            'settings.tabs.help': '???? ????????',
            'settings.tabs.logs': '??????? ??????',
            'settings.tabs.privacy': '???????? ????????',
            'settings.privacy.subtitle': '????? ??????? ???????? ???????? ???????',
            'settings.privacy.cookiePrefs': '??????? ??????? ???????',
            'settings.privacy.manageCookies': '????? ???????',
            'settings.privacy.policy': '????? ???????',
            'settings.privacy.consentHistory': '??? ?????????',
            
            'settings.company.title': '?????? ?????? ???????',
            'settings.company.subtitle': '??????? ?????? ??????? ??????? ???????',
            'settings.company.name': '??? ?????? (???? ?? ????? ?????????)',
            'settings.company.nameHint': '???? ??????? ??? ????? ?? ??? ??????? ????? ???????? PDF.',
            'settings.company.fontSize': '??? ?? ??? ?????? (????)',
            'settings.company.fontSizeHint': '????? ?????????: 16 ????. ????? ?????? ?? 8 ??? 72 ????.',
            'settings.company.secondaryName': '????? ??????? / ????? ??????? (???? ?? ????? ?????????)',
            'settings.company.secondaryNameHint': '???? ??? ??? ????? ???? ??? ?????? ?? ????? ?????????. ??? ?? ????? ?????? ?? ???? ?? ??????? ?? PDF.',

            // PTW Module specific translations
            'ptw.title': '?????? ?????',
            'ptw.subtitle': '????? ?????? ?????',
            'ptw.tabs.list': '????? ????????',
            'ptw.tabs.registry': '??? ????????',
            'ptw.tabs.analytics': '?????????',
            'ptw.btn.newPermit': '????? ????',
            'ptw.btn.approve': '??????',
            'ptw.btn.reject': '???',
            'ptw.status.pending': '????',
            'ptw.status.approved': '?????',
            'ptw.status.rejected': '?????',
            'ptw.status.expired': '?????',
            'ptw.status.active': '???',
            'ptw.form.permitType': '??? ???????',
            'ptw.form.workLocation': '???? ?????',
            'ptw.form.workDescription': '??? ?????',
            'ptw.form.startDate': '????? ?????',
            'ptw.form.endDate': '????? ????????',
            'ptw.form.requestingParty': '????? ???????',
            'ptw.form.approvals': '?????????',
            'ptw.safety.officer': '????? ???????',
            'ptw.safety.required': '?????? ??????? ??????',

            // Users Module translations
            'users.title': '??????????',
            'users.subtitle': '????? ?????????? ??????????',
            'users.btn.newUser': '?????? ????',
            'users.table.name': '?????',
            'users.table.email': '?????? ??????????',
            'users.table.role': '?????',
            'users.table.department': '?????',
            'users.table.status': '??????',
            'users.status.active': '???',
            'users.status.inactive': '??? ???',
            'users.form.fullName': '????? ??????',
            'users.form.email': '?????? ??????????',
            'users.form.password': '???? ??????',
            'users.form.role': '????? ???????',
            'users.form.department': '?????',

            // Incidents Module translations
            'incidents.title': '???????',
            'incidents.subtitle': '????? ??????? ???????',
            'incidents.btn.newIncident': '???? ????',
            'incidents.table.incidentType': '??? ??????',
            'incidents.table.date': '????? ??????',
            'incidents.table.location': '??????',
            'incidents.table.severity': '???????',
            'incidents.table.status': '??????',
            'incidents.form.description': '??? ??????',
            'incidents.form.injuredPerson': '????? ??????',
            'incidents.form.witnesses': '??????',
            'incidents.form.immediateAction': '??????? ??????',
            'incidents.form.rootCause': '????? ??????',
            'incidents.form.correctiveAction': '??????? ????????',
            'incidents.severity.low': '??????',
            'incidents.severity.medium': '??????',
            'incidents.severity.high': '?????',
            'incidents.severity.critical': '????',
            'incidents.status.open': '?????',
            'incidents.status.investigating': '??? ???????',
            'incidents.status.closed': '????',

            // Training Module translations
            'training.title': '???????',
            'training.subtitle': '????? ??????? ????????? ?????????',
            'training.btn.newTraining': '?????? ?????? ????',
            'training.btn.newCertificate': '????? ?????',
            'training.table.trainingName': '??? ????????',
            'training.table.trainer': '??????',
            'training.table.date': '???????',
            'training.table.duration': '?????',
            'training.table.participants': '?????????',
            'training.table.status': '??????',
            'training.form.trainingType': '??? ???????',
            'training.form.trainingTopic': '????? ???????',
            'training.form.trainer': '??????',
            'training.form.location': '???? ???????',
            'training.form.startDate': '????? ?????',
            'training.form.endDate': '????? ????????',
            'training.form.duration': '????? (?????)',
            'training.status.planned': '????',
            'training.status.ongoing': '????',
            'training.status.completed': '?????',
            'training.status.cancelled': '????',
            'training.certificate.title': '????????',
            'training.certificate.employee': '??????',
            'training.certificate.issueDate': '????? ???????',
            'training.certificate.expiryDate': '????? ????????',
            'training.certificate.status': '???? ???????',
            'training.certificate.valid': '?????',
            'training.certificate.expired': '??????',

            // NearMiss Module translations
            'nearmiss.title': '???????? ???????',
            'nearmiss.subtitle': '????? ??????? ???????? ??????? ?? ???????',
            'nearmiss.btn.newReport': '????? ????',
            'nearmiss.table.date': '????? ???????',
            'nearmiss.table.location': '??????',
            'nearmiss.table.type': '??? ???????',
            'nearmiss.table.severity': '???????',
            'nearmiss.table.reporter': '??????',
            'nearmiss.table.status': '??????',
            'nearmiss.form.description': '??? ?????? ??????',
            'nearmiss.form.immediateAction': '??????? ?????? ??????',
            'nearmiss.form.suggestedAction': '??????? ???????',
            'nearmiss.status.reported': '?? ???????',
            'nearmiss.status.underReview': '??? ????????',
            'nearmiss.status.resolved': '?? ????',

            // Clinic Module translations
            'clinic.title': '???????',
            'clinic.subtitle': '????? ?????? ??????? ???????? ??????',
            'clinic.btn.newVisit': '????? ?????',
            'clinic.tabs.visits': '??? ????????',
            'clinic.tabs.employees': '????????',
            'clinic.tabs.contractors': '?????????',
            'clinic.tabs.medications': '???????',
            'clinic.tabs.analytics': '?????????',
            'clinic.table.employeeCode': '????? ???????',
            'clinic.table.name': '?????',
            'clinic.table.visitDate': '????? ???????',
            'clinic.table.reason': '??? ???????',
            'clinic.table.diagnosis': '???????',
            'clinic.table.status': '??????',
            'clinic.table.medications': '???????',
            'clinic.form.patientType': '??? ??????',
            'clinic.form.patientName': '??? ??????',
            'clinic.form.visitDate': '????? ???????',
            'clinic.form.reason': '??? ???????',
            'clinic.form.diagnosis': '???????',
            'clinic.form.treatment': '??????',
            'clinic.form.medications': '??????? ????????',
            'clinic.status.treated': '?? ??????',
            'clinic.status.referred': '?? ???????',
            'clinic.status.followUp': '??????',

            // FireEquipment Module translations
            'fire.title': '????? ??????',
            'fire.subtitle': '????? ???? ????? ?????? ????????',
            'fire.btn.newEquipment': '????? ?????',
            'fire.btn.inspect': '???',
            'fire.btn.qrScan': '??? QR',
            'fire.tabs.database': '????? ????????',
            'fire.tabs.register': '?????',
            'fire.tabs.inspections': '????????',
            'fire.tabs.analytics': '?????????',
            'fire.table.equipmentId': '??? ??????',
            'fire.table.type': '?????',
            'fire.table.location': '??????',
            'fire.table.status': '??????',
            'fire.table.lastInspection': '??? ???',
            'fire.table.nextInspection': '????? ??????',
            'fire.form.equipmentType': '??? ??????',
            'fire.form.deviceId': '??? ??????',
            'fire.form.location': '???? ??????',
            'fire.form.installationDate': '????? ???????',
            'fire.form.lastInspection': '????? ??? ???',
            'fire.status.active': '????',
            'fire.status.maintenance': '????? ?????',
            'fire.status.outOfService': '???? ??????',
            'fire.inspection.monthly': '????? ??????',
            'fire.inspection.quarterly': '????? ??? ??????',

            // PPE Module translations
            'ppe.title': '????? ??????? ???????',
            'ppe.subtitle': '????? ????? ????? ??????? ???????',
            'ppe.btn.newItem': '??? ????',
            'ppe.btn.issue': '???',
            'ppe.btn.return': '?????',
            'ppe.tabs.inventory': '???????',
            'ppe.tabs.issuance': '?????',
            'ppe.tabs.returns': '?????????',
            'ppe.tabs.analytics': '?????????',
            'ppe.table.itemName': '??? ?????',
            'ppe.table.category': '?????',
            'ppe.table.quantity': '??????',
            'ppe.table.unit': '??????',
            'ppe.table.minStock': '???? ??????',
            'ppe.table.status': '??????',
            'ppe.table.employee': '??????',
            'ppe.table.issueDate': '????? ?????',
            'ppe.table.returnDate': '????? ???????',
            'ppe.form.itemName': '??? ?????',
            'ppe.form.category': '?????',
            'ppe.form.quantity': '??????',
            'ppe.form.unit': '??????',
            'ppe.form.minStock': '???? ?????? ???????',
            'ppe.status.available': '????',
            'ppe.status.lowStock': '????? ?????',
            'ppe.status.outOfStock': '??? ?? ???????',

            // Employees Module translations
            'employees.title': '????????',
            'employees.subtitle': '????? ?????? ???????? ????????',
            'employees.btn.newEmployee': '???? ????',
            'employees.table.employeeCode': '????? ???????',
            'employees.table.fullName': '????? ??????',
            'employees.table.jobTitle': '?????? ???????',
            'employees.table.department': '?????',
            'employees.table.factory': '??????',
            'employees.table.workplace': '???? ?????',
            'employees.table.joinDate': '????? ???????',
            'employees.table.status': '??????',
            'employees.form.fullName': '????? ??????',
            'employees.form.employeeCode': '????? ???????',
            'employees.form.jobTitle': '?????? ???????',
            'employees.form.department': '?????',
            'employees.form.factory': '??????',
            'employees.form.workplace': '???? ?????',
            'employees.form.phone': '??? ??????',
            'employees.form.email': '?????? ??????????',
            'employees.form.joinDate': '????? ???????',
            'employees.status.active': '???',
            'employees.status.inactive': '??? ???',
            'employees.status.onLeave': '?? ?????',

            // Contractors Module translations
            'contractors.title': '?????????',
            'contractors.subtitle': '????? ????????? ???????',
            'contractors.btn.newContractor': '????? ????',
            'contractors.btn.evaluate': '?????',
            'contractors.btn.approve': '??????',
            'contractors.tabs.list': '????? ?????????',
            'contractors.tabs.approved': '?????????',
            'contractors.tabs.evaluations': '?????????',
            'contractors.tabs.requests': '????? ????????',
            'contractors.table.contractorName': '??? ???????',
            'contractors.table.company': '??????',
            'contractors.table.specialty': '??????',
            'contractors.table.contractNumber': '??? ?????',
            'contractors.table.startDate': '????? ?????',
            'contractors.table.endDate': '????? ????????',
            'contractors.table.status': '??????',
            'contractors.form.companyName': '??? ??????',
            'contractors.form.contractorName': '??? ???????',
            'contractors.form.specialty': '??????',
            'contractors.form.contractNumber': '??? ?????',
            'contractors.form.startDate': '????? ????? ?????',
            'contractors.form.endDate': '????? ????? ?????',
            'contractors.form.contactPerson': '????? ???????',
            'contractors.form.phone': '??? ??????',
            'contractors.form.email': '?????? ??????????',
            'contractors.status.active': '???',
            'contractors.status.expired': '?????',
            'contractors.status.pending': '????',
            'contractors.status.approved': '?????',

            // Violations Module translations
            'violations.title': '?????????',
            'violations.subtitle': '????? ????? ????????? ?????????',
            'violations.btn.newViolation': '?????? ?????',
            'violations.btn.newPenalty': '???? ????',
            'violations.tabs.violations': '?????????',
            'violations.tab.penalties': '????????',
            'violations.tabs.analytics': '?????????',
            'violations.table.violationType': '??? ????????',
            'violations.table.date': '????? ????????',
            'violations.table.employee': '??????/???????',
            'violations.table.severity': '???? ???????',
            'violations.table.status': '??????',
            'violations.table.penalty': '??????',
            'violations.form.violationDescription': '??? ????????',
            'violations.form.violationLocation': '???? ????????',
            'violations.form.violationDate': '????? ????????',
            'violations.form.violationTime': '??? ????????',
            'violations.form.witnesses': '??????',
            'violations.form.evidence': '??????/???????',
            'violations.severity.low': '??????',
            'violations.severity.medium': '??????',
            'violations.severity.high': '?????',
            'violations.severity.critical': '????',
            'violations.status.pending': '?????',
            'violations.status.approved': '??????',
            'violations.status.rejected': '??????',

            // Reports Module translations
            'reports.title': '????????',
            'reports.subtitle': '????? ?????? ????????',
            'reports.btn.newReport': '????? ????',
            'reports.btn.generate': '????? ???????',
            'reports.btn.export': '?????',
            'reports.tabs.saved': '???????? ????????',
            'reports.tabs.generate': '????? ?????',
            'reports.tabs.scheduled': '???????? ????????',
            'reports.table.reportName': '??? ???????',
            'reports.table.reportType': '??? ???????',
            'reports.table.createdBy': '?? ??????? ??????',
            'reports.table.createdDate': '????? ???????',
            'reports.table.lastRun': '??? ?????',
            'reports.table.status': '??????',
            'reports.form.reportName': '??? ???????',
            'reports.form.reportType': '??? ???????',
            'reports.form.dateRange': '???? ???????',
            'reports.form.filters': '????? ???????',
            'reports.status.active': '???',
            'reports.status.inactive': '??? ???',

            // ISO Module translations
            'iso.title': '???? ????? ?????? ISO',
            'iso.subtitle': '????? ??????? ???? ????? ?????? ?????????',
            'iso.btn.newDocument': '????? ????',
            'iso.btn.audit': '????? ????',
            'iso.tabs.documents': '?????????',
            'iso.tabs.audits': '?????????',
            'iso.tabs.certificates': '????????',
            'iso.tabs.analytics': '?????????',
            'iso.table.documentCode': '??? ???????',
            'iso.table.documentName': '??? ???????',
            'iso.table.version': '???????',
            'iso.table.issueDate': '????? ???????',
            'iso.table.reviewDate': '????? ????????',
            'iso.table.status': '??????',
            'iso.form.documentCode': '??? ???????',
            'iso.form.documentName': '??? ???????',
            'iso.form.version': '??? ???????',
            'iso.form.issueDate': '????? ???????',
            'iso.form.reviewDate': '????? ???????? ??????',
            'iso.status.active': '???',
            'iso.status.underReview': '??? ????????',
            'iso.status.archived': '?????',

            // Emergency Module translations
            'emergency.title': '???????',
            'emergency.subtitle': '????? ??? ??????? ????????',
            'emergency.btn.newPlan': '??? ????? ?????',
            'emergency.btn.drill': '????? ?????',
            'emergency.tabs.plans': '??? ???????',
            'emergency.tabs.drills': '????????',
            'emergency.tabs.equipment': '????? ???????',
            'emergency.tabs.contacts': '???? ???????',
            'emergency.table.planName': '??? ?????',
            'emergency.table.planType': '??? ?????',
            'emergency.table.lastDrill': '??? ?????',
            'emergency.table.nextDrill': '??????? ??????',
            'emergency.table.status': '??????',
            'emergency.form.planName': '??? ??? ???????',
            'emergency.form.planType': '??? ?????',
            'emergency.form.assemblyPoint': '???? ??????',
            'emergency.form.evacuationRoutes': '??? ???????',
            'emergency.status.active': '????',
            'emergency.status.inactive': '??? ????',

            // SOP/JHA Module translations
            'sop.title': '??????? ????? ??????',
            'sop.subtitle': '????? ??????? ????? ?????? ?????? ???????',
            'sop.btn.newSOP': '????? ????',
            'sop.btn.newJHA': '????? ????? ????',
            'sop.tabs.sop': '??????? ?????',
            'sop.tabs.jha': '????? ???????',
            'sop.tabs.approvals': '?????????',
            'sop.table.sopCode': '??? ???????',
            'sop.table.sopName': '??? ???????',
            'sop.table.department': '?????',
            'sop.table.revision': '????????',
            'sop.table.lastUpdate': '??? ?????',
            'sop.table.status': '??????',
            'sop.form.sopCode': '??? ???????',
            'sop.form.sopName': '??? ???????',
            'sop.form.department': '?????',
            'sop.form.purpose': '?????',
            'sop.form.scope': '??????',
            'sop.form.responsibilities': '??????????',
            'sop.form.procedures': '?????????',
            'sop.status.active': '???',
            'sop.status.underReview': '??? ????????',
            'sop.status.obsolete': '????',

            // DailyObservations Module translations
            'daily.title': '????????? ???????',
            'daily.subtitle': '????? ????????? ??????? ??? ??? ??????',
            'daily.btn.newObservation': '?????? ?????',
            'daily.table.date': '???????',
            'daily.table.observer': '???????',
            'daily.table.location': '??????',
            'daily.table.observation': '????????',
            'daily.table.category': '???????',
            'daily.table.priority': '????????',
            'daily.table.status': '??????',
            'daily.form.observationDate': '????? ????????',
            'daily.form.observerName': '??? ???????',
            'daily.form.location': '??????',
            'daily.form.category': '????? ????????',
            'daily.form.description': '??? ????????',
            'daily.form.action': '??????? ??????',
            'daily.form.responsible': '????? ????????',
            'daily.priority.low': '??????',
            'daily.priority.medium': '??????',
            'daily.priority.high': '?????',
            'daily.status.open': '?????',
            'daily.status.inProgress': '??? ???????',
            'daily.status.closed': '????',

            // BehaviorMonitoring Module translations
            'behavior.title': '?????? ??????',
            'behavior.subtitle': '????? ??????? ??????? ???????',
            'behavior.btn.newEvaluation': '????? ????',
            'behavior.table.date': '???????',
            'behavior.table.employee': '??????',
            'behavior.table.observer': '???????',
            'behavior.table.score': '???????',
            'behavior.table.status': '??????',
            'behavior.form.evaluationDate': '????? ???????',
            'behavior.form.employee': '??????',
            'behavior.form.observer': '???????',
            'behavior.form.ppeCompliance': '???????? ?????? ???????',
            'behavior.form.workProcedures': '??????? ?????',
            'behavior.form.attitude': '?????? ???????',
            'behavior.form.comments': '???????',
            'behavior.status.excellent': '?????',
            'behavior.status.good': '???',
            'behavior.status.needsImprovement': '????? ?????',
            'behavior.status.unsatisfactory': '??? ????',

            // ChemicalSafety Module translations
            'chemical.title': '?????? ??????????',
            'chemical.subtitle': '????? ????? ?????? ????????? ??????????',
            'chemical.btn.newChemical': '???? ?????',
            'chemical.btn.msds': '????? ?????? ???????',
            'chemical.tabs.inventory': '???????',
            'chemical.tabs.msds': '?????? SDS',
            'chemical.tabs.storage': '???????',
            'chemical.table.chemicalName': '??? ??????',
            'chemical.table.casNumber': '??? CAS',
            'chemical.table.hazardClass': '??? ???????',
            'chemical.table.quantity': '??????',
            'chemical.table.storageLocation': '???? ???????',
            'chemical.table.status': '??????',
            'chemical.form.chemicalName': '??? ?????? ??????????',
            'chemical.form.casNumber': '??? CAS',
            'chemical.form.hazardClass': '??? ???????',
            'chemical.form.quantity': '??????',
            'chemical.form.unit': '??????',
            'chemical.form.storageLocation': '???? ???????',
            'chemical.status.safe': '???',
            'chemical.status.hazardous': '????',
            'chemical.status.restricted': '???? ?????????',

            // PeriodicInspections Module translations
            'periodic.title': '???????? ???????',
            'periodic.subtitle': '????? ???????? ??????? ?????? ????????',
            'periodic.btn.newInspection': '??? ????',
            'periodic.btn.qrScan': '??? QR',
            'periodic.tabs.schedule': '???????',
            'periodic.tabs.register': '?????',
            'periodic.tabs.equipment': '?????? ????????',
            'periodic.tabs.analytics': '?????????',
            'periodic.table.equipmentName': '??? ??????',
            'periodic.table.equipmentId': '??? ??????',
            'periodic.table.inspectionType': '??? ?????',
            'periodic.table.dueDate': '????? ?????????',
            'periodic.table.status': '??????',
            'periodic.table.inspector': '??????',
            'periodic.form.equipmentName': '??? ??????/??????',
            'periodic.form.equipmentId': '??? ??????',
            'periodic.form.inspectionType': '??? ?????',
            'periodic.form.frequency': '????? ?????',
            'periodic.form.lastInspection': '????? ??? ???',
            'periodic.form.nextInspection': '????? ????? ??????',
            'periodic.form.inspector': '??? ??????',
            'periodic.status.pending': '????',
            'periodic.status.completed': '?????',
            'periodic.status.overdue': '?????',
            'periodic.frequency.daily': '????',
            'periodic.frequency.weekly': '??????',
            'periodic.frequency.monthly': '????',
            'periodic.frequency.quarterly': '??? ????',
            'periodic.frequency.yearly': '????',

            // SafetyBudget Module translations
            'budget.title': '??????? ???????',
            'budget.subtitle': '????? ??????? ??????? ?????? ???????',
            'budget.btn.newItem': '??? ????',
            'budget.btn.approve': '?????? ?????????',
            'budget.tabs.plan': '??? ?????????',
            'budget.tabs.actual': '????????? ???????',
            'budget.tabs.variance': '????? ????????',
            'budget.tabs.reports': '????????',
            'budget.table.itemName': '??? ?????',
            'budget.table.category': '?????',
            'budget.table.planned': '??????',
            'budget.table.actual': '??????',
            'budget.table.variance': '????????',
            'budget.table.status': '??????',
            'budget.form.itemName': '??? ????? ????????',
            'budget.form.category': '??? ?????????',
            'budget.form.plannedAmount': '?????? ??????',
            'budget.form.actualAmount': '?????? ??????',
            'budget.form.description': '?????',
            'budget.category.ppe': '????? ???????',
            'budget.category.training': '???????',
            'budget.category.equipment': '??????? ????????',
            'budget.status.underBudget': '??? ?????????',
            'budget.status.overBudget': '????? ?????????',
        },
        en: {
            // Common Buttons
            'btn.add': 'Add',
            'btn.edit': 'Edit',
            'btn.delete': 'Delete',
            'btn.save': 'Save',
            'btn.cancel': 'Cancel',
            'btn.close': 'Close',
            'btn.refresh': 'Refresh',
            'btn.search': 'Search',
            'btn.reset': 'Reset',
            'btn.export': 'Export',
            'btn.import': 'Import',
            'btn.print': 'Print',
            'btn.view': 'View',
            'btn.details': 'Details',
            'btn.back': 'Back',
            'btn.next': 'Next',
            'btn.previous': 'Previous',
            'btn.submit': 'Submit',
            'btn.approve': 'Approve',
            'btn.reject': 'Reject',
            'btn.filter': 'Filter',
            'btn.clear': 'Clear',
            'btn.download': 'Download',
            'btn.upload': 'Upload',
            'btn.new': 'New',
            'btn.create': 'Create',
            'btn.update': 'Update',
            'btn.confirm': 'Confirm',
            'btn.yes': 'Yes',
            'btn.no': 'No',

            // Table Headers
            'table.actions': 'Actions',
            'table.status': 'Status',
            'table.date': 'Date',
            'table.name': 'Name',
            'table.type': 'Type',
            'table.description': 'Description',
            'table.notes': 'Notes',
            'table.priority': 'Priority',
            'table.department': 'Department',
            'table.location': 'Location',
            'table.code': 'Code',
            'table.id': 'ID',
            'table.created': 'Created Date',
            'table.updated': 'Updated Date',
            'table.by': 'By',
            'table.count': 'Count',
            'table.total': 'Total',

            // Skeleton Loading
            'skeleton.loading': 'Loading...',
            'skeleton.noData': 'No data available',
            'skeleton.error': 'Error loading data',
            'skeleton.retry': 'Retry',
            'skeleton.empty': 'No items to display',

            // Common Messages
            'msg.success': 'Success',
            'msg.error': 'Error occurred',
            'msg.warning': 'Warning',
            'msg.info': 'Information',
            'msg.confirm': 'Are you sure?',
            'msg.saved': 'Saved successfully',
            'msg.deleted': 'Deleted successfully',
            'msg.updated': 'Updated successfully',
            'msg.loading': 'Loading...',
            'msg.processing': 'Processing...',
            'msg.noResults': 'No results found',
            'msg.searchPlaceholder': 'Search here...',
            'msg.select': 'Select...',
            'msg.all': 'All',
            'msg.none': 'None',
            'msg.required': 'Required field',
            'msg.invalid': 'Invalid data',
            'msg.networkError': 'Network connection error',
            'msg.serverError': 'Server error',
            'msg.timeout': 'Request timeout',
            'msg.unauthorized': 'Unauthorized',
            'msg.forbidden': 'Forbidden',
            'msg.notFound': 'Not found',

            // Filters
            'filter.all': 'All',
            'filter.active': 'Active',
            'filter.inactive': 'Inactive',
            'filter.pending': 'Pending',
            'filter.approved': 'Approved',
            'filter.rejected': 'Rejected',
            'filter.completed': 'Completed',
            'filter.open': 'Open',
            'filter.closed': 'Closed',
            'filter.dateFrom': 'Date From',
            'filter.dateTo': 'Date To',

            // Pagination
            'pagination.prev': 'Previous',
            'pagination.next': 'Next',
            'pagination.first': 'First',
            'pagination.last': 'Last',
            'pagination.of': 'of',
            'pagination.items': 'items',
            'pagination.page': 'Page',
            'pagination.showing': 'Showing',
            'pagination.to': 'to',

            // Modules
            'module.dashboard': 'Dashboard',
            'module.users': 'Users',
            'module.employees': 'Employees',
            'module.incidents': 'Incidents',
            'module.nearmiss': 'Near Miss Reports',
            'module.ptw': 'Work Permits',
            'module.training': 'Training',
            'module.clinic': 'Clinic',
            'module.fireequipment': 'Fire Equipment',
            'module.ppe': 'PPE',
            'module.contractors': 'Contractors',
            'module.violations': 'Violations',
            'module.reports': 'Reports',
            'module.settings': 'Settings',
            'module.behavior': 'Behavior Monitoring',
            'module.chemicals': 'Chemical Safety',
            'module.observations': 'Daily Observations',
            'module.iso': 'ISO',
            'module.emergency': 'Emergency',
            'module.risk': 'Risk Assessment',
            'module.documents': 'Documents',
            'module.audit': 'Audit',
            'module.sustainability': 'Sustainability',
            'module.inspections': 'Inspections',
            'module.safetyteam': 'Safety Team',

            // Settings Module specific translations
            'settings.title': 'Settings',
            'settings.subtitle': 'Manage system settings, integrations, and permissions',
            'settings.tabs.company': 'Company Data & Identity',
            'settings.tabs.integration': 'Integration & Sync',
            'settings.tabs.cloud': 'Cloud Storage',
            'settings.tabs.drive': 'Google Drive',
            'settings.tabs.sharepoint': 'Microsoft SharePoint',
            'settings.tabs.system': 'System Settings',
            'settings.tabs.forms': 'Form Settings',
            'settings.tabs.violations': 'Violation Types',
            'settings.tabs.reports': 'Reports & Notifications',
            'settings.tabs.email': 'Email Notifications',
            'settings.tabs.permissions': 'Permissions & Approvals',
            'settings.tabs.circuit': 'Approval Circuit',
            'settings.tabs.help': 'Help Center',
            'settings.tabs.logs': 'Logs & Monitoring',
            'settings.tabs.privacy': 'Privacy & Cookies',
            'settings.privacy.subtitle': 'Manage privacy and cookie preferences for your organization',
            'settings.privacy.cookiePrefs': 'Current Cookie Preferences',
            'settings.privacy.manageCookies': 'Manage Cookies',
            'settings.privacy.policy': 'Cookie Policy',
            'settings.privacy.consentHistory': 'Consent History',
            
            'settings.company.title': 'Company Data & Identity',
            'settings.company.subtitle': 'Company information, logo, and visual identity settings',
            'settings.company.name': 'Company Name (appears in header and reports)',
            'settings.company.nameHint': 'This name will be used in the application header and all PDF reports.',
            'settings.company.fontSize': 'Company Name Font Size (pixels)',
            'settings.company.fontSizeHint': 'Default font size: 16px. You can change it from 8 to 72 pixels.',
            'settings.company.secondaryName': 'Secondary Name / Additional Line (appears in header and reports)',
            'settings.company.secondaryNameHint': 'This line will be displayed below the company name in the header and reports. If left empty, it will not appear in the interface or PDF.',

            // PTW Module specific translations
            'ptw.title': 'Work Permits',
            'ptw.subtitle': 'Permit to Work Management',
            'ptw.tabs.list': 'Permits List',
            'ptw.tabs.registry': 'Permits Registry',
            'ptw.tabs.analytics': 'Analytics',
            'ptw.btn.newPermit': 'New Permit',
            'ptw.btn.approve': 'Approve',
            'ptw.btn.reject': 'Reject',
            'ptw.status.pending': 'Pending',
            'ptw.status.approved': 'Approved',
            'ptw.status.rejected': 'Rejected',
            'ptw.status.expired': 'Expired',
            'ptw.status.active': 'Active',
            'ptw.form.permitType': 'Permit Type',
            'ptw.form.workLocation': 'Work Location',
            'ptw.form.workDescription': 'Work Description',
            'ptw.form.startDate': 'Start Date',
            'ptw.form.endDate': 'End Date',
            'ptw.form.requestingParty': 'Requesting Party',
            'ptw.form.approvals': 'Approvals',
            'ptw.safety.officer': 'Safety Officer',
            'ptw.safety.required': 'Safety approval is required',

            // Users Module translations
            'users.title': 'Users',
            'users.subtitle': 'User and Permission Management',
            'users.btn.newUser': 'New User',
            'users.table.name': 'Name',
            'users.table.email': 'Email',
            'users.table.role': 'Role',
            'users.table.department': 'Department',
            'users.table.status': 'Status',
            'users.status.active': 'Active',
            'users.status.inactive': 'Inactive',
            'users.form.fullName': 'Full Name',
            'users.form.email': 'Email',
            'users.form.password': 'Password',
            'users.form.role': 'Job Role',
            'users.form.department': 'Department',

            // Incidents Module translations
            'incidents.title': 'Incidents',
            'incidents.subtitle': 'Incident Recording and Tracking',
            'incidents.btn.newIncident': 'New Incident',
            'incidents.table.incidentType': 'Incident Type',
            'incidents.table.date': 'Incident Date',
            'incidents.table.location': 'Location',
            'incidents.table.severity': 'Severity',
            'incidents.table.status': 'Status',
            'incidents.form.description': 'Incident Description',
            'incidents.form.injuredPerson': 'Injured Person',
            'incidents.form.witnesses': 'Witnesses',
            'incidents.form.immediateAction': 'Immediate Action',
            'incidents.form.rootCause': 'Root Cause',
            'incidents.form.correctiveAction': 'Corrective Action',
            'incidents.severity.low': 'Low',
            'incidents.severity.medium': 'Medium',
            'incidents.severity.high': 'High',
            'incidents.severity.critical': 'Critical',
            'incidents.status.open': 'Open',
            'incidents.status.investigating': 'Investigating',
            'incidents.status.closed': 'Closed',

            // Training Module translations
            'training.title': 'Training',
            'training.subtitle': 'Training Programs and Certificates Management',
            'training.btn.newTraining': 'New Training Program',
            'training.btn.newCertificate': 'New Certificate',
            'training.table.trainingName': 'Program Name',
            'training.table.trainer': 'Trainer',
            'training.table.date': 'Date',
            'training.table.duration': 'Duration',
            'training.table.participants': 'Participants',
            'training.table.status': 'Status',
            'training.form.trainingType': 'Training Type',
            'training.form.trainingTopic': 'Training Topic',
            'training.form.trainer': 'Trainer',
            'training.form.location': 'Training Location',
            'training.form.startDate': 'Start Date',
            'training.form.endDate': 'End Date',
            'training.form.duration': 'Duration (hours)',
            'training.status.planned': 'Planned',
            'training.status.ongoing': 'Ongoing',
            'training.status.completed': 'Completed',
            'training.status.cancelled': 'Cancelled',
            'training.certificate.title': 'Certificates',
            'training.certificate.employee': 'Employee',
            'training.certificate.issueDate': 'Issue Date',
            'training.certificate.expiryDate': 'Expiry Date',
            'training.certificate.status': 'Certificate Status',
            'training.certificate.valid': 'Valid',
            'training.certificate.expired': 'Expired',

            // NearMiss Module translations
            'nearmiss.title': 'Near Miss Reports',
            'nearmiss.subtitle': 'Record and track near miss incident reports',
            'nearmiss.btn.newReport': 'New Report',
            'nearmiss.table.date': 'Report Date',
            'nearmiss.table.location': 'Location',
            'nearmiss.table.type': 'Report Type',
            'nearmiss.table.severity': 'Severity',
            'nearmiss.table.reporter': 'Reporter',
            'nearmiss.table.status': 'Status',
            'nearmiss.form.description': 'Near Miss Description',
            'nearmiss.form.immediateAction': 'Immediate Action Taken',
            'nearmiss.form.suggestedAction': 'Suggested Action',
            'nearmiss.status.reported': 'Reported',
            'nearmiss.status.underReview': 'Under Review',
            'nearmiss.status.resolved': 'Resolved',

            // Clinic Module translations
            'clinic.title': 'Clinic',
            'clinic.subtitle': 'Manage clinic visits and medical cases',
            'clinic.btn.newVisit': 'New Visit',
            'clinic.tabs.visits': 'Visit Log',
            'clinic.tabs.employees': 'Employees',
            'clinic.tabs.contractors': 'Contractors',
            'clinic.tabs.medications': 'Medications',
            'clinic.tabs.analytics': 'Analytics',
            'clinic.table.employeeCode': 'Employee Code',
            'clinic.table.name': 'Name',
            'clinic.table.visitDate': 'Visit Date',
            'clinic.table.reason': 'Reason',
            'clinic.table.diagnosis': 'Diagnosis',
            'clinic.table.status': 'Status',
            'clinic.table.medications': 'Medications',
            'clinic.form.patientType': 'Patient Type',
            'clinic.form.patientName': 'Patient Name',
            'clinic.form.visitDate': 'Visit Date',
            'clinic.form.reason': 'Reason for Visit',
            'clinic.form.diagnosis': 'Diagnosis',
            'clinic.form.treatment': 'Treatment',
            'clinic.form.medications': 'Dispensed Medications',
            'clinic.status.treated': 'Treated',
            'clinic.status.referred': 'Referred',
            'clinic.status.followUp': 'Follow Up',

            // FireEquipment Module translations
            'fire.title': 'Fire Equipment',
            'fire.subtitle': 'Manage and inspect fire and safety equipment',
            'fire.btn.newEquipment': 'New Equipment',
            'fire.btn.inspect': 'Inspect',
            'fire.btn.qrScan': 'Scan QR',
            'fire.tabs.database': 'Database',
            'fire.tabs.register': 'Register',
            'fire.tabs.inspections': 'Inspections',
            'fire.tabs.analytics': 'Analytics',
            'fire.table.equipmentId': 'Equipment ID',
            'fire.table.type': 'Type',
            'fire.table.location': 'Location',
            'fire.table.status': 'Status',
            'fire.table.lastInspection': 'Last Inspection',
            'fire.table.nextInspection': 'Next Inspection',
            'fire.form.equipmentType': 'Equipment Type',
            'fire.form.deviceId': 'Equipment ID',
            'fire.form.location': 'Equipment Location',
            'fire.form.installationDate': 'Installation Date',
            'fire.form.lastInspection': 'Last Inspection Date',
            'fire.status.active': 'Active',
            'fire.status.maintenance': 'Needs Maintenance',
            'fire.status.outOfService': 'Out of Service',
            'fire.inspection.monthly': 'Monthly Inspection',
            'fire.inspection.quarterly': 'Quarterly Inspection',

            // PPE Module translations
            'ppe.title': 'Personal Protective Equipment',
            'ppe.subtitle': 'Manage and track personal protective equipment',
            'ppe.btn.newItem': 'New Item',
            'ppe.btn.issue': 'Issue',
            'ppe.btn.return': 'Return',
            'ppe.tabs.inventory': 'Inventory',
            'ppe.tabs.issuance': 'Issuance',
            'ppe.tabs.returns': 'Returns',
            'ppe.tabs.analytics': 'Analytics',
            'ppe.table.itemName': 'Item Name',
            'ppe.table.category': 'Category',
            'ppe.table.quantity': 'Quantity',
            'ppe.table.unit': 'Unit',
            'ppe.table.minStock': 'Min Stock',
            'ppe.table.status': 'Status',
            'ppe.table.employee': 'Employee',
            'ppe.table.issueDate': 'Issue Date',
            'ppe.table.returnDate': 'Return Date',
            'ppe.form.itemName': 'Item Name',
            'ppe.form.category': 'Category',
            'ppe.form.quantity': 'Quantity',
            'ppe.form.unit': 'Unit',
            'ppe.form.minStock': 'Minimum Stock Level',
            'ppe.status.available': 'Available',
            'ppe.status.lowStock': 'Low Stock',
            'ppe.status.outOfStock': 'Out of Stock',

            // Employees Module translations
            'employees.title': 'Employees',
            'employees.subtitle': 'Manage employee data and job positions',
            'employees.btn.newEmployee': 'New Employee',
            'employees.table.employeeCode': 'Employee Code',
            'employees.table.fullName': 'Full Name',
            'employees.table.jobTitle': 'Job Title',
            'employees.table.department': 'Department',
            'employees.table.factory': 'Factory',
            'employees.table.workplace': 'Workplace',
            'employees.table.joinDate': 'Join Date',
            'employees.table.status': 'Status',
            'employees.form.fullName': 'Full Name',
            'employees.form.employeeCode': 'Employee Code',
            'employees.form.jobTitle': 'Job Title',
            'employees.form.department': 'Department',
            'employees.form.factory': 'Factory',
            'employees.form.workplace': 'Workplace',
            'employees.form.phone': 'Phone Number',
            'employees.form.email': 'Email',
            'employees.form.joinDate': 'Join Date',
            'employees.status.active': 'Active',
            'employees.status.inactive': 'Inactive',
            'employees.status.onLeave': 'On Leave',

            // Contractors Module translations
            'contractors.title': 'Contractors',
            'contractors.subtitle': 'Manage contractors and contracts',
            'contractors.btn.newContractor': 'New Contractor',
            'contractors.btn.evaluate': 'Evaluate',
            'contractors.btn.approve': 'Approve',
            'contractors.tabs.list': 'Contractors List',
            'contractors.tabs.approved': 'Approved',
            'contractors.tabs.evaluations': 'Evaluations',
            'contractors.tabs.requests': 'Approval Requests',
            'contractors.table.contractorName': 'Contractor Name',
            'contractors.table.company': 'Company',
            'contractors.table.specialty': 'Specialty',
            'contractors.table.contractNumber': 'Contract Number',
            'contractors.table.startDate': 'Start Date',
            'contractors.table.endDate': 'End Date',
            'contractors.table.status': 'Status',
            'contractors.form.companyName': 'Company Name',
            'contractors.form.contractorName': 'Contractor Name',
            'contractors.form.specialty': 'Specialty',
            'contractors.form.contractNumber': 'Contract Number',
            'contractors.form.startDate': 'Contract Start Date',
            'contractors.form.endDate': 'Contract End Date',
            'contractors.form.contactPerson': 'Contact Person',
            'contractors.form.phone': 'Phone Number',
            'contractors.form.email': 'Email',
            'contractors.status.active': 'Active',
            'contractors.status.expired': 'Expired',
            'contractors.status.pending': 'Pending',
            'contractors.status.approved': 'Approved',

            // Violations Module translations
            'violations.title': 'Violations',
            'violations.subtitle': 'Manage and track violations and penalties',
            'violations.btn.newViolation': 'New Violation',
            'violations.btn.newPenalty': 'New Penalty',
            'violations.tabs.violations': 'Violations',
            'violations.tab.penalties': 'Penalties',
            'violations.tabs.analytics': 'Analytics',
            'violations.table.violationType': 'Violation Type',
            'violations.table.date': 'Violation Date',
            'violations.table.employee': 'Employee/Contractor',
            'violations.table.severity': 'Severity',
            'violations.table.status': 'Status',
            'violations.table.penalty': 'Penalty',
            'violations.form.violationDescription': 'Violation Description',
            'violations.form.violationLocation': 'Violation Location',
            'violations.form.violationDate': 'Violation Date',
            'violations.form.violationTime': 'Violation Time',
            'violations.form.witnesses': 'Witnesses',
            'violations.form.evidence': 'Evidence/Proof',
            'violations.severity.low': 'Low',
            'violations.severity.medium': 'Medium',
            'violations.severity.high': 'High',
            'violations.severity.critical': 'Critical',
            'violations.status.pending': 'Pending',
            'violations.status.approved': 'Approved',
            'violations.status.rejected': 'Rejected',

            // Reports Module translations
            'reports.title': 'Reports',
            'reports.subtitle': 'Create and manage reports',
            'reports.btn.newReport': 'New Report',
            'reports.btn.generate': 'Generate Report',
            'reports.btn.export': 'Export',
            'reports.tabs.saved': 'Saved Reports',
            'reports.tabs.generate': 'Generate Report',
            'reports.tabs.scheduled': 'Scheduled Reports',
            'reports.table.reportName': 'Report Name',
            'reports.table.reportType': 'Report Type',
            'reports.table.createdBy': 'Created By',
            'reports.table.createdDate': 'Created Date',
            'reports.table.lastRun': 'Last Run',
            'reports.table.status': 'Status',
            'reports.form.reportName': 'Report Name',
            'reports.form.reportType': 'Report Type',
            'reports.form.dateRange': 'Date Range',
            'reports.form.filters': 'Filters',
            'reports.status.active': 'Active',
            'reports.status.inactive': 'Inactive',

            // ISO Module translations
            'iso.title': 'ISO Quality Management System',
            'iso.subtitle': 'Manage ISO quality management requirements and certificates',
            'iso.btn.newDocument': 'New Document',
            'iso.btn.audit': 'New Audit',
            'iso.tabs.documents': 'Documents',
            'iso.tabs.audits': 'Audits',
            'iso.tabs.certificates': 'Certificates',
            'iso.tabs.analytics': 'Analytics',
            'iso.table.documentCode': 'Document Code',
            'iso.table.documentName': 'Document Name',
            'iso.table.version': 'Version',
            'iso.table.issueDate': 'Issue Date',
            'iso.table.reviewDate': 'Review Date',
            'iso.table.status': 'Status',
            'iso.form.documentCode': 'Document Code',
            'iso.form.documentName': 'Document Name',
            'iso.form.version': 'Version Number',
            'iso.form.issueDate': 'Issue Date',
            'iso.form.reviewDate': 'Next Review Date',
            'iso.status.active': 'Active',
            'iso.status.underReview': 'Under Review',
            'iso.status.archived': 'Archived',

            // Emergency Module translations
            'emergency.title': 'Emergency',
            'emergency.subtitle': 'Manage emergency plans and evacuation procedures',
            'emergency.btn.newPlan': 'New Emergency Plan',
            'emergency.btn.drill': 'Evacuation Drill',
            'emergency.tabs.plans': 'Emergency Plans',
            'emergency.tabs.drills': 'Drills',
            'emergency.tabs.equipment': 'Emergency Equipment',
            'emergency.tabs.contacts': 'Contacts',
            'emergency.table.planName': 'Plan Name',
            'emergency.table.planType': 'Plan Type',
            'emergency.table.lastDrill': 'Last Drill',
            'emergency.table.nextDrill': 'Next Drill',
            'emergency.table.status': 'Status',
            'emergency.form.planName': 'Emergency Plan Name',
            'emergency.form.planType': 'Plan Type',
            'emergency.form.assemblyPoint': 'Assembly Point',
            'emergency.form.evacuationRoutes': 'Evacuation Routes',
            'emergency.status.active': 'Active',
            'emergency.status.inactive': 'Inactive',

            // SOP/JHA Module translations
            'sop.title': 'Safe Operating Procedures',
            'sop.subtitle': 'Manage safe operating procedures and job hazard analysis',
            'sop.btn.newSOP': 'New SOP',
            'sop.btn.newJHA': 'New JHA',
            'sop.tabs.sop': 'Procedures',
            'sop.tabs.jha': 'Hazard Analysis',
            'sop.tabs.approvals': 'Approvals',
            'sop.table.sopCode': 'SOP Code',
            'sop.table.sopName': 'SOP Name',
            'sop.table.department': 'Department',
            'sop.table.revision': 'Revision',
            'sop.table.lastUpdate': 'Last Update',
            'sop.table.status': 'Status',
            'sop.form.sopCode': 'SOP Code',
            'sop.form.sopName': 'SOP Name',
            'sop.form.department': 'Department',
            'sop.form.purpose': 'Purpose',
            'sop.form.scope': 'Scope',
            'sop.form.responsibilities': 'Responsibilities',
            'sop.form.procedures': 'Procedures',
            'sop.status.active': 'Active',
            'sop.status.underReview': 'Under Review',
            'sop.status.obsolete': 'Obsolete',

            // DailyObservations Module translations
            'daily.title': 'Daily Observations',
            'daily.subtitle': 'Record daily observations on the factory floor',
            'daily.btn.newObservation': 'New Observation',
            'daily.table.date': 'Date',
            'daily.table.observer': 'Observer',
            'daily.table.location': 'Location',
            'daily.table.observation': 'Observation',
            'daily.table.category': 'Category',
            'daily.table.priority': 'Priority',
            'daily.table.status': 'Status',
            'daily.form.observationDate': 'Observation Date',
            'daily.form.observerName': 'Observer Name',
            'daily.form.location': 'Location',
            'daily.form.category': 'Observation Category',
            'daily.form.description': 'Observation Description',
            'daily.form.action': 'Action Taken',
            'daily.form.responsible': 'Responsible Party',
            'daily.priority.low': 'Low',
            'daily.priority.medium': 'Medium',
            'daily.priority.high': 'High',
            'daily.status.open': 'Open',
            'daily.status.inProgress': 'In Progress',
            'daily.status.closed': 'Closed',

            // BehaviorMonitoring Module translations
            'behavior.title': 'Behavior Monitoring',
            'behavior.subtitle': 'Evaluate and monitor safety behaviors',
            'behavior.btn.newEvaluation': 'New Evaluation',
            'behavior.table.date': 'Date',
            'behavior.table.employee': 'Employee',
            'behavior.table.observer': 'Observer',
            'behavior.table.score': 'Score',
            'behavior.table.status': 'Status',
            'behavior.form.evaluationDate': 'Evaluation Date',
            'behavior.form.employee': 'Employee',
            'behavior.form.observer': 'Observer',
            'behavior.form.ppeCompliance': 'PPE Compliance',
            'behavior.form.workProcedures': 'Work Procedures',
            'behavior.form.attitude': 'Behavior and Attitude',
            'behavior.form.comments': 'Comments',
            'behavior.status.excellent': 'Excellent',
            'behavior.status.good': 'Good',
            'behavior.status.needsImprovement': 'Needs Improvement',
            'behavior.status.unsatisfactory': 'Unsatisfactory',

            // ChemicalSafety Module translations
            'chemical.title': 'Chemical Safety',
            'chemical.subtitle': 'Manage chemical and product safety',
            'chemical.btn.newChemical': 'New Chemical',
            'chemical.btn.msds': 'Safety Data Sheet',
            'chemical.tabs.inventory': 'Inventory',
            'chemical.tabs.msds': 'SDS Cards',
            'chemical.tabs.storage': 'Storage',
            'chemical.table.chemicalName': 'Chemical Name',
            'chemical.table.casNumber': 'CAS Number',
            'chemical.table.hazardClass': 'Hazard Class',
            'chemical.table.quantity': 'Quantity',
            'chemical.table.storageLocation': 'Storage Location',
            'chemical.table.status': 'Status',
            'chemical.form.chemicalName': 'Chemical Name',
            'chemical.form.casNumber': 'CAS Number',
            'chemical.form.hazardClass': 'Hazard Class',
            'chemical.form.quantity': 'Quantity',
            'chemical.form.unit': 'Unit',
            'chemical.form.storageLocation': 'Storage Location',
            'chemical.status.safe': 'Safe',
            'chemical.status.hazardous': 'Hazardous',
            'chemical.status.restricted': 'Restricted Use',

            // PeriodicInspections Module translations
            'periodic.title': 'Periodic Inspections',
            'periodic.subtitle': 'Manage periodic inspections for machinery and equipment',
            'periodic.btn.newInspection': 'New Inspection',
            'periodic.btn.qrScan': 'Scan QR',
            'periodic.tabs.schedule': 'Schedule',
            'periodic.tabs.register': 'Register',
            'periodic.tabs.equipment': 'Equipment',
            'periodic.tabs.analytics': 'Analytics',
            'periodic.table.equipmentName': 'Equipment Name',
            'periodic.table.equipmentId': 'Equipment ID',
            'periodic.table.inspectionType': 'Inspection Type',
            'periodic.table.dueDate': 'Due Date',
            'periodic.table.status': 'Status',
            'periodic.table.inspector': 'Inspector',
            'periodic.form.equipmentName': 'Equipment Name',
            'periodic.form.equipmentId': 'Equipment ID',
            'periodic.form.inspectionType': 'Inspection Type',
            'periodic.form.frequency': 'Inspection Frequency',
            'periodic.form.lastInspection': 'Last Inspection Date',
            'periodic.form.nextInspection': 'Next Inspection Date',
            'periodic.form.inspector': 'Inspector Name',
            'periodic.status.pending': 'Pending',
            'periodic.status.completed': 'Completed',
            'periodic.status.overdue': 'Overdue',
            'periodic.frequency.daily': 'Daily',
            'periodic.frequency.weekly': 'Weekly',
            'periodic.frequency.monthly': 'Monthly',
            'periodic.frequency.quarterly': 'Quarterly',
            'periodic.frequency.yearly': 'Yearly',

            // SafetyBudget Module translations
            'budget.title': 'Safety Budget',
            'budget.subtitle': 'Manage HSE safety budget',
            'budget.btn.newItem': 'New Budget Item',
            'budget.btn.approve': 'Approve Budget',
            'budget.tabs.plan': 'Budget Plan',
            'budget.tabs.actual': 'Actual Spending',
            'budget.tabs.variance': 'Variance Analysis',
            'budget.tabs.reports': 'Reports',
            'budget.table.itemName': 'Item Name',
            'budget.table.category': 'Category',
            'budget.table.planned': 'Planned',
            'budget.table.actual': 'Actual',
            'budget.table.variance': 'Variance',
            'budget.table.status': 'Status',
            'budget.form.itemName': 'Budget Item Name',
            'budget.form.category': 'Budget Category',
            'budget.form.plannedAmount': 'Planned Amount',
            'budget.form.actualAmount': 'Actual Amount',
            'budget.form.description': 'Description',
            'budget.category.ppe': 'PPE Equipment',
            'budget.category.training': 'Training',
            'budget.category.equipment': 'Equipment',
            'budget.status.underBudget': 'Under Budget',
            'budget.status.overBudget': 'Over Budget',
        }
    },

    /**
     * ?????? ??? ????? ???????
     * @returns {string} 'ar' ?? 'en'
     */
    getCurrentLanguage() {
        return AppState?.currentLanguage || localStorage.getItem('language') || this.defaultLanguage;
    },

    /**
     * ?????? ?? RTL
     * @returns {boolean}
     */
    isRTL() {
        return this.getCurrentLanguage() === 'ar';
    },

    /**
     * ?????? ??? ?????
     * @param {string} key - ????? ???????
     * @param {string} defaultValue - ?????? ??????????
     * @returns {string}
     */
    t(key, defaultValue = null) {
        const lang = this.getCurrentLanguage();
        const translation = this.translations[lang]?.[key];
        return translation || defaultValue || key;
    },

    /**
     * ????? ?????? ?????
     * @param {string} lang - ????? ('ar' ?? 'en')
     * @param {Object} newTranslations - ???? ???????? ???????
     */
    addTranslations(lang, newTranslations) {
        if (!this.translations[lang]) {
            this.translations[lang] = {};
        }
        Object.assign(this.translations[lang], newTranslations);
    },

    /**
     * ?????? ??? ?????? ?????? ????
     * @param {string} moduleName - ??? ????????
     * @returns {Object} { t: function, isRTL: boolean, lang: string }
     */
    getModuleTranslations(moduleName) {
        const lang = this.getCurrentLanguage();
        const isRTL = this.isRTL();

        return {
            t: (key, defaultValue) => this.t(`${moduleName}.${key}`, defaultValue),
            isRTL,
            lang
        };
    },
};

// Export I18n globally
if (typeof window !== 'undefined') {
    window.I18n = I18n;
}

