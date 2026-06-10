/**
 * ISO Module
 * ØªÙ… Ø§Ø³ØªØ®Ø±Ø§Ø¬Ù‡ Ù…Ù† app-modules.js
 */
// ===== HSE Management System Module (نظام إدارة السلامة والصحة المهنية والبيئة) =====
const ISO = {
    currentTab: 'overview',

    async load() {
        // Add language change listener
        if (!this._languageChangeListenerAdded) {
            document.addEventListener('language-changed', () => {
                this.load();
            });
            this._languageChangeListenerAdded = true;
        }

        const section = document.getElementById('iso-section');
        if (!section) return;

        try {
        section.innerHTML = `
            <div class="section-header">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="section-title">
                            <i class="fas fa-shield-alt ml-3"></i>
                            نظام إدارة السلامة والصحة المهنية والبيئة
                        </h1>
                        <p class="section-subtitle">HSE Management System - متوافق مع ISO 45001 & ISO 14001</p>
                    </div>
                    <button id="export-compliance-report-btn" class="btn-success">
                        <i class="fas fa-file-pdf ml-2"></i>تقرير الامتثال PDF
                    </button>
                </div>
            </div>
            
            <div class="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-blue-600 mb-2">${(AppState.appData.isoDocuments || []).length}</div>
                    <div class="text-sm text-gray-700 font-semibold">الوثائق</div>
                </div>
                <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-green-600 mb-2">${(AppState.appData.isoProcedures || []).length}</div>
                    <div class="text-sm text-gray-700 font-semibold">الإجراءات</div>
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-yellow-600 mb-2">${(AppState.appData.isoForms || []).length}</div>
                    <div class="text-sm text-gray-700 font-semibold">النماذج</div>
                </div>
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                    <div class="text-3xl font-bold text-purple-600 mb-2">${this.calculateComplianceRate()}%</div>
                    <div class="text-sm text-gray-700 font-semibold">معدل الامتثال</div>
                </div>
            </div>
            
            <div class="mt-6">
                <div class="flex gap-2 mb-6 border-b">
                    <button class="tab-btn ${this.currentTab === 'overview' ? 'active' : ''}" data-tab="overview">
                        <i class="fas fa-chart-pie ml-2"></i>نظرة عامة
                    </button>
                    <button class="tab-btn ${this.currentTab === 'documents' ? 'active' : ''}" data-tab="documents">
                        <i class="fas fa-file-alt ml-2"></i>الوثائق
                    </button>
                    <button class="tab-btn ${this.currentTab === 'procedures' ? 'active' : ''}" data-tab="procedures">
                        <i class="fas fa-tasks ml-2"></i>الإجراءات
                    </button>
                    <button class="tab-btn ${this.currentTab === 'forms' ? 'active' : ''}" data-tab="forms">
                        <i class="fas fa-file-signature ml-2"></i>النماذج
                    </button>
                    <button class="tab-btn ${this.currentTab === 'iso45001' ? 'active' : ''}" data-tab="iso45001">
                        <i class="fas fa-hard-hat ml-2"></i>ISO 45001
                    </button>
                    <button class="tab-btn ${this.currentTab === 'iso14001' ? 'active' : ''}" data-tab="iso14001">
                        <i class="fas fa-leaf ml-2"></i>ISO 14001
                    </button>
                    <button class="tab-btn ${this.currentTab === 'audit' ? 'active' : ''}" data-tab="audit">
                        <i class="fas fa-clipboard-check ml-2"></i>التدقيق والمراجعة
                    </button>
                    <button class="tab-btn ${this.currentTab === 'coding-center' ? 'active' : ''}" data-tab="coding-center">
                        <i class="fas fa-code ml-2"></i>مركز التكويد والإصدار
                    </button>
                </div>
                <div id="iso-content">
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <div style="width: 300px; margin: 0 auto 16px;">
                                    <div style="width: 100%; height: 6px; background: rgba(59, 130, 246, 0.2); border-radius: 3px; overflow: hidden;">
                                        <div style="height: 100%; background: linear-gradient(90deg, #3b82f6, #2563eb, #3b82f6); background-size: 200% 100%; border-radius: 3px; animation: loadingProgress 1.5s ease-in-out infinite;"></div>
                                    </div>
                                </div>
                                <p class="text-gray-500">جاري تحميل المحتوى...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
            this.setupEventListeners();
            
            // ✅ تحميل المحتوى فوراً بعد عرض الواجهة
            setTimeout(async () => {
                try {
                    const contentArea = document.getElementById('iso-content');
                    if (!contentArea) return;

                    // تبويب مركز التكويد: عرض الهيكل فوراً ثم جلب البيانات في الخلفية (بدون إظهار رسالة مهلة مزعجة)
                    if (this.currentTab === 'coding-center') {
                        contentArea.innerHTML = await this.renderCodingCenter({ skipFetch: true });
                        this.renderCodingCenter({ silentTimeout: true }).then(html => {
                            const area = document.getElementById('iso-content');
                            if (area && this.currentTab === 'coding-center') area.innerHTML = html;
                        }).catch(() => {});
                        return;
                    }

                    const content = await this.renderContent().catch(error => {
                        Utils.safeWarn('⚠️ خطأ في تحميل المحتوى:', error);
                        return `
                            <div class="content-card">
                                <div class="card-body">
                                    <div class="empty-state">
                                        <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                        <p class="text-gray-500 mb-4">حدث خطأ في تحميل البيانات</p>
                                        <button onclick="ISO.load()" class="btn-primary">
                                            <i class="fas fa-redo ml-2"></i>
                                            إعادة المحاولة
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    contentArea.innerHTML = content;
                } catch (error) {
                    Utils.safeWarn('⚠️ خطأ في تحميل المحتوى:', error);
                }
            }, 0);
        } catch (error) {
            if (typeof Utils !== 'undefined' && Utils.safeError) {
                Utils.safeError('❌ خطأ في تحميل مديول ISO:', error);
            } else {
                console.error('❌ خطأ في تحميل مديول ISO:', error);
            }
            if (section) {
                section.innerHTML = `
                    <div class="content-card">
                        <div class="card-body">
                            <div class="empty-state">
                                <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-4"></i>
                                <p class="text-gray-500 mb-4">حدث خطأ أثناء تحميل البيانات</p>
                                <button onclick="ISO.load()" class="btn-primary">
                                    <i class="fas fa-redo ml-2"></i>
                                    إعادة المحاولة
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    },

    calculateComplianceRate() {
        const documents = AppState.appData.isoDocuments || [];
        const procedures = AppState.appData.isoProcedures || [];
        const forms = AppState.appData.isoForms || [];
        const total = documents.length + procedures.length + forms.length;
        // حساب نسبة الامتثال بناءً على وجود وثائق وإجراءات ونماذج
        const complianceScore = documents.length > 0 ? 30 : 0;
        const proceduresScore = procedures.length > 0 ? 30 : 0;
        const formsScore = forms.length > 0 ? 40 : 0;
        return Math.min(100, complianceScore + proceduresScore + formsScore);
    },

    async renderContent() {
        switch (this.currentTab) {
            case 'overview':
                return await this.renderOverview();
            case 'documents':
                return await this.renderDocuments();
            case 'procedures':
                return await this.renderProcedures();
            case 'forms':
                return await this.renderForms();
            case 'iso45001':
                return await this.renderISO45001();
            case 'iso14001':
                return await this.renderISO14001();
            case 'audit':
                return await this.renderAudit();
            case 'coding-center':
                return await this.renderCodingCenter();
            default:
                return await this.renderOverview();
        }
    },

    async renderOverview() {
        const documents = AppState.appData.isoDocuments || [];
        const procedures = AppState.appData.isoProcedures || [];
        const forms = AppState.appData.isoForms || [];
        const audits = AppState.appData.hseAudits || [];
        const nonConformities = AppState.appData.hseNonConformities || [];
        const actions = AppState.appData.hseCorrectiveActions || [];

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-info-circle ml-2"></i>نظرة عامة على النظام</h2>
                    </div>
                    <div class="card-body">
                        <div class="space-y-4">
                            <div class="bg-blue-50 border border-blue-200 rounded p-4">
                                <h3 class="font-semibold text-blue-800 mb-3">
                                    <i class="fas fa-hard-hat ml-2"></i>
                                    ISO 45001 - السلامة والصحة المهنية
                                </h3>
                                <ul class="list-disc list-inside text-sm text-gray-700 space-y-2">
                                    <li>إدارة المخاطر والرص</li>
                                    <li>التخطيط والتحكم التشغيلي</li>
                                    <li>القياس والمراقبة</li>
                                    <li>التحسين المستمر</li>
                                </ul>
                            </div>
                            <div class="bg-green-50 border border-green-200 rounded p-4">
                                <h3 class="font-semibold text-green-800 mb-3">
                                    <i class="fas fa-leaf ml-2"></i>
                                    ISO 14001 - إدارة البيئة
                                </h3>
                                <ul class="list-disc list-inside text-sm text-gray-700 space-y-2">
                                    <li>إدارة الجوانب البيئية</li>
                                    <li>الامتثال للقوانين البيئية</li>
                                    <li>التخطيط البيئي</li>
                                    <li>تحسين الأداء البيئي</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title"><i class="fas fa-chart-bar ml-2"></i>إحصائيات النظام</h2>
                    </div>
                    <div class="card-body">
                        <div class="space-y-4">
                            <div class="flex items-center justify-between p-3 border rounded">
                                <span class="font-semibold">الوثائق</span>
                                <span class="badge badge-info">${documents.length}</span>
                            </div>
                            <div class="flex items-center justify-between p-3 border rounded">
                                <span class="font-semibold">الإجراءات</span>
                                <span class="badge badge-success">${procedures.length}</span>
                            </div>
                            <div class="flex items-center justify-between p-3 border rounded">
                                <span class="font-semibold">النماذج</span>
                                <span class="badge badge-warning">${forms.length}</span>
                            </div>
                            <div class="flex items-center justify-between p-3 border rounded">
                                <span class="font-semibold">عمليات التدقيق</span>
                                <span class="badge badge-primary">${audits.length}</span>
                            </div>
                            <div class="flex items-center justify-between p-3 border rounded">
                                <span class="font-semibold">عدم المطابقة</span>
                                <span class="badge badge-danger">${nonConformities.length}</span>
                            </div>
                            <div class="flex items-center justify-between p-3 border rounded">
                                <span class="font-semibold">الإجراءات التصحيحية</span>
                                <span class="badge badge-info">${actions.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderDocuments() {
        const documents = AppState.appData.isoDocuments || [];
        return `
            <div class="content-card">
                <div class="card-header">
                    <div class="flex items-center justify-between">
                        <h2 class="card-title"><i class="fas fa-file-alt ml-2"></i>الوثائق</h2>
                        <button id="add-document-btn" class="btn-primary">
                            <i class="fas fa-plus ml-2"></i>إضافة وثيقة
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${documents.length === 0 ? '<div class="empty-state"><p class="text-gray-500">لا توجد وثائق</p></div>' : `
                        <table class="data-table table-header-purple">
                            <thead>
                                <tr>
                                    <th>كود ISO</th>
                                    <th>اسم الوثيقة</th>
                                    <th>النوع</th>
                                    <th>الإصدار</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${documents.map(d => `
                                    <tr>
                                        <td>${Utils.escapeHTML(d.isoCode || '')}</td>
                                        <td>${Utils.escapeHTML(d.name || '')}</td>
                                        <td>${Utils.escapeHTML(d.type || '')}</td>
                                        <td>${d.version || '-'}</td>
                                        <td>
                                            <button onclick="ISO.viewDocument('${d.id}')" class="btn-icon btn-icon-primary">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    },

    async renderProcedures() {
        const procedures = AppState.appData.isoProcedures || [];
        return `
            <div class="content-card">
                <div class="card-header">
                    <div class="flex items-center justify-between">
                        <h2 class="card-title"><i class="fas fa-tasks ml-2"></i>الإجراءات</h2>
                        <button id="add-procedure-btn" class="btn-primary">
                            <i class="fas fa-plus ml-2"></i>إضافة إجراء
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${procedures.length === 0 ? '<div class="empty-state"><p class="text-gray-500">لا توجد إجراءات</p></div>' : `
                        <table class="data-table table-header-purple">
                            <thead>
                                <tr>
                                    <th>كود ISO</th>
                                    <th>اسم الإجراء</th>
                                    <th>القسم</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${procedures.map(p => `
                                    <tr>
                                        <td>${Utils.escapeHTML(p.isoCode || '')}</td>
                                        <td>${Utils.escapeHTML(p.name || '')}</td>
                                        <td>${Utils.escapeHTML(p.department || '')}</td>
                                        <td>
                                            <button onclick="ISO.viewProcedure('${p.id}')" class="btn-icon btn-icon-primary">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    },

    async renderForms() {
        const forms = AppState.appData.isoForms || [];
        return `
            <div class="content-card">
                <div class="card-header">
                    <div class="flex items-center justify-between">
                        <h2 class="card-title"><i class="fas fa-file-signature ml-2"></i>النماذج</h2>
                        <button id="add-form-btn" class="btn-primary">
                            <i class="fas fa-plus ml-2"></i>إضافة نموذج
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${forms.length === 0 ? '<div class="empty-state"><p class="text-gray-500">لا توجد نماذج</p></div>' : `
                        <table class="data-table table-header-purple">
                            <thead>
                                <tr>
                                    <th>كود ISO</th>
                                    <th>اسم النموذج</th>
                                    <th>النوع</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${forms.map(f => `
                                    <tr>
                                        <td>${Utils.escapeHTML(f.isoCode || '')}</td>
                                        <td>${Utils.escapeHTML(f.name || '')}</td>
                                        <td>${Utils.escapeHTML(f.type || '')}</td>
                                        <td>
                                            <button onclick="ISO.viewForm('${f.id}')" class="btn-icon btn-icon-primary">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `}
                </div>
            </div>
        `;
    },

    setupEventListeners() {
        setTimeout(() => {
            const tabs = document.querySelectorAll('.tab-btn');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    this.currentTab = tab.getAttribute('data-tab');
                    this.load();
                });
            });

            const addDocumentBtn = document.getElementById('add-document-btn');
            const addProcedureBtn = document.getElementById('add-procedure-btn');
            const addFormBtn = document.getElementById('add-form-btn');

            if (addDocumentBtn) addDocumentBtn.addEventListener('click', () => this.showDocumentForm());
            if (addProcedureBtn) addProcedureBtn.addEventListener('click', () => this.showProcedureForm());
            if (addFormBtn) addFormBtn.addEventListener('click', () => this.showFormForm());
        }, 100);
    },

    async showDocumentForm(data = null) {
        // جلب قائمة الأكواد من المركز
        let documentCodes = [];
        try {
            const result = await Backend.fetchData('getDocumentCodes', {});
            if (result.success && result.data) {
                documentCodes = result.data.filter(c => c.documentType === 'وثيقة' && c.status === 'نشط');
            }
        } catch (error) {
            Utils.safeError('Error loading document codes:', error);
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل وثيقة' : 'إضافة وثيقة جديدة'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="iso-document-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">كود المستند من المركز *</label>
                            <select id="document-code-select" required class="form-input" 
                                onchange="ISO.loadDocumentCodeVersion('document')">
                                <option value="">اختر الكود من مركز التكويد والإصدار</option>
                                ${documentCodes.map(code => `
                                    <option value="${code.code}" 
                                        data-code-id="${code.id}"
                                        ${data?.isoCode === code.code ? 'selected' : ''}>
                                        ${Utils.escapeHTML(code.code || '')} - ${Utils.escapeHTML(code.documentName || '')}
                                    </option>
                                `).join('')}
                            </select>
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle ml-1"></i>
                                يجب اختيار الكود من مركز التكويد والإصدار. الإصدار سيُسحب تلقائياً.
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">اسم الوثيقة *</label>
                            <input type="text" id="document-name" required class="form-input" 
                                value="${Utils.escapeHTML(data?.name || '')}" placeholder="اسم الوثيقة">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">النوع *</label>
                            <select id="document-type" required class="form-input">
                                <option value="">اختر النوع</option>
                                <option value="سياسة" ${data?.type === 'سياسة' ? 'selected' : ''}>سياسة</option>
                                <option value="إجراء" ${data?.type === 'إجراء' ? 'selected' : ''}>إجراء</option>
                                <option value="تعليمات" ${data?.type === 'تعليمات' ? 'selected' : ''}>تعليمات</option>
                                <option value="دليل" ${data?.type === 'دليل' ? 'selected' : ''}>دليل</option>
                                <option value="أخرى" ${data?.type === 'أخرى' ? 'selected' : ''}>أخرى</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">رقم الإصدار (يُسحب تلقائياً من المركز)</label>
                            <input type="text" id="document-version" readonly class="form-input bg-gray-100" 
                                value="${Utils.escapeHTML(data?.version || '')}" placeholder="سيتم جلب الإصدار تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ الإصدار</label>
                            <input type="text" id="document-issue-date" readonly class="form-input bg-gray-100" 
                                value="${data?.issueDate ? Utils.formatDate(data.issueDate) : ''}" placeholder="سيتم جلب تاريخ الإصدار تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ التعديل</label>
                            <input type="text" id="document-revision-date" readonly class="form-input bg-gray-100" 
                                value="${data?.revisionDate ? Utils.formatDate(data.revisionDate) : ''}" placeholder="سيتم جلب تاريخ التعديل تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">القسم *</label>
                            <input type="text" id="document-department" required class="form-input" 
                                value="${Utils.escapeHTML(data?.department || '')}" placeholder="القسم">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-document-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // إذا كان هناك بيانات موجودة، جلب الإصدار تلقائياً
        if (data?.isoCode) {
            await this.loadDocumentCodeVersion('document', data.isoCode);
        }

        const saveBtn = modal.querySelector('#save-document-btn');
        saveBtn.addEventListener('click', () => this.handleDocumentSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleDocumentSubmit(editId = null, modal) {
        const codeSelect = document.getElementById('document-code-select');
        const selectedCode = codeSelect?.value || '';

        if (!selectedCode) {
            Notification.error('يجب اختيار كود المستند من مركز التكويد والإصدار');
            return;
        }

        // فحص العناصر قبل الاستخدام
        const nameEl = document.getElementById('document-name');
        const typeEl = document.getElementById('document-type');
        const versionEl = document.getElementById('document-version');
        const issueDateEl = document.getElementById('document-issue-date');
        const revisionDateEl = document.getElementById('document-revision-date');
        const departmentEl = document.getElementById('document-department');
        
        if (!nameEl || !typeEl || !versionEl || !departmentEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('ISO_DOC'),
            isoCode: selectedCode,
            name: nameEl.value.trim(),
            type: typeEl.value,
            version: versionEl.value.trim() || 'غير محدد',
            issueDate: issueDateEl?.value || null,
            revisionDate: revisionDateEl?.value || null,
            department: departmentEl.value.trim(),
            createdAt: editId ? AppState.appData.isoDocuments.find(d => d.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.isoDocuments.findIndex(d => d.id === editId);
                if (index !== -1) AppState.appData.isoDocuments[index] = formData;
                Notification.success('تم تحديث الوثيقة بنجاح');
            } else {
                AppState.appData.isoDocuments.push(formData);
                Notification.success('تم إضافة الوثيقة بنجاح');
            }

            // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

            Loading.hide();
            try {
                if (modal && modal.parentNode) modal.remove();
            } catch (removeErr) {
                Utils.safeWarn('⚠️ خطأ في إغلاق نموذج الوثيقة:', removeErr);
            }
            this.load();

            Backend.autoSave('ISODocuments', AppState.appData.isoDocuments).catch(error => {
                Utils.safeError('خطأ في حفظ Google Sheets (وثائق ISO):', error);
                if (typeof Notification !== 'undefined' && Notification.warning) {
                    Notification.warning('تم الحفظ محلياً. تعذّرت المزامنة الفورية مع الشيت.');
                }
            });
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async showProcedureForm(data = null) {
        // جلب قائمة الأكواد من المركز
        let documentCodes = [];
        try {
            const result = await Backend.fetchData('getDocumentCodes', {});
            if (result.success && result.data) {
                documentCodes = result.data.filter(c => c.documentType === 'إجراء' && c.status === 'نشط');
            }
        } catch (error) {
            Utils.safeError('Error loading document codes:', error);
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل إجراء' : 'إضافة إجراء جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="iso-procedure-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">كود الإجراء من المركز *</label>
                            <select id="procedure-code-select" required class="form-input" 
                                onchange="ISO.loadDocumentCodeVersion('procedure')">
                                <option value="">اختر الكود من مركز التكويد والإصدار</option>
                                ${documentCodes.map(code => `
                                    <option value="${code.code}" 
                                        data-code-id="${code.id}"
                                        ${data?.isoCode === code.code ? 'selected' : ''}>
                                        ${Utils.escapeHTML(code.code || '')} - ${Utils.escapeHTML(code.documentName || '')}
                                    </option>
                                `).join('')}
                            </select>
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle ml-1"></i>
                                يجب اختيار الكود من مركز التكويد والإصدار. الإصدار سيُسحب تلقائياً.
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">اسم الإجراء *</label>
                            <input type="text" id="procedure-name" required class="form-input" 
                                value="${Utils.escapeHTML(data?.name || '')}" placeholder="اسم الإجراء">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">القسم *</label>
                            <input type="text" id="procedure-department" required class="form-input" 
                                value="${Utils.escapeHTML(data?.department || '')}" placeholder="القسم">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">رقم الإصدار (يُسحب تلقائياً من المركز)</label>
                            <input type="text" id="procedure-version" readonly class="form-input bg-gray-100" 
                                value="${Utils.escapeHTML(data?.version || '')}" placeholder="سيتم جلب الإصدار تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ الإصدار</label>
                            <input type="text" id="procedure-issue-date" readonly class="form-input bg-gray-100" 
                                value="${data?.issueDate ? Utils.formatDate(data.issueDate) : ''}" placeholder="سيتم جلب تاريخ الإصدار تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ التعديل</label>
                            <input type="text" id="procedure-revision-date" readonly class="form-input bg-gray-100" 
                                value="${data?.revisionDate ? Utils.formatDate(data.revisionDate) : ''}" placeholder="سيتم جلب تاريخ التعديل تلقائياً">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-procedure-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // إذا كان هناك بيانات موجودة، جلب الإصدار تلقائياً
        if (data?.isoCode) {
            await this.loadDocumentCodeVersion('procedure', data.isoCode);
        }

        const saveBtn = modal.querySelector('#save-procedure-btn');
        saveBtn.addEventListener('click', () => this.handleProcedureSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleProcedureSubmit(editId = null, modal) {
        const codeSelect = document.getElementById('procedure-code-select');
        const selectedCode = codeSelect?.value || '';

        if (!selectedCode) {
            Notification.error('يجب اختيار كود الإجراء من مركز التكويد والإصدار');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('ISO_PROC'),
            isoCode: selectedCode,
            name: document.getElementById('procedure-name').value.trim(),
            department: document.getElementById('procedure-department').value.trim(),
            version: document.getElementById('procedure-version').value.trim() || 'غير محدد',
            issueDate: document.getElementById('procedure-issue-date').value || null,
            revisionDate: document.getElementById('procedure-revision-date').value || null,
            createdAt: editId ? AppState.appData.isoProcedures.find(p => p.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.isoProcedures.findIndex(p => p.id === editId);
                if (index !== -1) AppState.appData.isoProcedures[index] = formData;
                Notification.success('تم تحديث الإجراء بنجاح');
            } else {
                AppState.appData.isoProcedures.push(formData);
                Notification.success('تم إضافة الإجراء بنجاح');
            }

            // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

            Loading.hide();
            try {
                if (modal && modal.parentNode) modal.remove();
            } catch (removeErr) {
                Utils.safeWarn('⚠️ خطأ في إغلاق نموذج الإجراء:', removeErr);
            }
            this.load();

            Backend.autoSave('ISOProcedures', AppState.appData.isoProcedures).catch(error => {
                Utils.safeError('خطأ في حفظ Google Sheets (إجراءات ISO):', error);
                if (typeof Notification !== 'undefined' && Notification.warning) {
                    Notification.warning('تم الحفظ محلياً. تعذّرت المزامنة الفورية مع الشيت.');
                }
            });
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async showFormForm(data = null) {
        // جلب قائمة الأكواد من المركز
        let documentCodes = [];
        try {
            const result = await Backend.fetchData('getDocumentCodes', {});
            if (result.success && result.data) {
                documentCodes = result.data.filter(c => c.documentType === 'نموذج' && c.status === 'نشط');
            }
        } catch (error) {
            Utils.safeError('Error loading document codes:', error);
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل نموذج' : 'إضافة نموذج جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="iso-form-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">كود النموذج من المركز *</label>
                            <select id="form-code-select" required class="form-input" 
                                onchange="ISO.loadDocumentCodeVersion('form')">
                                <option value="">اختر الكود من مركز التكويد والإصدار</option>
                                ${documentCodes.map(code => `
                                    <option value="${code.code}" 
                                        data-code-id="${code.id}"
                                        ${data?.isoCode === code.code ? 'selected' : ''}>
                                        ${Utils.escapeHTML(code.code || '')} - ${Utils.escapeHTML(code.documentName || '')}
                                    </option>
                                `).join('')}
                            </select>
                            <p class="text-xs text-gray-500 mt-1">
                                <i class="fas fa-info-circle ml-1"></i>
                                يجب اختيار الكود من مركز التكويد والإصدار. الإصدار سيُسحب تلقائياً.
                            </p>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">اسم النموذج *</label>
                            <input type="text" id="form-name" required class="form-input" 
                                value="${Utils.escapeHTML(data?.name || '')}" placeholder="اسم النموذج">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">النوع *</label>
                            <select id="form-type" required class="form-input">
                                <option value="">اختر النوع</option>
                                <option value="تسجيل" ${data?.type === 'تسجيل' ? 'selected' : ''}>تسجيل</option>
                                <option value="تقرير" ${data?.type === 'تقرير' ? 'selected' : ''}>تقرير</option>
                                <option value="حص" ${data?.type === 'حص' ? 'selected' : ''}>حص</option>
                                <option value="تدريب" ${data?.type === 'تدريب' ? 'selected' : ''}>تدريب</option>
                                <option value="أخرى" ${data?.type === 'أخرى' ? 'selected' : ''}>أخرى</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">رقم الإصدار (يُسحب تلقائياً من المركز)</label>
                            <input type="text" id="form-version" readonly class="form-input bg-gray-100" 
                                value="${Utils.escapeHTML(data?.version || '')}" placeholder="سيتم جلب الإصدار تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ الإصدار</label>
                            <input type="text" id="form-issue-date" readonly class="form-input bg-gray-100" 
                                value="${data?.issueDate ? Utils.formatDate(data.issueDate) : ''}" placeholder="سيتم جلب تاريخ الإصدار تلقائياً">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ التعديل</label>
                            <input type="text" id="form-revision-date" readonly class="form-input bg-gray-100" 
                                value="${data?.revisionDate ? Utils.formatDate(data.revisionDate) : ''}" placeholder="سيتم جلب تاريخ التعديل تلقائياً">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-form-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // إذا كان هناك بيانات موجودة، جلب الإصدار تلقائياً
        if (data?.isoCode) {
            await this.loadDocumentCodeVersion('form', data.isoCode);
        }

        const saveBtn = modal.querySelector('#save-form-btn');
        saveBtn.addEventListener('click', () => this.handleFormSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleFormSubmit(editId = null, modal) {
        // منع النقر المتكرر
        const submitBtn = modal?.querySelector('button[type="submit"]') || 
                         document.querySelector('.modal-overlay button[type="submit"]');
        
        if (submitBtn && submitBtn.disabled) {
            return; // النموذج قيد المعالجة
        }

        // تعطيل الزر لمنع النقر المتكرر
        let originalText = '';
        if (submitBtn) {
            originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري الحفظ...';
        }

        const codeSelect = document.getElementById('form-code-select');
        const selectedCode = codeSelect?.value || '';

        if (!selectedCode) {
            Notification.error('يجب اختيار كود النموذج من مركز التكويد والإصدار');
            // استعادة الزر عند الخطأ
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }

        // فحص العناصر قبل الاستخدام
        const nameEl = document.getElementById('form-name');
        const typeEl = document.getElementById('form-type');
        const versionEl = document.getElementById('form-version');
        const issueDateEl = document.getElementById('form-issue-date');
        const revisionDateEl = document.getElementById('form-revision-date');
        
        if (!nameEl || !typeEl || !versionEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }

        const formData = {
            id: editId || Utils.generateId('ISO_FORM'),
            isoCode: selectedCode,
            name: nameEl.value.trim(),
            type: typeEl.value,
            version: versionEl.value.trim() || 'غير محدد',
            issueDate: issueDateEl?.value || null,
            revisionDate: revisionDateEl?.value || null,
            createdAt: editId ? AppState.appData.isoForms.find(f => f.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        try {
            // 1. حفظ البيانات فوراً في الذاكرة
            if (editId) {
                const index = AppState.appData.isoForms.findIndex(f => f.id === editId);
                if (index !== -1) AppState.appData.isoForms[index] = formData;
                Notification.success('تم تحديث النموذج بنجاح');
            } else {
                AppState.appData.isoForms.push(formData);
                Notification.success('تم إضافة النموذج بنجاح');
            }

            // حفظ البيانات باستخدام window.DataManager
            if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
                window.DataManager.save();
            } else {
                Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
            }

            // 2. إغلاق النموذج فوراً بعد الحفظ في الذاكرة
            modal.remove();
            
            // 3. استعادة الزر بعد النجاح
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            
            // 4. تحديث القائمة فوراً
            this.load();
            
            // 5. معالجة المهام الخلفية (Google Sheets) في الخلفية
            Backend.autoSave('ISOForms', AppState.appData.isoForms).catch(error => {
                Utils.safeError('خطأ في حفظ Google Sheets:', error);
            });
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
            
            // استعادة الزر في حالة الخطأ
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    },

    async viewDocument(id) {
        const doc = AppState.appData.isoDocuments.find(d => d.id === id);
        if (!doc) {
            Notification.error('الوثيقة غير موجودة');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">تفاصيل الوثيقة</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div><strong>كود ISO:</strong> ${Utils.escapeHTML(doc.isoCode || '')}</div>
                        <div><strong>اسم الوثيقة:</strong> ${Utils.escapeHTML(doc.name || '')}</div>
                        <div><strong>النوع:</strong> ${Utils.escapeHTML(doc.type || '')}</div>
                        <div><strong>الإصدار:</strong> ${Utils.escapeHTML(doc.version || '')}</div>
                        <div><strong>القسم:</strong> ${Utils.escapeHTML(doc.department || '')}</div>
                        <div><strong>تاريخ الإنشاء:</strong> ${Utils.formatDate(doc.createdAt)}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                    <button type="button" onclick="ISO.showDocumentForm(${JSON.stringify(doc).replace(/"/g, '&quot;')}); this.closest('.modal-overlay').remove();" class="btn-primary">تعديل</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async viewProcedure(id) {
        const procedure = AppState.appData.isoProcedures.find(p => p.id === id);
        if (!procedure) {
            Notification.error('الإجراء غير موجود');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">تفاصيل الإجراء</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div><strong>كود ISO:</strong> ${Utils.escapeHTML(procedure.isoCode || '')}</div>
                        <div><strong>اسم الإجراء:</strong> ${Utils.escapeHTML(procedure.name || '')}</div>
                        <div><strong>القسم:</strong> ${Utils.escapeHTML(procedure.department || '')}</div>
                        <div><strong>الإصدار:</strong> ${Utils.escapeHTML(procedure.version || '')}</div>
                        <div><strong>تاريخ الإنشاء:</strong> ${Utils.formatDate(procedure.createdAt)}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                    <button type="button" onclick="ISO.showProcedureForm(${JSON.stringify(procedure).replace(/"/g, '&quot;')}); this.closest('.modal-overlay').remove();" class="btn-primary">تعديل</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async viewForm(id) {
        const form = AppState.appData.isoForms.find(f => f.id === id);
        if (!form) {
            Notification.error('النموذج غير موجود');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">تفاصيل النموذج</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div><strong>كود ISO:</strong> ${Utils.escapeHTML(form.isoCode || '')}</div>
                        <div><strong>اسم النموذج:</strong> ${Utils.escapeHTML(form.name || '')}</div>
                        <div><strong>النوع:</strong> ${Utils.escapeHTML(form.type || '')}</div>
                        <div><strong>تاريخ الإنشاء:</strong> ${Utils.formatDate(form.createdAt)}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                    <button type="button" onclick="ISO.showFormForm(${JSON.stringify(form).replace(/"/g, '&quot;')}); this.closest('.modal-overlay').remove();" class="btn-primary">تعديل</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async renderISO45001() {
        const objectives = AppState.appData.hseObjectives || [];
        const riskAssessments = AppState.appData.hseRiskAssessments || [];

        return `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-hard-hat ml-2"></i>ISO 45001 - السلامة والصحة المهنية</h2>
                </div>
                <div class="card-body">
                    <div class="space-y-4">
                        <p class="text-gray-700">
                            يركز هذا القسم على متطلبات نظام إدارة السلامة والصحة المهنية (OH&S) وقًا لمعيار ISO 45001.
                            يهد إلى تمكين المنظمة من توير أماكن عمل آمنة وصحية، ومنع الإصابات والأمراض المرتبطة بالعمل،
                            بالإضاة إلى التحسين المستمر لأداء السلامة والصحة المهنية.
                        </p>
                        <h3 class="font-semibold text-lg mt-4 mb-2">العناصر الرئيسية:</h3>
                        <ul class="list-disc list-inside text-gray-700 space-y-2">
                            <li>السياق التنظيمي</li>
                            <li>القيادة ومشاركة العاملين</li>
                            <li>التخطيط (تحديد المخاطر والرص، الأهدا)</li>
                            <li>الدعم (الموارد، الكاءة، الوعي، الاتصال، المعلومات الموثقة)</li>
                            <li>التشغيل (التخطيط والتحكم التشغيلي، إدارة التغيير، المشتريات، المقاولون، الاستعداد للطوارئ)</li>
                            <li>تقييم الأداء (المراقبة والقياس، تقييم الامتثال، التدقيق الداخلي، مراجعة الإدارة)</li>
                            <li>التحسين (عدم المطابقة والإجراءات التصحيحية، التحسين المستمر)</li>
                        </ul>
                        <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-blue-50 border border-blue-200 rounded p-4">
                                <h4 class="font-semibold text-blue-800 mb-2">الأهدا (${objectives.length})</h4>
                                <p class="text-sm text-gray-700 mb-3">إدارة أهدا السلامة والصحة المهنية</p>
                                <button class="btn-secondary w-full" onclick="ISO.showHSEObjectiveForm()">
                                    <i class="fas fa-bullseye ml-2"></i>إدارة الأهدا
                                </button>
                            </div>
                            <div class="bg-green-50 border border-green-200 rounded p-4">
                                <h4 class="font-semibold text-green-800 mb-2">تقييمات المخاطر (${riskAssessments.length})</h4>
                                <p class="text-sm text-gray-700 mb-3">تقييم مخاطر السلامة والصحة المهنية</p>
                                <button class="btn-secondary w-full" onclick="ISO.showHSERiskAssessmentForm()">
                                    <i class="fas fa-shield-alt ml-2"></i>تقييم المخاطر
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderISO14001() {
        const aspects = AppState.appData.environmentalAspects || [];
        const monitoring = AppState.appData.environmentalMonitoring || [];

        return `
            <div class="content-card">
                <div class="card-header">
                    <h2 class="card-title"><i class="fas fa-leaf ml-2"></i>ISO 14001 - إدارة البيئة</h2>
                </div>
                <div class="card-body">
                    <div class="space-y-4">
                        <p class="text-gray-700">
                            يحدد هذا القسم متطلبات نظام إدارة البيئة (EMS) وقًا لمعيار ISO 14001.
                            يهد إلى مساعدة المنظمات على تحسين أدائها البيئي من خلال إدارة مسؤولياتها البيئية
                            بطريقة منهجية تساهم ي ركيزة الاستدامة.
                        </p>
                        <h3 class="font-semibold text-lg mt-4 mb-2">العناصر الرئيسية:</h3>
                        <ul class="list-disc list-inside text-gray-700 space-y-2">
                            <li>السياق التنظيمي</li>
                            <li>القيادة</li>
                            <li>التخطيط (تحديد الجوانب البيئية، الالتزامات الامتثالية، الأهدا البيئية)</li>
                            <li>الدعم (الموارد، الكاءة، الوعي، الاتصال، المعلومات الموثقة)</li>
                            <li>التشغيل (التخطيط والتحكم التشغيلي، الاستعداد للطوارئ والاستجابة لها)</li>
                            <li>تقييم الأداء (المراقبة والقياس، تقييم الامتثال، التدقيق الداخلي، مراجعة الإدارة)</li>
                            <li>التحسين (عدم المطابقة والإجراءات التصحيحية، التحسين المستمر)</li>
                        </ul>
                        <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="bg-green-50 border border-green-200 rounded p-4">
                                <h4 class="font-semibold text-green-800 mb-2">الجوانب البيئية (${aspects.length})</h4>
                                <p class="text-sm text-gray-700 mb-3">إدارة الجوانب البيئية وتأثيراتها</p>
                                <button class="btn-secondary w-full" onclick="ISO.showEnvironmentalAspectsForm()">
                                    <i class="fas fa-globe ml-2"></i>إدارة الجوانب البيئية
                                </button>
                            </div>
                            <div class="bg-blue-50 border border-blue-200 rounded p-4">
                                <h4 class="font-semibold text-blue-800 mb-2">المراقبة البيئية (${monitoring.length})</h4>
                                <p class="text-sm text-gray-700 mb-3">تتبع ومراقبة الأداء البيئي</p>
                                <button class="btn-secondary w-full" onclick="ISO.showEnvironmentalMonitoringForm()">
                                    <i class="fas fa-chart-line ml-2"></i>المراقبة البيئية
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderAudit() {
        const audits = AppState.appData.hseAudits || [];
        const nonConformities = AppState.appData.hseNonConformities || [];
        const actions = AppState.appData.hseCorrectiveActions || [];

        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="content-card">
                    <div class="card-header">
                        <div class="flex items-center justify-between">
                            <h2 class="card-title"><i class="fas fa-clipboard-check ml-2"></i>عمليات التدقيق</h2>
                            <button class="btn-primary" onclick="ISO.showAuditForm()">
                                <i class="fas fa-plus ml-2"></i>إضافة تدقيق
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${audits.length === 0 ? '<div class="empty-state"><p class="text-gray-500">لا توجد عمليات تدقيق مسجلة</p></div>' : `
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>التاريخ</th>
                                        <th>النوع</th>
                                        <th>المدقق</th>
                                        <th>الحالة</th>
                                        <th>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${audits.map(audit => `
                                        <tr>
                                            <td>${Utils.formatDate(audit.date)}</td>
                                            <td>${Utils.escapeHTML(audit.type)}</td>
                                            <td>${Utils.escapeHTML(audit.auditor)}</td>
                                            <td><span class="badge badge-${audit.status === 'مكتمل' ? 'success' : 'warning'}">${audit.status}</span></td>
                                            <td>
                                                <button onclick="ISO.viewAudit('${audit.id}')" class="btn-icon btn-icon-info"><i class="fas fa-eye"></i></button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                </div>
                
                <div class="content-card">
                    <div class="card-header">
                        <div class="flex items-center justify-between">
                            <h2 class="card-title"><i class="fas fa-times-circle ml-2"></i>عدم المطابقة والإجراءات التصحيحية</h2>
                            <button class="btn-primary" onclick="ISO.showNonConformityForm()">
                                <i class="fas fa-plus ml-2"></i>إضافة عدم مطابقة
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${nonConformities.length === 0 && actions.length === 0 ? '<div class="empty-state"><p class="text-gray-500">لا توجد عدم مطابقة أو إجراءات تصحيحية</p></div>' : `
                            <h3 class="font-semibold text-md mb-2">عدم المطابقة (${nonConformities.length})</h3>
                            ${nonConformities.length === 0 ? '<p class="text-gray-500 text-sm">لا توجد عدم مطابقة مسجلة</p>' : `
                                <table class="data-table mb-4">
                                    <thead>
                                        <tr>
                                            <th>التاريخ</th>
                                            <th>الوصف</th>
                                            <th>الحالة</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${nonConformities.map(nc => `
                                            <tr>
                                                <td>${Utils.formatDate(nc.date)}</td>
                                                <td>${Utils.escapeHTML(nc.description.substring(0, 50))}...</td>
                                                <td><span class="badge badge-${nc.status === 'مغلق' ? 'success' : 'danger'}">${nc.status}</span></td>
                                                <td>
                                                    <button onclick="ISO.viewNonConformity('${nc.id}')" class="btn-icon btn-icon-info"><i class="fas fa-eye"></i></button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            `}

                            <h3 class="font-semibold text-md mb-2 mt-6">الإجراءات التصحيحية (${actions.length})</h3>
                            ${actions.length === 0 ? '<p class="text-gray-500 text-sm">لا توجد إجراءات تصحيحية مسجلة</p>' : `
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>الوص</th>
                                            <th>المسؤول</th>
                                            <th>تاريخ الانتهاء</th>
                                            <th>الحالة</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${actions.map(action => `
                                            <tr>
                                                <td>${Utils.escapeHTML(action.description.substring(0, 50))}...</td>
                                                <td>${Utils.escapeHTML(action.responsible)}</td>
                                                <td>${Utils.formatDate(action.dueDate)}</td>
                                                <td><span class="badge badge-${action.status === 'مكتمل' ? 'success' : 'warning'}">${action.status}</span></td>
                                                <td>
                                                    <button onclick="ISO.viewCorrectiveAction('${action.id}')" class="btn-icon btn-icon-info"><i class="fas fa-eye"></i></button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            `}
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    async showHSEObjectiveForm(data = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل هد' : 'إضافة هد HSE جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="hse-objective-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الهد *</label>
                            <input type="text" id="objective-name" required class="form-input" 
                                value="${Utils.escapeHTML(data?.name || '')}" placeholder="مثال: تقليل الإصابات بنسبة 20%">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوصف *</label>
                            <textarea id="objective-description" required class="form-input" rows="4" 
                                placeholder="وصف تفصيلي للحد الهدفي">${Utils.escapeHTML(data?.description || '')}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ الانتهاء *</label>
                            <input type="date" id="objective-due-date" required class="form-input" 
                                value="${data?.dueDate ? new Date(data.dueDate).toISOString().slice(0, 10) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">المسؤول *</label>
                            <input type="text" id="objective-responsible" required class="form-input" 
                                value="${Utils.escapeHTML(data?.responsible || '')}" placeholder="اسم المسؤول">
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-objective-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-objective-btn');
        saveBtn.addEventListener('click', () => this.handleHSEObjectiveSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleHSEObjectiveSubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const nameEl = document.getElementById('objective-name');
        const descriptionEl = document.getElementById('objective-description');
        const dueDateEl = document.getElementById('objective-due-date');
        const responsibleEl = document.getElementById('objective-responsible');
        
        if (!nameEl || !descriptionEl || !dueDateEl || !responsibleEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('HSE_OBJ'),
            name: nameEl.value.trim(),
            description: descriptionEl.value.trim(),
            dueDate: new Date(dueDateEl.value).toISOString(),
            responsible: responsibleEl.value.trim(),
            status: editId ? AppState.appData.hseObjectives.find(o => o.id === editId)?.status || 'قيد التنيذ' : 'قيد التنيذ',
            createdAt: editId ? AppState.appData.hseObjectives.find(o => o.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!AppState.appData.hseObjectives) {
            AppState.appData.hseObjectives = [];
        }

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.hseObjectives.findIndex(o => o.id === editId);
                if (index !== -1) AppState.appData.hseObjectives[index] = formData;
                Notification.success('تم تحديث الهد بنجاح');
                // للتحديث: حفظ كامل البيانات
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                await Backend.autoSave('HSEObjectives', AppState.appData.hseObjectives);
            } else {
                AppState.appData.hseObjectives.push(formData);
                Notification.success('تم إضافة الهد بنجاح');
                // للإضافة: حفظ محلي ثم إرسال مباشر إلى الخلفية
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                // إرسال مباشر إلى الخلفية للسجل الجديد
                if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                    try {
                        await Backend.sendToAppsScript('addHSEObjective', formData);
                        Utils.safeLog('✅ تم حفظ الهدف مباشرة في الخلفية');
                    } catch (error) {
                        Utils.safeWarn('⚠ فشل الحفظ المباشر، سيتم المزامنة لاحقاً:', error);
                        // في حالة الفشل، نستخدم autoSave كبديل
                        await Backend.autoSave('HSEObjectives', AppState.appData.hseObjectives);
                    }
                } else {
                    // إذا لم يكن الخادم السحابي مفعّل، نستخدم autoSave فقط
                    await Backend.autoSave('HSEObjectives', AppState.appData.hseObjectives);
                }
            }

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async showHSERiskAssessmentForm(data = null) {
        Notification.info('سيتم إضافة نموذج تقييم المخاطر HSE قريباً');
    },

    async showEnvironmentalAspectsForm(data = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل جانب بيئي' : 'إضافة جانب بيئي جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="environmental-aspect-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">اسم الجانب البيئي *</label>
                            <input type="text" id="aspect-name" required class="form-input" 
                                value="${Utils.escapeHTML(data?.name || '')}" placeholder="مثال: استهلاك المياه">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوصف *</label>
                            <textarea id="aspect-description" required class="form-input" rows="4" 
                                placeholder="وصف تفصيلي للجانب البيئي">${Utils.escapeHTML(data?.description || '')}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">التأثير *</label>
                            <select id="aspect-impact" required class="form-input">
                                <option value="">اختر التأثير</option>
                                <option value="منخض" ${data?.impact === 'منخض' ? 'selected' : ''}>منخض</option>
                                <option value="متوسط" ${data?.impact === 'متوسط' ? 'selected' : ''}>متوسط</option>
                                <option value="عالي" ${data?.impact === 'عالي' ? 'selected' : ''}>عالي</option>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-aspect-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-aspect-btn');
        saveBtn.addEventListener('click', () => this.handleEnvironmentalAspectsSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleEnvironmentalAspectsSubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const nameEl = document.getElementById('aspect-name');
        const descriptionEl = document.getElementById('aspect-description');
        const impactEl = document.getElementById('aspect-impact');
        
        if (!nameEl || !descriptionEl || !impactEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('ENV_ASP'),
            name: nameEl.value.trim(),
            description: descriptionEl.value.trim(),
            impact: impactEl.value,
            createdAt: editId ? AppState.appData.environmentalAspects.find(a => a.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!AppState.appData.environmentalAspects) {
            AppState.appData.environmentalAspects = [];
        }

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.environmentalAspects.findIndex(a => a.id === editId);
                if (index !== -1) AppState.appData.environmentalAspects[index] = formData;
                Notification.success('تم تحديث الجانب البيئي بنجاح');
                // للتحديث: حفظ كامل البيانات
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                await Backend.autoSave('EnvironmentalAspects', AppState.appData.environmentalAspects);
            } else {
                AppState.appData.environmentalAspects.push(formData);
                Notification.success('تم إضافة الجانب البيئي بنجاح');
                // للإضافة: حفظ محلي ثم إرسال مباشر إلى الخلفية
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                // إرسال مباشر إلى الخلفية للسجل الجديد
                if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                    try {
                        await Backend.sendToAppsScript('addEnvironmentalAspect', formData);
                        Utils.safeLog('✅ تم حفظ الجانب البيئي مباشرة في الخلفية');
                    } catch (error) {
                        Utils.safeWarn('⚠ فشل الحفظ المباشر، سيتم المزامنة لاحقاً:', error);
                        // في حالة الفشل، نستخدم autoSave كبديل
                        await Backend.autoSave('EnvironmentalAspects', AppState.appData.environmentalAspects);
                    }
                } else {
                    // إذا لم يكن الخادم السحابي مفعّل، نستخدم autoSave فقط
                    await Backend.autoSave('EnvironmentalAspects', AppState.appData.environmentalAspects);
                }
            }

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async showEnvironmentalMonitoringForm(data = null) {
        Notification.info('سيتم إضافة نموذج المراقبة البيئية قريباً');
    },

    async showAuditForm(data = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل تدقيق' : 'إضاة تدقيق جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="audit-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">نوع التدقيق *</label>
                            <select id="audit-type" required class="form-input">
                                <option value="">اختر النوع</option>
                                <option value="تدقيق داخلي" ${data?.type === 'تدقيق داخلي' ? 'selected' : ''}>تدقيق داخلي</option>
                                <option value="تدقيق خارجي" ${data?.type === 'تدقيق خارجي' ? 'selected' : ''}>تدقيق خارجي</option>
                                <option value="مراجعة إدارة" ${data?.type === 'مراجعة إدارة' ? 'selected' : ''}>مراجعة إدارة</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ التدقيق *</label>
                            <input type="date" id="audit-date" required class="form-input" 
                                value="${data?.date ? new Date(data.date).toISOString().slice(0, 10) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">المدقق *</label>
                            <input type="text" id="audit-auditor" required class="form-input" 
                                value="${Utils.escapeHTML(data?.auditor || '')}" placeholder="اسم المدقق">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الحالة *</label>
                            <select id="audit-status" required class="form-input">
                                <option value="مخطط" ${data?.status === 'مخطط' ? 'selected' : ''}>مخطط</option>
                                <option value="قيد التنيذ" ${data?.status === 'قيد التنيذ' ? 'selected' : ''}>قيد التنيذ</option>
                                <option value="مكتمل" ${data?.status === 'مكتمل' ? 'selected' : ''}>مكتمل</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوص</label>
                            <textarea id="audit-description" class="form-input" rows="4" 
                                placeholder="وصف تفصيلي للتدقيق">${Utils.escapeHTML(data?.description || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-audit-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-audit-btn');
        saveBtn.addEventListener('click', () => this.handleAuditSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleAuditSubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const typeEl = document.getElementById('audit-type');
        const dateEl = document.getElementById('audit-date');
        const auditorEl = document.getElementById('audit-auditor');
        const statusEl = document.getElementById('audit-status');
        const descriptionEl = document.getElementById('audit-description');
        
        if (!typeEl || !dateEl || !auditorEl || !statusEl || !descriptionEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('HSE_AUDIT'),
            type: typeEl.value,
            date: new Date(dateEl.value).toISOString(),
            auditor: auditorEl.value.trim(),
            status: statusEl.value,
            description: descriptionEl.value.trim(),
            createdAt: editId ? AppState.appData.hseAudits.find(a => a.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!AppState.appData.hseAudits) {
            AppState.appData.hseAudits = [];
        }

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.hseAudits.findIndex(a => a.id === editId);
                if (index !== -1) AppState.appData.hseAudits[index] = formData;
                Notification.success('تم تحديث التدقيق بنجاح');
                // للتحديث: حفظ كامل البيانات
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                await Backend.autoSave('HSEAudits', AppState.appData.hseAudits);
            } else {
                AppState.appData.hseAudits.push(formData);
                Notification.success('تم إضافة التدقيق بنجاح');
                // للإضافة: حفظ محلي ثم إرسال مباشر إلى الخلفية
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                // إرسال مباشر إلى الخلفية للسجل الجديد
                if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                    try {
                        await Backend.sendToAppsScript('addHSEAudit', formData);
                        Utils.safeLog('✅ تم حفظ التدقيق مباشرة في الخلفية');
                    } catch (error) {
                        Utils.safeWarn('⚠ فشل الحفظ المباشر، سيتم المزامنة لاحقاً:', error);
                        // في حالة الفشل، نستخدم autoSave كبديل
                        await Backend.autoSave('HSEAudits', AppState.appData.hseAudits);
                    }
                } else {
                    // إذا لم يكن الخادم السحابي مفعّل، نستخدم autoSave فقط
                    await Backend.autoSave('HSEAudits', AppState.appData.hseAudits);
                }
            }

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async viewAudit(id) {
        const audit = AppState.appData.hseAudits.find(a => a.id === id);
        if (!audit) {
            Notification.error('التدقيق غير موجود');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">تفاصيل التدقيق</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div><strong>النوع:</strong> ${Utils.escapeHTML(audit.type)}</div>
                        <div><strong>التاريخ:</strong> ${Utils.formatDate(audit.date)}</div>
                        <div><strong>المدقق:</strong> ${Utils.escapeHTML(audit.auditor)}</div>
                        <div><strong>الحالة:</strong> <span class="badge badge-${audit.status === 'مكتمل' ? 'success' : 'warning'}">${audit.status}</span></div>
                        <div><strong>الوصف:</strong> ${Utils.escapeHTML(audit.description || '-')}</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async showNonConformityForm(data = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل عدم مطابقة' : 'إضافة عدم مطابقة جديدة'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="non-conformity-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ عدم المطابقة *</label>
                            <input type="date" id="nc-date" required class="form-input" 
                                value="${data?.date ? new Date(data.date).toISOString().slice(0, 10) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوصف *</label>
                            <textarea id="nc-description" required class="form-input" rows="4" 
                                placeholder="وصف تفصيلي لعدم المطابقة">${Utils.escapeHTML(data?.description || '')}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الحالة *</label>
                            <select id="nc-status" required class="form-input">
                                <option value="متوحة" ${data?.status === 'متوحة' ? 'selected' : ''}>متوحة</option>
                                <option value="قيد المعالجة" ${data?.status === 'قيد المعالجة' ? 'selected' : ''}>قيد المعالجة</option>
                                <option value="مغلق" ${data?.status === 'مغلق' ? 'selected' : ''}>مغلق</option>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-nc-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-nc-btn');
        saveBtn.addEventListener('click', () => this.handleNonConformitySubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleNonConformitySubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const dateEl = document.getElementById('nc-date');
        const descriptionEl = document.getElementById('nc-description');
        const statusEl = document.getElementById('nc-status');
        
        if (!dateEl || !descriptionEl || !statusEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('HSE_NC'),
            date: new Date(dateEl.value).toISOString(),
            description: descriptionEl.value.trim(),
            status: statusEl.value,
            createdAt: editId ? AppState.appData.hseNonConformities.find(nc => nc.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!AppState.appData.hseNonConformities) {
            AppState.appData.hseNonConformities = [];
        }

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.hseNonConformities.findIndex(nc => nc.id === editId);
                if (index !== -1) AppState.appData.hseNonConformities[index] = formData;
                Notification.success('تم تحديث عدم المطابقة بنجاح');
                // للتحديث: حفظ كامل البيانات
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                await Backend.autoSave('HSENonConformities', AppState.appData.hseNonConformities);
            } else {
                AppState.appData.hseNonConformities.push(formData);
                Notification.success('تم إضافة عدم المطابقة بنجاح');
                // للإضافة: حفظ محلي ثم إرسال مباشر إلى الخلفية
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                // إرسال مباشر إلى الخلفية للسجل الجديد
                if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                    try {
                        await Backend.sendToAppsScript('addHSENonConformity', formData);
                        Utils.safeLog('✅ تم حفظ عدم المطابقة مباشرة في الخلفية');
                    } catch (error) {
                        Utils.safeWarn('⚠ فشل الحفظ المباشر، سيتم المزامنة لاحقاً:', error);
                        // في حالة الفشل، نستخدم autoSave كبديل
                        await Backend.autoSave('HSENonConformities', AppState.appData.hseNonConformities);
                    }
                } else {
                    // إذا لم يكن الخادم السحابي مفعّل، نستخدم autoSave فقط
                    await Backend.autoSave('HSENonConformities', AppState.appData.hseNonConformities);
                }
            }

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async viewNonConformity(id) {
        const nc = AppState.appData.hseNonConformities.find(n => n.id === id);
        if (!nc) {
            Notification.error('عدم المطابقة غير موجودة');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">تفاصيل عدم المطابقة</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div><strong>التاريخ:</strong> ${Utils.formatDate(nc.date)}</div>
                        <div><strong>الوصف:</strong> ${Utils.escapeHTML(nc.description)}</div>
                        <div><strong>الحالة:</strong> <span class="badge badge-${nc.status === 'مغلق' ? 'success' : 'danger'}">${nc.status}</span></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async showCorrectiveActionForm(data = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل إجراء تصحيحي' : 'إضافة إجراء تصحيحي جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="corrective-action-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوصف *</label>
                            <textarea id="ca-description" required class="form-input" rows="4" 
                                placeholder="وصف تفصيلي للإجراء التصحيحي">${Utils.escapeHTML(data?.description || '')}</textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">المسؤول *</label>
                            <input type="text" id="ca-responsible" required class="form-input" 
                                value="${Utils.escapeHTML(data?.responsible || '')}" placeholder="اسم المسؤول">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ الانتهاء *</label>
                            <input type="date" id="ca-due-date" required class="form-input" 
                                value="${data?.dueDate ? new Date(data.dueDate).toISOString().slice(0, 10) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الحالة *</label>
                            <select id="ca-status" required class="form-input">
                                <option value="قيد التنفيذ" ${data?.status === 'قيد التنيذ' ? 'selected' : ''}>قيد التنيذ</option>
                                <option value="مكتمل" ${data?.status === 'مكتمل' ? 'selected' : ''}>مكتمل</option>
                            </select>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-ca-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-ca-btn');
        saveBtn.addEventListener('click', () => this.handleCorrectiveActionSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleCorrectiveActionSubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const descriptionEl = document.getElementById('ca-description');
        const responsibleEl = document.getElementById('ca-responsible');
        const dueDateEl = document.getElementById('ca-due-date');
        const statusEl = document.getElementById('ca-status');
        
        if (!descriptionEl || !responsibleEl || !dueDateEl || !statusEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('HSE_CA'),
            description: descriptionEl.value.trim(),
            responsible: responsibleEl.value.trim(),
            dueDate: new Date(dueDateEl.value).toISOString(),
            status: statusEl.value,
            createdAt: editId ? AppState.appData.hseCorrectiveActions.find(ca => ca.id === editId)?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (!AppState.appData.hseCorrectiveActions) {
            AppState.appData.hseCorrectiveActions = [];
        }

        Loading.show();
        try {
            if (editId) {
                const index = AppState.appData.hseCorrectiveActions.findIndex(ca => ca.id === editId);
                if (index !== -1) AppState.appData.hseCorrectiveActions[index] = formData;
                Notification.success('تم تحديث الإجراء التصحيحي بنجاح');
                // للتحديث: حفظ كامل البيانات
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }
                await Backend.autoSave('HSECorrectiveActions', AppState.appData.hseCorrectiveActions);
            } else {
                AppState.appData.hseCorrectiveActions.push(formData);
                Notification.success('تم إضافة الإجراء التصحيحي بنجاح');
                // للإضافة: حفظ محلي ثم إرسال مباشر إلى الخلفية
                // حفظ البيانات باستخدام window.DataManager
        if (typeof window.DataManager !== 'undefined' && window.DataManager.save) {
            window.DataManager.save();
        } else {
            Utils.safeWarn('⚠️ DataManager غير متاح - لم يتم حفظ البيانات');
        }

                // إرسال مباشر إلى الخلفية للسجل الجديد
                if (AppState.backendConfig.server.enabled && AppState.backendConfig.server.scriptUrl) {
                    try {
                        await Backend.sendToAppsScript('addHSECorrectiveAction', formData);
                        Utils.safeLog('✅ تم حفظ الإجراء التصحيحي مباشرة في الخلفية');
                    } catch (error) {
                        Utils.safeWarn('⚠ فشل الحفظ المباشر، سيتم المزامنة لاحقاً:', error);
                        // في حالة الفشل، نستخدم autoSave كبديل
                        await Backend.autoSave('HSECorrectiveActions', AppState.appData.hseCorrectiveActions);
                    }
                } else {
                    // إذا لم يكن الخادم السحابي مفعّل، نستخدم autoSave فقط
                    await Backend.autoSave('HSECorrectiveActions', AppState.appData.hseCorrectiveActions);
                }
            }

            Loading.hide();
            modal.remove();
            this.load();
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async viewCorrectiveAction(id) {
        const ca = AppState.appData.hseCorrectiveActions.find(c => c.id === id);
        if (!ca) {
            Notification.error('الإجراء التصحيحي غير موجود');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">تفاصيل الإجراء التصحيحي</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <div class="space-y-3">
                        <div><strong>الوصف:</strong> ${Utils.escapeHTML(ca.description)}</div>
                        <div><strong>المسؤول:</strong> ${Utils.escapeHTML(ca.responsible)}</div>
                        <div><strong>تاريخ الانتهاء:</strong> ${Utils.formatDate(ca.dueDate)}</div>
                        <div><strong>الحالة:</strong> <span class="badge badge-${ca.status === 'مكتمل' ? 'success' : 'warning'}">${ca.status}</span></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    // ===== مركز التكويد والإصدار (Document Coding & Issuing Center) =====
    async renderCodingCenter(opts = {}) {
        const skipFetch = opts && opts.skipFetch === true;
        const showLoadingIndicator = skipFetch;

        // التحقق من الصلاحيات - فقط المدير يمكنه الوصول
        const currentUser = AppState.currentUser;
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'مدير')) {
            return `
                <div class="content-card">
                    <div class="card-body">
                        <div class="empty-state">
                            <i class="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                            <p class="text-gray-600">ليس لديك صلاحية للوصول إلى مركز التكويد والإصدار</p>
                            <p class="text-sm text-gray-500 mt-2">هذا القسم متاح فقط لمدير النظام</p>
                        </div>
                    </div>
                </div>
            `;
        }

        let documentCodes = [];
        let documentVersions = [];
        let timedOut = false;
        const silentTimeout = opts && opts.silentTimeout === true;

        if (!skipFetch) {
            const LOAD_TIMEOUT_MS = 60000;
            try {
                Loading.show();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('TIMEOUT')), LOAD_TIMEOUT_MS)
                );
                const fetchPromise = Promise.all([
                    Backend.fetchData('getDocumentCodes', {}).catch(() => ({ success: false, data: [] })),
                    Backend.fetchData('getDocumentVersions', { documentCodeId: null }).catch(() => ({ success: false, data: [] }))
                ]);
                const [codesResult, versionsResult] = await Promise.race([fetchPromise, timeoutPromise]);
                if (codesResult && codesResult.success && codesResult.data) {
                    documentCodes = codesResult.data;
                }
                if (versionsResult && versionsResult.success && versionsResult.data) {
                    documentVersions = versionsResult.data;
                }
            } catch (error) {
                if (error && error.message === 'TIMEOUT') {
                    timedOut = true;
                    Utils.safeError('مركز التكويد والإصدار: انتهت مهلة التحميل. جرب تحديث الصفحة.');
                    if (!silentTimeout && typeof Notification !== 'undefined') {
                        Notification.warning('انتهت مهلة تحميل البيانات. يمكنك تحديث الصفحة أو المحاولة لاحقاً.');
                    }
                } else {
                    Utils.safeError('Error loading coding center data:', error);
                }
            } finally {
                Loading.hide();
            }
        }

        const html = `
            <div class="space-y-6">
                ${timedOut ? `
                <div class="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-center gap-2">
                    <i class="fas fa-clock text-amber-600"></i>
                    <span class="text-sm text-amber-800">لم يتم تحميل البيانات في الوقت المحدد. اضغط <strong>إعادة تحميل</strong> للمحاولة مرة أخرى.</span>
                </div>
                ` : ''}
                ${showLoadingIndicator ? `
                <div class="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex items-center gap-2">
                    <i class="fas fa-spinner fa-spin text-blue-600"></i>
                    <span class="text-sm text-blue-800">جاري تحميل البيانات...</span>
                </div>
                ` : ''}
                <!-- إحصائيات سريعة + زر إعادة التحميل -->
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                            <div class="text-3xl font-bold text-blue-600 mb-2">${documentCodes.length}</div>
                            <div class="text-sm text-gray-700 font-semibold">أكواد المستندات</div>
                        </div>
                        <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                            <div class="text-3xl font-bold text-green-600 mb-2">${documentVersions.length}</div>
                            <div class="text-sm text-gray-700 font-semibold">إصدارات المستندات</div>
                        </div>
                        <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                            <div class="text-3xl font-bold text-purple-600 mb-2">${documentVersions.filter(v => v.isActive === true || v.isActive === 'true').length}</div>
                            <div class="text-sm text-gray-700 font-semibold">إصدارات نشطة</div>
                        </div>
                    </div>
                    <button type="button" onclick="ISO.reloadCodingCenter()" class="btn-secondary flex items-center gap-2 shrink-0" title="إعادة تحميل البيانات">
                        <i class="fas fa-sync-alt"></i>
                        <span>إعادة تحميل</span>
                    </button>
                </div>

                <!-- قسم إدارة التكويد -->
                <div class="content-card">
                    <div class="card-header">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                            <h2 class="card-title">
                                <i class="fas fa-code ml-2"></i>
                                مركز التكويد (Document Coding Center)
                            </h2>
                            <div class="flex flex-wrap items-center gap-2">
                                <button type="button" class="btn-secondary flex items-center gap-1" onclick="ISO.importCodingCenterFromExcel()" title="استيراد أكواد المستندات من ملف Excel أو CSV">
                                    <i class="fas fa-file-excel"></i>
                                    <span>استيراد Excel</span>
                                </button>
                                <button type="button" class="btn-secondary flex items-center gap-1" onclick="ISO.importCodingCenterFromPDF()" title="استيراد من PDF (غير مدعوم للجداول - استخدم Excel)">
                                    <i class="fas fa-file-pdf"></i>
                                    <span>استيراد PDF</span>
                                </button>
                                <button type="button" class="btn-secondary flex items-center gap-1" onclick="ISO.exportCodingCenterToExcel()" title="تصدير البيانات إلى Excel">
                                    <i class="fas fa-file-export"></i>
                                    <span>تصدير Excel</span>
                                </button>
                                <button type="button" class="btn-secondary flex items-center gap-1" onclick="ISO.exportCodingCenterToPDF()" title="تصدير البيانات إلى PDF">
                                    <i class="fas fa-file-pdf"></i>
                                    <span>تصدير PDF</span>
                                </button>
                                <button class="btn-primary" onclick="ISO.showDocumentCodeForm()">
                                    <i class="fas fa-plus ml-2"></i>إضافة كود جديد
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="mb-4">
                            <input type="text" id="document-code-search" class="form-input" 
                                placeholder="بحث في أكواد المستندات..." 
                                onkeyup="ISO.filterDocumentCodes()">
                        </div>
                        ${documentCodes.length === 0 ? `
                            <div class="empty-state">
                                <p class="text-gray-500">لا توجد أكواد مستندات مسجلة</p>
                            </div>
                        ` : `
                            <div class="overflow-x-auto">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>الكود</th>
                                            <th>اسم المستند</th>
                                            <th>نوع المستند</th>
                                            <th>القسم</th>
                                            <th>الحالة</th>
                                            <th>تاريخ الإنشاء</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="document-codes-table-body">
                                        ${documentCodes.map(code => `
                                            <tr>
                                                <td><strong>${Utils.escapeHTML(code.code || '')}</strong></td>
                                                <td>${Utils.escapeHTML(code.documentName || '')}</td>
                                                <td>${Utils.escapeHTML(code.documentType || '')}</td>
                                                <td>${Utils.escapeHTML(code.department || '')}</td>
                                                <td><span class="badge badge-${code.status === 'نشط' ? 'success' : 'warning'}">${Utils.escapeHTML(code.status || '')}</span></td>
                                                <td>${code.createdAt ? Utils.formatDate(code.createdAt) : '-'}</td>
                                                <td>
                                                    <button onclick="ISO.editDocumentCode('${code.id}')" class="btn-icon btn-icon-info" title="تعديل">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button onclick="ISO.viewDocumentVersions('${code.id}')" class="btn-icon btn-icon-success" title="عرض الإصدارات">
                                                        <i class="fas fa-list"></i>
                                                    </button>
                                                    <button onclick="ISO.deleteDocumentCode('${code.id}')" class="btn-icon btn-icon-danger" title="حذف">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>

                <!-- قسم إدارة الإصدارات -->
                <div class="content-card">
                    <div class="card-header">
                        <div class="flex items-center justify-between">
                            <h2 class="card-title">
                                <i class="fas fa-file-alt ml-2"></i>
                                مركز الإصدار (Issuing Center)
                            </h2>
                            <button class="btn-primary" onclick="ISO.showDocumentVersionForm()">
                                <i class="fas fa-plus ml-2"></i>إضافة إصدار جديد
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        <div class="mb-4">
                            <select id="version-filter-code" class="form-input" onchange="ISO.filterDocumentVersions()">
                                <option value="">جميع الأكواد</option>
                                ${documentCodes.map(code => `
                                    <option value="${code.id}">${Utils.escapeHTML(code.code || '')} - ${Utils.escapeHTML(code.documentName || '')}</option>
                                `).join('')}
                            </select>
                        </div>
                        ${documentVersions.length === 0 ? `
                            <div class="empty-state">
                                <p class="text-gray-500">لا توجد إصدارات مسجلة</p>
                            </div>
                        ` : `
                            <div class="overflow-x-auto">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>الكود</th>
                                            <th>رقم الإصدار</th>
                                            <th>تاريخ الإصدار</th>
                                            <th>تاريخ التعديل</th>
                                            <th>الحالة</th>
                                            <th>الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody id="document-versions-table-body">
                                        ${documentVersions.map(version => {
            const code = documentCodes.find(c => c.id === version.documentCodeId);
            return `
                                                <tr data-code-id="${version.documentCodeId}">
                                                    <td><strong>${Utils.escapeHTML(version.documentCode || code?.code || '')}</strong></td>
                                                    <td>${Utils.escapeHTML(version.versionNumber || '')}</td>
                                                    <td>${version.issueDate ? Utils.formatDate(version.issueDate) : '-'}</td>
                                                    <td>${version.revisionDate ? Utils.formatDate(version.revisionDate) : '-'}</td>
                                                    <td>
                                                        <span class="badge badge-${version.isActive === true || version.isActive === 'true' ? 'success' : 'secondary'}">
                                                            ${version.isActive === true || version.isActive === 'true' ? 'نشط' : 'غير نشط'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <button onclick="ISO.editDocumentVersion('${version.id}')" class="btn-icon btn-icon-info" title="تعديل">
                                                            <i class="fas fa-edit"></i>
                                                        </button>
                                                        <button onclick="ISO.reissueDocument('${version.id}')" class="btn-icon btn-icon-warning" title="إعادة إصدار">
                                                            <i class="fas fa-redo"></i>
                                                        </button>
                                                    </td>
                                                </tr>
                                            `;
        }).join('')}
                                    </tbody>
                                </table>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        if (opts && opts.returnStatus) return { html, timedOut };
        return html;
    },

    /**
     * إعادة تحميل محتوى مركز التكويد والإصدار فقط (بدون إعادة تحميل كامل الموديول)
     */
    async reloadCodingCenter() {
        const contentArea = document.getElementById('iso-content');
        if (!contentArea) return;
        try {
            Loading.show();
            this.currentTab = 'coding-center';
            const result = await this.renderCodingCenter({ returnStatus: true });
            const content = result && typeof result === 'object' && result.html !== undefined ? result.html : result;
            contentArea.innerHTML = content;
            const timedOut = result && typeof result === 'object' && result.timedOut === true;
            if (!timedOut && typeof Notification !== 'undefined') Notification.success('تم تحديث البيانات');
        } catch (error) {
            Utils.safeError('Error reloading coding center:', error);
            if (typeof Notification !== 'undefined') Notification.error('فشل إعادة التحميل: ' + (error && error.message ? error.message : ''));
        } finally {
            Loading.hide();
        }
    },

    /**
     * تصدير بيانات مركز التكويد إلى Excel
     */
    async exportCodingCenterToExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                if (typeof Notification !== 'undefined') Notification.error('مكتبة Excel غير متاحة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
                return;
            }
            Loading.show();
            const [codesRes, versionsRes] = await Promise.all([
                Backend.fetchData('getDocumentCodes', {}).catch(() => ({ success: false, data: [] })),
                Backend.fetchData('getDocumentVersions', { documentCodeId: null }).catch(() => ({ success: false, data: [] }))
            ]);
            const documentCodes = (codesRes && codesRes.success && codesRes.data) ? codesRes.data : [];
            const documentVersions = (versionsRes && versionsRes.success && versionsRes.data) ? versionsRes.data : [];
            if (documentCodes.length === 0 && documentVersions.length === 0) {
                if (typeof Notification !== 'undefined') Notification.warning('لا توجد بيانات للتصدير');
                Loading.hide();
                return;
            }
            const wb = XLSX.utils.book_new();
            if (documentCodes.length > 0) {
                const codesHeaders = ['الكود', 'اسم المستند', 'نوع المستند', 'القسم', 'الحالة', 'الوصف', 'تاريخ الإنشاء', 'تاريخ التحديث', 'أنشئ بواسطة'];
                const codesRows = documentCodes.map(c => [
                    c.code || '',
                    c.documentName || '',
                    c.documentType || '',
                    c.department || '',
                    c.status || '',
                    c.description || '',
                    c.createdAt ? (typeof c.createdAt === 'string' ? c.createdAt : new Date(c.createdAt).toISOString()) : '',
                    c.updatedAt ? (typeof c.updatedAt === 'string' ? c.updatedAt : new Date(c.updatedAt).toISOString()) : '',
                    c.createdBy || ''
                ]);
                const wsCodes = XLSX.utils.aoa_to_sheet([codesHeaders, ...codesRows]);
                XLSX.utils.book_append_sheet(wb, wsCodes, 'أكواد المستندات');
            }
            if (documentVersions.length > 0) {
                const verHeaders = ['كود المستند', 'رقم الإصدار', 'تاريخ الإصدار', 'نشط', 'الحالة', 'ملاحظات'];
                const codeIdToCode = {};
                documentCodes.forEach(c => { codeIdToCode[c.id] = c.code; });
                const verRows = documentVersions.map(v => [
                    codeIdToCode[v.documentCodeId] || v.documentCodeId || '',
                    v.versionNumber || '',
                    v.issueDate ? (typeof v.issueDate === 'string' ? v.issueDate : new Date(v.issueDate).toISOString().slice(0, 10)) : '',
                    v.isActive === true || v.isActive === 'true' ? 'نعم' : 'لا',
                    v.status || '',
                    v.notes || ''
                ]);
                const wsVer = XLSX.utils.aoa_to_sheet([verHeaders, ...verRows]);
                XLSX.utils.book_append_sheet(wb, wsVer, 'إصدارات المستندات');
            }
            const fileName = 'مركز_التكويد_والإصدار_' + new Date().toISOString().slice(0, 10) + '.xlsx';
            XLSX.writeFile(wb, fileName);
            if (typeof Notification !== 'undefined') Notification.success('تم تصدير البيانات إلى Excel بنجاح');
        } catch (err) {
            Utils.safeError('تصدير مركز التكويد إلى Excel:', err);
            if (typeof Notification !== 'undefined') Notification.error('فشل التصدير: ' + (err.message || err));
        } finally {
            Loading.hide();
        }
    },

    /**
     * تصدير بيانات مركز التكويد إلى PDF
     */
    async exportCodingCenterToPDF() {
        try {
            Loading.show();
            const [codesRes, versionsRes] = await Promise.all([
                Backend.fetchData('getDocumentCodes', {}).catch(() => ({ success: false, data: [] })),
                Backend.fetchData('getDocumentVersions', { documentCodeId: null }).catch(() => ({ success: false, data: [] }))
            ]);
            const documentCodes = (codesRes && codesRes.success && codesRes.data) ? codesRes.data : [];
            const documentVersions = (versionsRes && versionsRes.success && versionsRes.data) ? versionsRes.data : [];
            if (documentCodes.length === 0 && documentVersions.length === 0) {
                if (typeof Notification !== 'undefined') Notification.warning('لا توجد بيانات للتصدير');
                Loading.hide();
                return;
            }
            if (typeof window.jsPDF === 'undefined') {
                if (typeof Notification !== 'undefined') Notification.error('مكتبة PDF غير متاحة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
                Loading.hide();
                return;
            }
            const { jsPDF } = window.jsPDF;
            const doc = new jsPDF('l', 'mm', 'a4');
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const exportDate = new Date().toLocaleDateString('ar-EG', { dateStyle: 'medium' });
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text('مركز التكويد والإصدار - تصدير البيانات', pageW / 2, 14, { align: 'center' });
            doc.setFont(undefined, 'normal');
            doc.setFontSize(9);
            doc.text('تاريخ التصدير: ' + exportDate, pageW / 2, 21, { align: 'center' });
            let startY = 28;
            if (documentCodes.length > 0) {
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text('أكواد المستندات', 14, startY);
                doc.setFont(undefined, 'normal');
                startY += 6;
                const codeHeaders = ['الكود', 'اسم المستند', 'نوع المستند', 'القسم', 'الحالة'];
                const codeRows = documentCodes.map(c => [
                    String(c.code || ''),
                    String(c.documentName || '').substring(0, 25),
                    String(c.documentType || ''),
                    String(c.department || ''),
                    String(c.status || '')
                ]);
                if (typeof doc.autoTable !== 'undefined') {
                    doc.autoTable({
                        head: [codeHeaders],
                        body: codeRows,
                        startY: startY,
                        styles: { fontSize: 7, cellPadding: 2 },
                        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                        margin: { left: 8, right: 8 }
                    });
                    startY = doc.lastAutoTable.finalY + 10;
                } else {
                    startY += 20;
                }
            }
            if (documentVersions.length > 0 && startY < pageH - 40) {
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text('إصدارات المستندات', 14, startY);
                doc.setFont(undefined, 'normal');
                startY += 6;
                const codeIdToCode = {};
                documentCodes.forEach(c => { codeIdToCode[c.id] = c.code; });
                const verHeaders = ['كود المستند', 'رقم الإصدار', 'تاريخ الإصدار', 'نشط', 'الحالة'];
                const verRows = documentVersions.slice(0, 30).map(v => [
                    String(codeIdToCode[v.documentCodeId] || ''),
                    String(v.versionNumber || ''),
                    String(v.issueDate || '').slice(0, 10),
                    v.isActive === true || v.isActive === 'true' ? 'نعم' : 'لا',
                    String(v.status || '')
                ]);
                if (typeof doc.autoTable !== 'undefined') {
                    doc.autoTable({
                        head: [verHeaders],
                        body: verRows,
                        startY: startY,
                        styles: { fontSize: 7, cellPadding: 2 },
                        headStyles: { fillColor: [34, 197, 94], textColor: 255 },
                        margin: { left: 8, right: 8 }
                    });
                }
            }
            doc.setFontSize(8);
            doc.setTextColor(128, 128, 128);
            doc.text('— مركز التكويد والإصدار — ' + exportDate, pageW / 2, pageH - 10, { align: 'center' });
            doc.save('مركز_التكويد_والإصدار_' + new Date().toISOString().slice(0, 10) + '.pdf');
            if (typeof Notification !== 'undefined') Notification.success('تم تصدير البيانات إلى PDF بنجاح');
        } catch (err) {
            Utils.safeError('تصدير مركز التكويد إلى PDF:', err);
            if (typeof Notification !== 'undefined') Notification.error('فشل التصدير: ' + (err.message || err));
        } finally {
            Loading.hide();
        }
    },

    /**
     * استيراد أكواد المستندات من ملف Excel أو CSV
     */
    importCodingCenterFromExcel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.style.display = 'none';
        input.onchange = async (e) => {
            const file = e.target && e.target.files && e.target.files[0];
            if (!file) return;
            const fileName = (file.name || '').toLowerCase();
            try {
                Loading.show();
                let rows = [];
                if (fileName.endsWith('.csv')) {
                    const text = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onload = () => res(r.result);
                        r.onerror = rej;
                        r.readAsText(file, 'UTF-8');
                    });
                    const lines = text.split(/\r?\n/).filter(l => l.trim());
                    const delimiter = text.indexOf('\t') >= 0 ? '\t' : (text.indexOf(';') >= 0 ? ';' : ',');
                    const headers = lines[0] ? lines[0].split(delimiter).map(h => h.trim()) : [];
                    const codeIdx = headers.findIndex(h => /كود|code/i.test(h));
                    const nameIdx = headers.findIndex(h => /اسم|name|document/i.test(h));
                    const typeIdx = headers.findIndex(h => /نوع|type/i.test(h));
                    const deptIdx = headers.findIndex(h => /قسم|department/i.test(h));
                    const statusIdx = headers.findIndex(h => /حالة|status/i.test(h));
                    const descIdx = headers.findIndex(h => /وصف|description/i.test(h));
                    for (let i = 1; i < lines.length; i++) {
                        const cells = lines[i].split(delimiter);
                        const code = (codeIdx >= 0 ? cells[codeIdx] : cells[0]) || '';
                        const documentName = (nameIdx >= 0 ? cells[nameIdx] : cells[1]) || '';
                        if (!String(code).trim()) continue;
                        rows.push({
                            code: String(code).trim(),
                            documentName: String(documentName).trim() || String(code).trim(),
                            documentType: typeIdx >= 0 ? (cells[typeIdx] || '').trim() : 'وثيقة',
                            department: deptIdx >= 0 ? (cells[deptIdx] || '').trim() : '',
                            status: statusIdx >= 0 ? (cells[statusIdx] || '').trim() : 'نشط',
                            description: descIdx >= 0 ? (cells[descIdx] || '').trim() : ''
                        });
                    }
                } else {
                    if (typeof XLSX === 'undefined') {
                        if (typeof Notification !== 'undefined') Notification.error('مكتبة Excel غير متاحة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
                        Loading.hide();
                        return;
                    }
                    const ab = await new Promise((res, rej) => {
                        const r = new FileReader();
                        r.onload = () => res(r.result);
                        r.onerror = rej;
                        r.readAsArrayBuffer(file);
                    });
                    const wb = XLSX.read(ab, { type: 'array' });
                    const firstSheet = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : null;
                    if (!firstSheet) { Loading.hide(); return; }
                    const aoa = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                    if (!aoa || aoa.length < 2) { Loading.hide(); if (Notification) Notification.warning('الملف لا يحتوي على صفوف بيانات.'); return; }
                    const headers = (aoa[0] || []).map(h => String(h).trim());
                    const codeIdx = headers.findIndex(h => /كود|code/i.test(h));
                    const nameIdx = headers.findIndex(h => /اسم|name|document/i.test(h));
                    const typeIdx = headers.findIndex(h => /نوع|type/i.test(h));
                    const deptIdx = headers.findIndex(h => /قسم|department/i.test(h));
                    const statusIdx = headers.findIndex(h => /حالة|status/i.test(h));
                    const descIdx = headers.findIndex(h => /وصف|description/i.test(h));
                    for (let i = 1; i < aoa.length; i++) {
                        const cells = aoa[i] || [];
                        const code = (codeIdx >= 0 ? cells[codeIdx] : cells[0]);
                        const documentName = (nameIdx >= 0 ? cells[nameIdx] : cells[1]);
                        const codeStr = (code != null && code !== undefined) ? String(code).trim() : '';
                        if (!codeStr) continue;
                        rows.push({
                            code: codeStr,
                            documentName: (documentName != null && documentName !== undefined) ? String(documentName).trim() : codeStr,
                            documentType: typeIdx >= 0 ? String(cells[typeIdx] || '').trim() : 'وثيقة',
                            department: deptIdx >= 0 ? String(cells[deptIdx] || '').trim() : '',
                            status: statusIdx >= 0 ? String(cells[statusIdx] || '').trim() : 'نشط',
                            description: descIdx >= 0 ? String(cells[descIdx] || '').trim() : ''
                        });
                    }
                }
                if (rows.length === 0) {
                    if (typeof Notification !== 'undefined') Notification.warning('لم يتم العثور على صفوف صالحة (يجب وجود عمود الكود).');
                    Loading.hide();
                    return;
                }
                let added = 0, failed = 0;
                for (const row of rows) {
                    try {
                        const result = await Backend.fetchData('addDocumentCode', {
                            code: row.code,
                            documentName: row.documentName,
                            documentType: row.documentType,
                            department: row.department,
                            status: row.status,
                            description: row.description
                        });
                        if (result && result.success) added++;
                        else failed++;
                    } catch (_) { failed++; }
                }
                if (typeof Notification !== 'undefined') Notification.success('تم استيراد ' + added + ' كوداً. فشل: ' + failed + ' (قد يكون بسبب تكرار الكود).');
                this.reloadCodingCenter();
            } catch (err) {
                Utils.safeError('استيراد مركز التكويد من Excel:', err);
                if (typeof Notification !== 'undefined') Notification.error('فشل الاستيراد: ' + (err.message || err));
            } finally {
                Loading.hide();
            }
            input.value = '';
        };
        document.body.appendChild(input);
        input.click();
        setTimeout(() => input.remove(), 500);
    },

    /**
     * استيراد من PDF (الجداول غير مدعومة - يظهر رسالة توجيهية)
     */
    importCodingCenterFromPDF() {
        if (typeof Notification !== 'undefined') {
            Notification.warning('استيراد البيانات المنظمة من ملف PDF غير متاح حالياً. يرجى استخدام ملف Excel أو CSV لاستيراد أكواد المستندات.');
        }
    },

    async showDocumentCodeForm(data = null) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل كود المستند' : 'إضافة كود مستند جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="document-code-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الكود *</label>
                            <input type="text" id="doc-code" required class="form-input" 
                                value="${Utils.escapeHTML(data?.code || '')}" 
                                placeholder="مثال: DOC-001, FORM-002">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">اسم المستند / الإجراء *</label>
                            <input type="text" id="doc-name" required class="form-input" 
                                value="${Utils.escapeHTML(data?.documentName || '')}" 
                                placeholder="اسم المستند">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">نوع المستند *</label>
                            <select id="doc-type" required class="form-input">
                                <option value="">اختر النوع</option>
                                <option value="وثيقة" ${data?.documentType === 'وثيقة' ? 'selected' : ''}>وثيقة</option>
                                <option value="إجراء" ${data?.documentType === 'إجراء' ? 'selected' : ''}>إجراء</option>
                                <option value="نموذج" ${data?.documentType === 'نموذج' ? 'selected' : ''}>نموذج</option>
                                <option value="تقرير" ${data?.documentType === 'تقرير' ? 'selected' : ''}>تقرير</option>
                                <option value="سجل" ${data?.documentType === 'سجل' ? 'selected' : ''}>سجل</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">القسم *</label>
                            <input type="text" id="doc-department" required class="form-input" 
                                value="${Utils.escapeHTML(data?.department || '')}" 
                                placeholder="القسم التابع له">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الحالة *</label>
                            <select id="doc-status" required class="form-input">
                                <option value="نشط" ${data?.status === 'نشط' ? 'selected' : ''}>نشط</option>
                                <option value="معطل" ${data?.status === 'معطل' ? 'selected' : ''}>معطل</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الوصف</label>
                            <textarea id="doc-description" class="form-input" rows="3" 
                                placeholder="وصف اختياري للمستند">${Utils.escapeHTML(data?.description || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-doc-code-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-doc-code-btn');
        saveBtn.addEventListener('click', () => this.handleDocumentCodeSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleDocumentCodeSubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const codeEl = document.getElementById('doc-code');
        const nameEl = document.getElementById('doc-name');
        const typeEl = document.getElementById('doc-type');
        const departmentEl = document.getElementById('doc-department');
        const statusEl = document.getElementById('doc-status');
        const descriptionEl = document.getElementById('doc-description');
        
        if (!codeEl || !nameEl || !typeEl || !departmentEl || !statusEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const code = codeEl.value.trim();
        const documentName = nameEl.value.trim();
        if (!code) {
            Notification.error('حقل الكود مطلوب.');
            return;
        }
        if (!documentName) {
            Notification.error('حقل اسم المستند / الإجراء مطلوب.');
            return;
        }

        const formData = {
            id: editId || Utils.generateId('DOC_CODE'),
            code: code,
            documentName: documentName,
            documentType: typeEl.value,
            department: departmentEl.value.trim(),
            status: statusEl.value,
            description: descriptionEl?.value.trim() || '',
            createdAt: editId ? (await this.getDocumentCodeById(editId))?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: AppState.currentUser?.name || AppState.currentUser?.email || 'System'
        };

        Loading.show();
        try {
            const action = editId ? 'updateDocumentCode' : 'addDocumentCode';
            const result = await Backend.fetchData(action, formData);

            if (result.success) {
                Notification.success(editId ? 'تم تحديث الكود بنجاح' : 'تم إضافة الكود بنجاح');
                modal.remove();
                this.load();
            } else {
                const msg = result.message || 'حدث خطأ أثناء الحفظ';
                Notification.error(result.errorCode === 'DUPLICATE_CODE' ? 'كود المستند موجود مسبقاً. يرجى اختيار كود فريد (مثل: DOC-001، FORM-002).' : msg);
            }
        } catch (error) {
            const msg = error && error.message ? String(error.message) : '';
            if (msg.indexOf('غير معترف به') !== -1 || msg.indexOf('ACTION_NOT_RECOGNIZED') !== -1) {
                Notification.error(
                    'الخادم لا يتعرّف على عملية إضافة كود المستند. ' +
                    'تأكد من: 1) تحديث ملفات Code.gs و ISO.gs و Headers.gs و Config.gs في مشروع الخادم السحابي. ' +
                    '2) نشر نسخة جديدة (Deploy → Manage deployments → Edit → New version → Deploy). ' +
                    '3) استخدام الرابط الذي ينتهي بـ /exec في الإعدادات.'
                );
            } else {
                Notification.error('حدث خطأ: ' + msg);
            }
        } finally {
            Loading.hide();
        }
    },

    async getDocumentCodeById(id) {
        try {
            const result = await Backend.fetchData('getDocumentCodes', {});
            if (result.success && result.data) {
                return result.data.find(c => c.id === id);
            }
        } catch (error) {
            Utils.safeError('Error getting document code:', error);
        }
        return null;
    },

    async editDocumentCode(id) {
        const code = await this.getDocumentCodeById(id);
        if (code) {
            this.showDocumentCodeForm(code);
        } else {
            Notification.error('الكود غير موجود');
        }
    },

    async deleteDocumentCode(id) {
        const item = await this.getDocumentCodeById(id);
        const label = item ? (item.code || item.documentName || id) : id;
        if (!confirm('هل أنت متأكد من حذف الكود "' + label + '"؟ سيتم حذف جميع الإصدارات المرتبطة به.')) {
            return;
        }

        Loading.show();
        try {
            const result = await Backend.fetchData('deleteDocumentCode', { id: id });
            if (result.success) {
                Notification.success('تم حذف الكود بنجاح');
                this.load();
            } else {
                Notification.error(result.message || 'حدث خطأ أثناء الحذف');
            }
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    async showDocumentVersionForm(data = null, documentCodeId = null) {
        // جلب قائمة الأكواد
        let codes = [];
        try {
            const result = await Backend.fetchData('getDocumentCodes', {});
            if (result.success && result.data) {
                codes = result.data;
            }
        } catch (error) {
            Utils.safeError('Error loading codes:', error);
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h2 class="modal-title">${data ? 'تعديل إصدار المستند' : 'إضافة إصدار جديد'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="document-version-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">كود المستند *</label>
                            <select id="version-code-id" required class="form-input" ${data ? 'disabled' : ''}>
                                <option value="">اختر الكود</option>
                                ${codes.map(code => `
                                    <option value="${code.id}" 
                                        ${(data?.documentCodeId === code.id || documentCodeId === code.id) ? 'selected' : ''}>
                                        ${Utils.escapeHTML(code.code || '')} - ${Utils.escapeHTML(code.documentName || '')}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">رقم الإصدار *</label>
                            <input type="text" id="version-number" required class="form-input" 
                                value="${Utils.escapeHTML(data?.versionNumber || '')}" 
                                placeholder="مثال: 1.0, 2.1">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ الإصدار *</label>
                            <input type="date" id="version-issue-date" required class="form-input" 
                                value="${data?.issueDate ? new Date(data.issueDate).toISOString().slice(0, 10) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">تاريخ التعديل</label>
                            <input type="date" id="version-revision-date" class="form-input" 
                                value="${data?.revisionDate ? new Date(data.revisionDate).toISOString().slice(0, 10) : ''}">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">الحالة</label>
                            <select id="version-status" class="form-input">
                                <option value="نشط" ${data?.status === 'نشط' ? 'selected' : ''}>نشط</option>
                                <option value="معطل" ${data?.status === 'معطل' ? 'selected' : ''}>معطل</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-2">ملاحظة الإصدار</label>
                            <textarea id="version-notes" class="form-input" rows="3" 
                                placeholder="ملاحظات حول هذا الإصدار">${Utils.escapeHTML(data?.notes || '')}</textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إلغاء</button>
                    <button type="button" id="save-version-btn" class="btn-primary">حفظ</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const saveBtn = modal.querySelector('#save-version-btn');
        saveBtn.addEventListener('click', () => this.handleDocumentVersionSubmit(data?.id, modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    },

    async handleDocumentVersionSubmit(editId = null, modal) {
        // فحص العناصر قبل الاستخدام
        const codeIdEl = document.getElementById('version-code-id');
        const versionNumberEl = document.getElementById('version-number');
        const issueDateEl = document.getElementById('version-issue-date');
        const revisionDateEl = document.getElementById('version-revision-date');
        const statusEl = document.getElementById('version-status');
        const notesEl = document.getElementById('version-notes');
        
        if (!codeIdEl || !versionNumberEl || !issueDateEl || !statusEl) {
            Notification.error('بعض الحقول المطلوبة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const codeId = codeIdEl.value;
        const code = await this.getDocumentCodeById(codeId);

        const formData = {
            id: editId || Utils.generateId('DOC_VER'),
            documentCodeId: codeId,
            documentCode: code?.code || '',
            versionNumber: versionNumberEl.value.trim(),
            issueDate: new Date(issueDateEl.value).toISOString(),
            revisionDate: revisionDateEl?.value
                ? new Date(revisionDateEl.value).toISOString()
                : null,
            status: statusEl.value,
            notes: notesEl?.value.trim() || '',
            isActive: statusEl.value === 'نشط',
            createdAt: editId ? (await this.getDocumentVersionById(editId))?.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: AppState.currentUser?.name || AppState.currentUser?.email || 'System'
        };

        Loading.show();
        try {
            const action = editId ? 'updateDocumentVersion' : 'addDocumentVersion';
            const result = await Backend.fetchData(action, formData);

            if (result.success) {
                Notification.success(editId ? 'تم تحديث الإصدار بنجاح' : 'تم إضافة الإصدار بنجاح');
                modal.remove();
                this.load();
            } else {
                Notification.error(result.message || 'حدث خطأ أثناء الحفظ');
            }
        } catch (error) {
            Notification.error('حدث خطأ: ' + error.message);
        } finally {
            Loading.hide();
        }
    },

    async getDocumentVersionById(id) {
        try {
            const result = await Backend.fetchData('getDocumentVersions', { documentCodeId: null });
            if (result.success && result.data) {
                return result.data.find(v => v.id === id);
            }
        } catch (error) {
            Utils.safeError('Error getting document version:', error);
        }
        return null;
    },

    async editDocumentVersion(id) {
        const version = await this.getDocumentVersionById(id);
        if (version) {
            this.showDocumentVersionForm(version);
        } else {
            Notification.error('الإصدار غير موجود');
        }
    },

    async viewDocumentVersions(documentCodeId) {
        try {
            Loading.show();
            const result = await Backend.fetchData('getDocumentVersions', { documentCodeId: documentCodeId });
            Loading.hide();

            if (!result.success || !result.data) {
                Notification.error('فشل جلب الإصدارات');
                return;
            }

            const versions = result.data;
            const code = await this.getDocumentCodeById(documentCodeId);

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px;">
                    <div class="modal-header">
                        <h2 class="modal-title">إصدارات: ${Utils.escapeHTML(code?.code || '')} - ${Utils.escapeHTML(code?.documentName || '')}</h2>
                        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-4">
                            <button class="btn-primary" onclick="ISO.showDocumentVersionForm(null, '${documentCodeId}'); this.closest('.modal-overlay').remove();">
                                <i class="fas fa-plus ml-2"></i>إضافة إصدار جديد
                            </button>
                        </div>
                        ${versions.length === 0 ? `
                            <div class="empty-state">
                                <p class="text-gray-500">لا توجد إصدارات لهذا المستند</p>
                            </div>
                        ` : `
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>رقم الإصدار</th>
                                        <th>تاريخ الإصدار</th>
                                        <th>تاريخ التعديل</th>
                                        <th>الحالة</th>
                                        <th>ملاحظات</th>
                                        <th>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${versions.map(v => `
                                        <tr>
                                            <td><strong>${Utils.escapeHTML(v.versionNumber || '')}</strong></td>
                                            <td>${v.issueDate ? Utils.formatDate(v.issueDate) : '-'}</td>
                                            <td>${v.revisionDate ? Utils.formatDate(v.revisionDate) : '-'}</td>
                                            <td>
                                                <span class="badge badge-${v.isActive === true || v.isActive === 'true' ? 'success' : 'secondary'}">
                                                    ${v.isActive === true || v.isActive === 'true' ? 'نشط' : 'غير نشط'}
                                                </span>
                                            </td>
                                            <td>${Utils.escapeHTML(v.notes || '-')}</td>
                                            <td>
                                                <button onclick="ISO.editDocumentVersion('${v.id}'); this.closest('.modal-overlay').remove();" 
                                                    class="btn-icon btn-icon-info" title="تعديل">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        `}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">إغلاق</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        } catch (error) {
            Loading.hide();
            Notification.error('حدث خطأ: ' + error.message);
        }
    },

    async reissueDocument(versionId) {
        const version = await this.getDocumentVersionById(versionId);
        if (!version) {
            Notification.error('الإصدار غير موجود');
            return;
        }

        if (!confirm('هل تريد إغلاق هذا الإصدار وفتح إصدار جديد؟')) {
            return;
        }

        // عرض نموذج لإصدار جديد
        this.showDocumentVersionForm(null, version.documentCodeId);
    },

    filterDocumentCodes() {
        const searchTerm = document.getElementById('document-code-search')?.value.toLowerCase() || '';
        const rows = document.querySelectorAll('#document-codes-table-body tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(searchTerm) ? '' : 'none';
        });
    },

    filterDocumentVersions() {
        const codeId = document.getElementById('version-filter-code')?.value || '';
        const rows = document.querySelectorAll('#document-versions-table-body tr');
        rows.forEach(row => {
            const rowCodeId = row.getAttribute('data-code-id') || '';
            row.style.display = !codeId || rowCodeId === codeId ? '' : 'none';
        });
    },

    // دالة لجلب الإصدار تلقائياً عند اختيار الكود
    async loadDocumentCodeVersion(formType = 'document', code = null) {
        try {
            // تحديد معرفات الحقول حسب نوع النموذج
            const codeSelectId = formType === 'document' ? 'document-code-select' :
                formType === 'procedure' ? 'procedure-code-select' :
                    'form-code-select';
            const versionInputId = formType === 'document' ? 'document-version' :
                formType === 'procedure' ? 'procedure-version' :
                    'form-version';
            const issueDateInputId = formType === 'document' ? 'document-issue-date' :
                formType === 'procedure' ? 'procedure-issue-date' :
                    'form-issue-date';
            const revisionDateInputId = formType === 'document' ? 'document-revision-date' :
                formType === 'procedure' ? 'procedure-revision-date' :
                    'form-revision-date';

            const codeSelect = document.getElementById(codeSelectId);
            const selectedCode = code || codeSelect?.value || '';

            if (!selectedCode) {
                // مسح الحقول إذا لم يتم اختيار كود
                const versionInput = document.getElementById(versionInputId);
                const issueDateInput = document.getElementById(issueDateInputId);
                const revisionDateInput = document.getElementById(revisionDateInputId);

                if (versionInput) versionInput.value = '';
                if (issueDateInput) issueDateInput.value = '';
                if (revisionDateInput) revisionDateInput.value = '';
                return;
            }

            Loading.show();

            // جلب الكود والإصدار من المركز
            const result = await Backend.fetchData('getDocumentCodeAndVersion', {
                documentCode: selectedCode
            });

            Loading.hide();

            if (result.success && result.version) {
                // ملء الحقول تلقائياً
                const versionInput = document.getElementById(versionInputId);
                const issueDateInput = document.getElementById(issueDateInputId);
                const revisionDateInput = document.getElementById(revisionDateInputId);

                if (versionInput) {
                    versionInput.value = result.version.versionNumber || '';
                }
                if (issueDateInput) {
                    issueDateInput.value = result.version.issueDate ? Utils.formatDate(result.version.issueDate) : '';
                }
                if (revisionDateInput) {
                    revisionDateInput.value = result.version.revisionDate ? Utils.formatDate(result.version.revisionDate) : '';
                }

                Notification.success('تم جلب بيانات الإصدار تلقائياً من المركز');
            } else if (result.success && result.code) {
                // الكود موجود ولكن لا يوجد إصدار نشط
                const versionInput = document.getElementById(versionInputId);
                if (versionInput) {
                    versionInput.value = 'غير محدد';
                }
                Notification.warning('الكود موجود ولكن لا يوجد إصدار نشط في المركز');
            } else {
                Notification.error('الكود غير موجود في مركز التكويد والإصدار');
            }
        } catch (error) {
            Loading.hide();
            Utils.safeError('Error loading document code version:', error);
            Notification.error('حدث خطأ أثناء جلب بيانات الإصدار: ' + error.message);
        }
    }
};

// ===== Export module to global scope =====
// تصدير الموديول إلى window فوراً لضمان توافره
(function () {
    'use strict';
    try {
        if (typeof window !== 'undefined' && typeof ISO !== 'undefined') {
            window.ISO = ISO;
            
            // إشعار عند تحميل الموديول بنجاح
            if (typeof AppState !== 'undefined' && AppState.debugMode && typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('✅ ISO module loaded and available on window.ISO');
            }
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير ISO:', error);
        // محاولة التصدير مرة أخرى حتى في حالة الخطأ
        if (typeof window !== 'undefined' && typeof ISO !== 'undefined') {
            try {
                window.ISO = ISO;
            } catch (e) {
                console.error('❌ فشل تصدير ISO:', e);
            }
        }
    }
})();