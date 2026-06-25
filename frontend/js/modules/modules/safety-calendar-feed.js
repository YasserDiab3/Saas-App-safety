/**
 * safety-calendar-feed.js — aggregate HSE module dates into calendar events.
 */
(function (win) {
    const MODULE_FEEDS = [
        {
            moduleKey: 'ptw',
            eventType: 'module_ptw',
            color: '#EA580C',
            icon: 'fa-hard-hat',
            link: '#ptw',
            labelAr: 'تصريح عمل',
            labelEn: 'Work permit',
            listKey: 'ptw',
            title: (r) => r.workDescription || r.permitType || r.location || `تصريح ${r.id || ''}`.trim(),
            dates: (r) => [{ start: r.startDate || r.openDate || r.timeFrom || r.createdAt, end: r.endDate || r.timeTo }],
            meta: (r) => ({ status: r.status, location: r.location, assignee: r.authorizedParty })
        },
        {
            moduleKey: 'training',
            eventType: 'module_training',
            color: '#2563EB',
            icon: 'fa-graduation-cap',
            link: '#training',
            labelAr: 'تدريب',
            labelEn: 'Training',
            listKey: 'training',
            title: (r) => r.name || r.subject || r.topic || r.title || 'تدريب',
            dates: (r) => [{ start: r.startDate || r.date || r.trainingDate, end: r.endDate || r.startDate || r.date }],
            meta: (r) => ({ location: r.location, assignee: r.trainer || r.conductedBy, status: r.status })
        },
        {
            moduleKey: 'incidents',
            eventType: 'module_incident',
            color: '#DC2626',
            icon: 'fa-exclamation-triangle',
            link: '#incidents',
            labelAr: 'حادث',
            labelEn: 'Incident',
            listKey: 'incidents',
            title: (r) => r.title || r.incidentType || r.description || r.location || 'حادث',
            dates: (r) => [{ start: r.date || r.incidentDate || r.createdAt, end: r.date || r.incidentDate }],
            meta: (r) => ({ status: r.status, location: r.location, priority: r.severity, description: r.description })
        },
        {
            moduleKey: 'nearmiss',
            eventType: 'module_nearmiss',
            color: '#D97706',
            icon: 'fa-eye',
            link: '#nearmiss',
            labelAr: 'حادث وشيك',
            labelEn: 'Near miss',
            listKey: 'nearmiss',
            title: (r) => r.description || r.title || r.location || 'حادث وشيك',
            dates: (r) => [{ start: r.date || r.nearmissDate || r.createdAt, end: r.date || r.nearmissDate }]
        },
        {
            moduleKey: 'violations',
            eventType: 'module_violation',
            color: '#9333EA',
            icon: 'fa-ban',
            link: '#violations',
            labelAr: 'مخالفة',
            labelEn: 'Violation',
            listKey: 'violations',
            title: (r) => r.violationType || r.type || r.description || 'مخالفة',
            dates: (r) => [{ start: r.date || r.violationDate || r.createdAt, end: r.date || r.violationDate }]
        },
        {
            moduleKey: 'daily-observations',
            eventType: 'module_observation',
            color: '#0D9488',
            icon: 'fa-clipboard-check',
            link: '#daily-observations',
            labelAr: 'ملاحظة يومية',
            labelEn: 'Daily observation',
            listKey: 'dailyObservations',
            title: (r) => r.observationType || r.category || r.description || r.siteName || 'ملاحظة',
            dates: (r) => [{ start: r.date || r.observationDate || r.createdAt, end: r.date || r.observationDate }]
        },
        {
            moduleKey: 'user-tasks',
            eventType: 'module_task',
            color: '#4F46E5',
            icon: 'fa-tasks',
            link: '#user-tasks',
            labelAr: 'مهمة',
            labelEn: 'Task',
            listKey: 'userTasks',
            title: (r) => r.title || r.taskTitle || r.description || 'مهمة',
            dates: (r) => [{ start: r.dueDate || r.startDate || r.createdAt, end: r.dueDate }]
        },
        {
            moduleKey: 'periodic-inspections',
            eventType: 'module_inspection',
            color: '#0891B2',
            icon: 'fa-search',
            link: '#periodic-inspections',
            labelAr: 'فحص دوري',
            labelEn: 'Inspection',
            listKey: 'periodicInspectionSchedules',
            title: (r) => r.title || r.equipmentName || r.categoryName || r.name || 'فحص دوري',
            dates: (r) => [{ start: r.scheduledDate || r.nextDate || r.dueDate || r.date, end: r.scheduledDate || r.nextDate }]
        },
        {
            moduleKey: 'behavior-monitoring',
            eventType: 'module_behavior',
            color: '#CA8A04',
            icon: 'fa-user-check',
            link: '#behavior-monitoring',
            labelAr: 'مراقبة سلوك',
            labelEn: 'Behavior',
            listKey: 'behaviorMonitoring',
            title: (r) => r.behaviorType || r.type || r.employeeName || 'مراقبة سلوك',
            dates: (r) => [{ start: r.date || r.observationDate || r.createdAt, end: r.date }]
        },
        {
            moduleKey: 'emergency',
            eventType: 'module_emergency',
            color: '#EF4444',
            icon: 'fa-bell',
            link: '#emergency',
            labelAr: 'طوارئ',
            labelEn: 'Emergency',
            listKey: 'emergencyAlerts',
            title: (r) => r.title || r.alertType || r.message || 'تنبيه طوارئ',
            dates: (r) => [{ start: r.date || r.alertDate || r.createdAt, end: r.expiryDate || r.date }]
        },
        {
            moduleKey: 'clinic',
            eventType: 'module_clinic',
            color: '#DB2777',
            icon: 'fa-hospital',
            link: '#clinic',
            labelAr: 'زيارة عيادة',
            labelEn: 'Clinic visit',
            listKey: 'clinicVisits',
            title: (r) => r.employeeName || r.patientName || r.visitReason || 'زيارة عيادة',
            dates: (r) => [{ start: r.visitDate || r.date || r.createdAt, end: r.visitDate || r.date }],
            meta: (r) => ({ assignee: r.employeeName || r.patientName, description: r.visitReason })
        },
        {
            moduleKey: 'risk-assessment',
            eventType: 'module_risk',
            color: '#B45309',
            icon: 'fa-balance-scale',
            link: '#risk-assessment',
            labelAr: 'تقييم مخاطر',
            labelEn: 'Risk assessment',
            listKey: 'riskAssessments',
            title: (r) => r.title || r.activity || r.process || r.hazard || 'تقييم مخاطر',
            dates: (r) => {
                const out = [];
                if (r.date) out.push({ start: r.date, end: r.date, label: 'assessment' });
                if (r.planningDate) out.push({ start: r.planningDate, end: r.planningDate, label: 'planning' });
                if (r.actionPlannedDate) out.push({ start: r.actionPlannedDate, end: r.actionPlannedDate, label: 'action' });
                if (r.reviewDate) out.push({ start: r.reviewDate, end: r.reviewDate, label: 'review' });
                if (!out.length && r.createdAt) out.push({ start: r.createdAt, end: r.createdAt });
                return out;
            },
            meta: (r) => ({ status: r.status, location: r.location || r.department, priority: r.riskLevel || r.riskRating })
        }
    ];

    function toDateOnly(raw) {
        if (!raw) return null;
        const s = String(raw).trim();
        if (!s) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return null;
        return d.toISOString().slice(0, 10);
    }

    function pickMeta(...vals) {
        for (let i = 0; i < vals.length; i++) {
            const v = vals[i];
            if (v != null && String(v).trim()) return String(v).trim();
        }
        return '';
    }

    function pushEvent(out, def, row, idx, ri, range, isEn) {
        const start = toDateOnly(range.start);
        if (!start) return;
        const end = toDateOnly(range.end) || start;
        const title = String(def.title(row) || '').trim() || def.labelAr;
        const meta = typeof def.meta === 'function' ? def.meta(row) : {};
        out.push({
            id: `feed-${def.eventType}-${row.id || idx}-${ri}`,
            title,
            titleEn: isEn ? title : (row.titleEn || title),
            startDate: start,
            endDate: end,
            eventType: def.eventType,
            moduleKey: def.moduleKey,
            scope: 'module',
            source: 'feed',
            color: def.color,
            icon: def.icon,
            link: def.link,
            moduleLabel: isEn ? def.labelEn : def.labelAr,
            description: pickMeta(meta.description, row.description, row.notes, row.message).slice(0, 200),
            status: pickMeta(meta.status, row.status, row.permitStatus, row.state),
            location: pickMeta(meta.location, row.location, row.siteName, row.workArea, row.area),
            assignee: pickMeta(meta.assignee, row.assignedTo, row.employeeName, row.responsible, row.trainer, row.conductedBy),
            priority: pickMeta(meta.priority, row.priority, row.severity, row.riskLevel),
            recordId: row.id || null,
            allDay: true
        });
    }

    function canAccess(moduleKey) {
        if (!moduleKey) return false;
        if (typeof Permissions !== 'undefined' && Permissions.isCurrentUserEffectiveAdmin?.()) return true;
        if (typeof Permissions !== 'undefined' && typeof Permissions.hasAccess === 'function') {
            return Permissions.hasAccess(moduleKey);
        }
        return true;
    }

    const Feed = {
        moduleDefs: MODULE_FEEDS,

        buildEvents() {
            const data = (typeof AppState !== 'undefined' && AppState.appData) ? AppState.appData : {};
            const isEn = (typeof AppState !== 'undefined' && AppState.currentLanguage === 'en');
            const out = [];

            MODULE_FEEDS.forEach(def => {
                if (!canAccess(def.moduleKey)) return;
                const rows = data[def.listKey];
                if (!Array.isArray(rows) || !rows.length) return;

                rows.forEach((row, idx) => {
                    if (!row || typeof row !== 'object') return;
                    const ranges = def.dates(row) || [];
                    ranges.forEach((range, ri) => {
                        pushEvent(out, def, row, idx, ri, range, isEn);
                    });
                });
            });

            return out;
        },

        stats(events) {
            const counts = {};
            (events || []).forEach(ev => {
                if (ev.source !== 'feed') return;
                const k = ev.moduleKey || 'other';
                counts[k] = (counts[k] || 0) + 1;
            });
            return counts;
        }
    };

    win.SafetyCalendarFeed = Feed;
})(window);
