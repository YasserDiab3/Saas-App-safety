/**
 * saas-capa.js — closed-loop CAPA helpers on ActionTrackingRegister.
 */
(function (global) {
    const CAPA_STATUSES = ['Open', 'In Progress', 'Pending Verification', 'Closed', 'Overdue'];

    function ensureRegister() {
        if (!global.AppState || !AppState.appData) return [];
        if (!Array.isArray(AppState.appData.actionTrackingRegister)) AppState.appData.actionTrackingRegister = [];
        if (!Array.isArray(AppState.appData.actionTracking)) AppState.appData.actionTracking = AppState.appData.actionTrackingRegister;
        return AppState.appData.actionTrackingRegister;
    }

    function list(filter) {
        let rows = ensureRegister().slice();
        if (global.SaaSOrgSites && SaaSOrgSites.filterBySite) {
            rows = SaaSOrgSites.filterBySite(rows, filter && filter.siteId);
        }
        if (filter && filter.status) {
            rows = rows.filter((r) => String(r.status || '') === String(filter.status));
        }
        if (filter && filter.sourceType) {
            rows = rows.filter((r) => String(r.sourceType || '') === String(filter.sourceType));
        }
        if (filter && filter.overdueOnly) {
            const today = new Date().toISOString().slice(0, 10);
            rows = rows.filter((r) => {
                const st = String(r.status || '');
                if (st === 'Closed' || st === 'مغلق') return false;
                const due = String(r.originalTargetDate || r.dueDate || '').slice(0, 10);
                return due && due < today;
            });
        }
        return rows;
    }

    function overdueBySite() {
        const rows = list({ overdueOnly: true });
        const map = {};
        rows.forEach((r) => {
            const sid = (global.SaaSOrgSites && SaaSOrgSites.recordSiteId(r)) || 'unassigned';
            map[sid] = (map[sid] || 0) + 1;
        });
        return map;
    }

    function buildFromSource(sourceType, sourceRecord, extras) {
        const src = sourceRecord || {};
        const now = new Date().toISOString();
        const id = 'ATR-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        const title =
            src.title ||
            src.description ||
            src.observationIssueHazard ||
            src.hazardDescription ||
            src.incidentType ||
            src.type ||
            'إجراء تصحيحي';
        return Object.assign(
            {
                id,
                serialNumber: id,
                issueDate: now.slice(0, 10),
                typeOfIssue: 'CAPA',
                observationClassification: sourceType || 'manual',
                observationIssueHazard: String(title).slice(0, 500),
                correctivePreventiveAction: (extras && extras.action) || '',
                rootCause: (extras && extras.rootCause) || src.rootCause || '',
                department: src.department || '',
                location: src.location || src.place || '',
                siteId: src.siteId || src.site_id || '',
                riskRating: src.riskRating || src.severity || '',
                responsible: src.responsible || src.assignedTo || '',
                originalTargetDate: (extras && extras.dueDate) || '',
                status: 'Open',
                capaLifecycle: 'Open',
                sourceType: sourceType || 'manual',
                sourceId: src.id || '',
                effectivenessCheck: '',
                effectivenessVerifiedAt: '',
                effectivenessVerifiedBy: '',
                requireEffectiveness: true,
                createdAt: now,
                updatedAt: now,
                createdBy: (global.AppState && AppState.currentUser && (AppState.currentUser.email || AppState.currentUser.name)) || '',
                updatedBy: ''
            },
            extras && typeof extras === 'object' ? extras.fields || {} : {}
        );
    }

    async function createFromSource(sourceType, sourceRecord, extras) {
        const row = buildFromSource(sourceType, sourceRecord, extras);
        ensureRegister().push(row);
        AppState.appData.actionTracking = AppState.appData.actionTrackingRegister;
        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave('ActionTrackingRegister', AppState.appData.actionTrackingRegister);
        } else if (global.DataManager) {
            DataManager.save();
        }
        if (global.AuditLog && AuditLog.log) {
            AuditLog.log('capa_create', sourceType || 'action-tracking', row.id, {
                sourceId: row.sourceId,
                status: row.status
            });
        }
        if (global.SaaSNotify && SaaSNotify.enqueue) {
            SaaSNotify.enqueue('capa_created', {
                title: 'CAPA جديد',
                body: row.observationIssueHazard,
                recordId: row.id,
                siteId: row.siteId
            }).catch(() => {});
        }
        return row;
    }

    function canClose(row) {
        if (!row) return false;
        if (row.requireEffectiveness === false) return true;
        const check = String(row.effectivenessCheck || '').trim();
        return check.length >= 3;
    }

    async function transition(id, nextStatus, meta) {
        const rows = ensureRegister();
        const idx = rows.findIndex((r) => String(r.id) === String(id));
        if (idx < 0) throw new Error('CAPA غير موجود');
        const row = rows[idx];
        const status = String(nextStatus || '').trim();
        if (status === 'Closed' || status === 'مغلق') {
            if (!canClose(row)) {
                throw new Error('لا يمكن الإغلاق قبل إثبات تحقق الفعالية (effectivenessCheck)');
            }
            row.effectivenessVerifiedAt = new Date().toISOString();
            row.effectivenessVerifiedBy =
                (meta && meta.by) ||
                (global.AppState && AppState.currentUser && (AppState.currentUser.email || AppState.currentUser.name)) ||
                '';
        }
        if (meta && meta.effectivenessCheck) row.effectivenessCheck = meta.effectivenessCheck;
        row.status = status;
        row.capaLifecycle = status;
        row.updatedAt = new Date().toISOString();
        rows[idx] = row;
        if (global.Backend && Backend.autoSave) {
            await Backend.autoSave('ActionTrackingRegister', rows);
        } else if (global.DataManager) DataManager.save();
        if (global.AuditLog && AuditLog.log) {
            AuditLog.log('capa_transition', 'action-tracking', id, { status, meta: meta || {} });
        }
        return row;
    }

    function promptCreateFromRecord(sourceType, record) {
        if (!record || !record.id) {
            alert('لا يوجد سجل مصدر');
            return Promise.resolve(null);
        }
        const action = window.prompt('صف الإجراء التصحيحي / الوقائي المطلوب:', '');
        if (action == null) return Promise.resolve(null);
        const due = window.prompt('تاريخ الاستحقاق (YYYY-MM-DD) اختياري:', '');
        return createFromSource(sourceType, record, { action: action || '', dueDate: due || '' }).then((row) => {
            if (typeof Notification !== 'undefined' && Notification.success) {
                Notification.success('تم إنشاء CAPA: ' + row.id);
            } else {
                alert('تم إنشاء CAPA: ' + row.id);
            }
            return row;
        });
    }

    function renderOverdueWidget(el) {
        if (!el) return;
        const map = overdueBySite();
        const sites = Object.keys(map);
        if (!sites.length) {
            el.innerHTML = `<div class="hse-empty-state"><p class="hse-empty-state__title">لا CAPA متأخر</p></div>`;
            return;
        }
        el.innerHTML = `<div class="hse-exec-board">${sites
            .map((sid) => {
                const site = global.SaaSOrgSites && SaaSOrgSites.getSite(sid);
                const label = site ? site.name : sid === 'unassigned' ? 'بدون موقع' : sid;
                return `<div class="hse-exec-card"><div class="hse-exec-card__label">${label}</div><div class="hse-exec-card__value">${map[sid]}</div></div>`;
            })
            .join('')}</div>`;
    }

    global.SaaSCAPA = {
        CAPA_STATUSES,
        list,
        overdueBySite,
        buildFromSource,
        createFromSource,
        promptCreateFromRecord,
        canClose,
        transition,
        renderOverdueWidget
    };
})(window);
