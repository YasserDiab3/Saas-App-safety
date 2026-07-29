/**
 * onboarding-wizard.js — first-run tenant setup for owners/admins.
 */
const OnboardingWizard = {
    STEPS: ['company', 'sites', 'modules', 'demo', 'done'],

    isAdmin() {
        try {
            if (typeof Permissions !== 'undefined' && Permissions.isCurrentUserEffectiveAdmin) {
                return Permissions.isCurrentUserEffectiveAdmin();
            }
        } catch (_e) { /* ignore */ }
        const u = AppState && AppState.currentUser;
        const role = String((u && u.role) || '').toLowerCase();
        return role === 'admin' || role === 'owner' || role === 'administrator';
    },

    getCompanySettings() {
        const obj = (typeof AppState !== 'undefined' && AppState.companySettings && typeof AppState.companySettings === 'object')
            ? AppState.companySettings
            : {};
        const rows = (AppState && AppState.appData && AppState.appData.companySettings) || [];
        const arr = Array.isArray(rows) ? rows : [];
        const row = arr.find((r) => String(r.id) === 'default') || arr[0] || {};
        return Object.assign({ id: 'default' }, row, obj);
    },

    isCompleted() {
        const row = this.getCompanySettings();
        return !!(row && (row.onboardingCompleted === true || row.onboardingCompleted === 'true'));
    },

    async markCompleted() {
        if (!AppState.companySettings) AppState.companySettings = {};
        AppState.companySettings.onboardingCompleted = true;
        AppState.companySettings.onboardingCompletedAt = new Date().toISOString();
        const row = Object.assign({ id: 'default' }, this.getCompanySettings(), {
            onboardingCompleted: true,
            onboardingCompletedAt: AppState.companySettings.onboardingCompletedAt
        });
        if (!AppState.appData.companySettings) AppState.appData.companySettings = [];
        const arr = AppState.appData.companySettings;
        if (!Array.isArray(arr)) AppState.appData.companySettings = [row];
        else {
            const idx = arr.findIndex((r) => String(r.id) === 'default');
            if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], row);
            else arr.push(row);
        }
        if (typeof Backend !== 'undefined' && Backend.sendToAppsScript) {
            await Backend.sendToAppsScript('saveCompanySettings', row);
        } else if (Backend && Backend.autoSave) {
            await Backend.autoSave('CompanySettings', AppState.appData.companySettings);
        } else if (typeof DataManager !== 'undefined') {
            DataManager.save();
        }
    },

    async maybeStart() {
        if (!this.isAdmin()) return;
        if (this.isCompleted()) return;
        if (sessionStorage.getItem('hse_onboarding_skip') === '1') return;
        this.stepIndex = 0;
        this.state = { companyName: '', siteName: '', modules: ['incidents', 'daily-observations', 'action-tracking'], injectDemo: false };
        this.render();
    },

    render() {
        let overlay = document.getElementById('hse-onboarding-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'hse-onboarding-overlay';
            overlay.className = 'hse-onboarding-overlay';
            document.body.appendChild(overlay);
        }
        const step = this.STEPS[this.stepIndex] || 'company';
        const stepsHtml = this.STEPS.slice(0, -1)
            .map((_, i) => `<span class="${i < this.stepIndex ? 'is-done' : i === this.stepIndex ? 'is-active' : ''}"></span>`)
            .join('');

        let body = '';
        if (step === 'company') {
            body = `
              <h3 class="font-semibold mb-2">بيانات المؤسسة</h3>
              <p class="text-sm text-gray-600 mb-3">اسم يظهر في التقارير والنسخ الاحتياطية.</p>
              <input id="ob-company" class="form-input w-full" placeholder="اسم الشركة / المؤسسة" value="${this.esc(this.state.companyName)}" />`;
        } else if (step === 'sites') {
            body = `
              <h3 class="font-semibold mb-2">الموقع الأول</h3>
              <p class="text-sm text-gray-600 mb-3">يمكن إضافة مواقع إضافية لاحقاً من الإعدادات.</p>
              <input id="ob-site" class="form-input w-full" placeholder="مثال: المصنع الرئيسي" value="${this.esc(this.state.siteName)}" />`;
        } else if (step === 'modules') {
            body = `
              <h3 class="font-semibold mb-2">ابدأ بهذه الموديولات</h3>
              <p class="text-sm text-gray-600 mb-3">يُنصح بالحوادث، الملاحظات، ومتابعة الإجراءات (CAPA).</p>
              <label class="block"><input type="checkbox" data-ob-mod="incidents" checked /> الحوادث</label>
              <label class="block"><input type="checkbox" data-ob-mod="daily-observations" checked /> الملاحظات اليومية</label>
              <label class="block"><input type="checkbox" data-ob-mod="action-tracking" checked /> متابعة الإجراءات / CAPA</label>`;
        } else if (step === 'demo') {
            body = `
              <h3 class="font-semibold mb-2">بيانات تجريبية؟</h3>
              <p class="text-sm text-gray-600 mb-3">تعبئة سجلات تجريبية للمعاينة (يمكن حذفها لاحقاً).</p>
              <label><input type="checkbox" id="ob-demo" /> نعم، عبّئ بيانات تجريبية</label>`;
        } else {
            body = `
              <h3 class="font-semibold mb-2">أنت جاهز</h3>
              <p class="text-sm text-gray-600">اكتملت إعدادات البداية. يمكنك تعديل المواقع والصلاحيات من الإعدادات في أي وقت.</p>`;
        }

        overlay.innerHTML = `
          <div class="hse-onboarding-card" role="dialog" aria-modal="true">
            <div class="hse-onboarding-card__head">
              <div style="font-size:13px;opacity:.85">HSEHub 360</div>
              <div style="font-size:1.15rem;font-weight:700">مرحباً — إعداد المؤسسة</div>
            </div>
            <div class="hse-onboarding-card__body">
              <div class="hse-onboarding-steps">${stepsHtml}</div>
              ${body}
            </div>
            <div class="hse-onboarding-card__foot">
              <button type="button" class="btn-secondary" id="ob-skip">تخطي الآن</button>
              <div class="flex gap-2">
                ${this.stepIndex > 0 && step !== 'done' ? '<button type="button" class="btn-secondary" id="ob-back">رجوع</button>' : ''}
                <button type="button" class="btn-primary" id="ob-next">${step === 'done' ? 'ابدأ' : 'متابعة'}</button>
              </div>
            </div>
          </div>`;

        overlay.querySelector('#ob-skip')?.addEventListener('click', () => {
            sessionStorage.setItem('hse_onboarding_skip', '1');
            overlay.remove();
        });
        overlay.querySelector('#ob-back')?.addEventListener('click', () => {
            this.stepIndex = Math.max(0, this.stepIndex - 1);
            this.render();
        });
        overlay.querySelector('#ob-next')?.addEventListener('click', () => this.next());
    },

    esc(s) {
        return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    },

    async next() {
        const step = this.STEPS[this.stepIndex];
        if (step === 'company') {
            this.state.companyName = document.getElementById('ob-company')?.value?.trim() || '';
            if (!this.state.companyName) {
                alert('أدخل اسم المؤسسة');
                return;
            }
            const row = Object.assign({}, this.getCompanySettings(), {
                id: 'default',
                companyName: this.state.companyName,
                name: this.state.companyName
            });
            if (!AppState.appData.companySettings) AppState.appData.companySettings = [];
            const arr = AppState.appData.companySettings;
            const idx = arr.findIndex((r) => String(r.id) === 'default');
            if (idx >= 0) arr[idx] = Object.assign({}, arr[idx], row);
            else arr.push(row);
            try {
                if (Backend && Backend.sendToAppsScript) await Backend.sendToAppsScript('saveCompanySettings', row);
            } catch (_e) { /* ignore */ }
        } else if (step === 'sites') {
            this.state.siteName = document.getElementById('ob-site')?.value?.trim() || '';
            if (this.state.siteName && window.SaaSOrgSites) {
                try {
                    await SaaSOrgSites.upsertSite({ name: this.state.siteName, code: 'MAIN' });
                } catch (_e) { /* ignore */ }
            }
        } else if (step === 'modules') {
            this.state.modules = Array.from(document.querySelectorAll('[data-ob-mod]:checked')).map((el) => el.getAttribute('data-ob-mod'));
        } else if (step === 'demo') {
            this.state.injectDemo = !!document.getElementById('ob-demo')?.checked;
            if (this.state.injectDemo && typeof BackupUI !== 'undefined' && BackupUI.injectDemoData) {
                try {
                    await BackupUI.injectDemoData();
                } catch (_e) { /* ignore */ }
            }
        } else if (step === 'done') {
            await this.markCompleted();
            document.getElementById('hse-onboarding-overlay')?.remove();
            if (typeof Notification !== 'undefined' && Notification.success) Notification.success('اكتمل إعداد المؤسسة');
            return;
        }
        this.stepIndex += 1;
        this.render();
    }
};

if (typeof window !== 'undefined') window.OnboardingWizard = OnboardingWizard;
