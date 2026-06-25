/**
 * Help — مركز المساعدة
 */
const Help = {
    cache: { sections: null, loadedAt: 0 },
    selectedId: null,
    searchQuery: '',

    t(key, fallback) {
        if (typeof AppI18n !== 'undefined' && typeof AppI18n.t === 'function') {
            return AppI18n.t(key, fallback);
        }
        if (typeof I18n !== 'undefined' && typeof I18n.t === 'function') {
            return I18n.t(key, fallback);
        }
        return fallback || key;
    },

    getLang() {
        if (typeof AppI18n !== 'undefined' && typeof AppI18n.getLang === 'function') {
            return AppI18n.getLang();
        }
        if (typeof I18n !== 'undefined' && typeof I18n.getCurrentLanguage === 'function') {
            return I18n.getCurrentLanguage();
        }
        return document.documentElement.lang === 'en' ? 'en' : 'ar';
    },

    isEn() {
        return this.getLang() === 'en';
    },

    sectionTitle(s) {
        return this.isEn() ? (s.titleEn || s.titleAr || '') : (s.titleAr || s.titleEn || '');
    },

    sectionBody(s) {
        return this.isEn() ? (s.bodyEn || s.bodyAr || '') : (s.bodyAr || s.bodyEn || '');
    },

    sanitizeHtml(html) {
        const raw = String(html || '');
        if (!raw.trim()) return '';
        const allowed = new Set(['P', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'H3', 'H4', 'BR', 'SPAN']);
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        const walk = (node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (!allowed.has(node.tagName)) {
                    const parent = node.parentNode;
                    while (node.firstChild) parent.insertBefore(node.firstChild, node);
                    parent.removeChild(node);
                    return;
                }
                [...node.attributes].forEach((attr) => node.removeAttribute(attr.name));
            }
            [...node.childNodes].forEach(walk);
        };
        [...doc.body.childNodes].forEach(walk);
        return doc.body.innerHTML;
    },

    canViewSection(section) {
        if (!section || section.active === false) return false;
        const key = String(section.moduleKey || '').trim();
        if (!key) return true;
        if (key === 'help' || key === 'profile' || key === 'dashboard') return true;
        if (typeof Permissions !== 'undefined' && typeof Permissions.hasAccess === 'function') {
            if (!Permissions.hasAccess(key)) return false;
        }
        if (typeof window.SaaSGating !== 'undefined' && typeof window.SaaSGating.isModuleAllowed === 'function') {
            if (!window.SaaSGating.isModuleAllowed(key)) return false;
        }
        return true;
    },

    getDefaultSections() {
        if (typeof HelpDefaultContent !== 'undefined' && typeof HelpDefaultContent.getDefaultHelpSections === 'function') {
            return HelpDefaultContent.getDefaultHelpSections();
        }
        return [];
    },

    normalizeSections(data) {
        const sections = Array.isArray(data?.sections) ? data.sections : [];
        if (sections.length > 0) return sections.slice();
        return this.getDefaultSections();
    },

    async fetchHelpData(force) {
        if (!force && this.cache.sections && (Date.now() - this.cache.loadedAt) < 60000) {
            return this.cache.sections;
        }
        let sections = [];
        try {
            if (typeof Backend !== 'undefined' && typeof Backend.sendToAppsScript === 'function') {
                const res = await Backend.sendToAppsScript('getHelpCenter', {});
                if (res && res.success !== false) {
                    const data = res.data || res;
                    sections = this.normalizeSections(data);
                }
            }
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeWarn) Utils.safeWarn('Help fetch failed:', e);
        }
        if (!sections.length) sections = this.getDefaultSections();
        this.cache.sections = sections;
        this.cache.loadedAt = Date.now();
        return sections;
    },

    invalidateCache() {
        this.cache.sections = null;
        this.cache.loadedAt = 0;
    },

    getCategoryLabel(cat) {
        const map = {
            'getting-started': this.t('module.help.catGettingStarted', 'البدء السريع'),
            'faq': this.t('module.help.catFaq', 'أسئلة شائعة'),
            'modules': this.t('module.help.catModules', 'المديولات'),
            'admin': this.t('module.help.catAdmin', 'الإدارة')
        };
        return map[cat] || this.t('module.help.catOther', 'عام');
    },

    splitFaqAndArticles(sections) {
        const faq = [];
        const articles = [];
        sections.forEach((s) => {
            if (String(s.category || '') === 'faq') faq.push(s);
            else articles.push(s);
        });
        return { faq, articles };
    },

    renderFaqAccordion(faqItems) {
        if (!faqItems.length) {
            return '';
        }
        return `
            <section class="help-faq" aria-labelledby="help-faq-heading">
                <div class="help-faq__header">
                    <h2 id="help-faq-heading" class="help-faq__title">
                        <i class="fas fa-comments ml-2" aria-hidden="true"></i>
                        ${Utils.escapeHTML(this.t('module.help.faqTitle', 'أسئلة شائعة'))}
                    </h2>
                    <p class="help-faq__hint">${Utils.escapeHTML(this.t('module.help.faqHint', 'إجابات سريعة على الأسئلة الأكثر تكراراً'))}</p>
                </div>
                <div class="help-faq__list">
                    ${faqItems.map((s) => {
                        const q = Utils.escapeHTML(this.sectionTitle(s));
                        const a = this.sanitizeHtml(this.sectionBody(s));
                        const open = s.id === this.selectedId ? ' open' : '';
                        return `
                            <details class="help-faq__item" data-help-id="${Utils.escapeHTML(s.id)}"${open}>
                                <summary class="help-faq__question">
                                    <i class="fas fa-circle-question help-faq__q-icon" aria-hidden="true"></i>
                                    <span>${q}</span>
                                    <i class="fas fa-chevron-down help-faq__chevron" aria-hidden="true"></i>
                                </summary>
                                <div class="help-faq__answer">${a}</div>
                            </details>`;
                    }).join('')}
                </div>
            </section>`;
    },

    filterSections(sections) {
        const q = String(this.searchQuery || '').trim().toLowerCase();
        return sections
            .filter((s) => this.canViewSection(s))
            .filter((s) => {
                if (!q) return true;
                const blob = [
                    s.id, s.moduleKey,
                    s.titleAr, s.titleEn,
                    s.bodyAr, s.bodyEn
                ].join(' ').toLowerCase();
                return blob.includes(q);
            })
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    },

    groupByCategory(sections) {
        const groups = {};
        sections.forEach((s) => {
            const cat = s.category || 'modules';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(s);
        });
        const order = ['getting-started', 'faq', 'modules', 'admin'];
        return order.filter((c) => groups[c]?.length).map((c) => ({ category: c, items: groups[c] }));
    },

    renderArticle(section) {
        if (!section) {
            return `<div class="help-article help-article--empty"><p>${Utils.escapeHTML(this.t('module.help.selectArticle', 'اختر موضوعاً من الفهرس'))}</p></div>`;
        }
        const title = Utils.escapeHTML(this.sectionTitle(section));
        const body = this.sanitizeHtml(this.sectionBody(section));
        const icon = Utils.escapeHTML(section.icon || 'fa-circle-info');
        return `
            <article class="help-article">
                <header class="help-article__header">
                    <i class="fas ${icon} help-article__icon" aria-hidden="true"></i>
                    <h3 class="help-article__title">${title}</h3>
                </header>
                <div class="help-article__body">${body}</div>
            </article>`;
    },

    renderToc(groups) {
        if (!groups.length) {
            return `<p class="help-toc__empty">${Utils.escapeHTML(this.t('module.help.noResults', 'لا توجد نتائج'))}</p>`;
        }
        return groups.map((g) => `
            <div class="help-toc__group">
                <h4 class="help-toc__group-title">${Utils.escapeHTML(this.getCategoryLabel(g.category))}</h4>
                <ul class="help-toc__list">
                    ${g.items.map((s) => {
                        const active = s.id === this.selectedId ? ' help-toc__link--active' : '';
                        const icon = Utils.escapeHTML(s.icon || 'fa-file-lines');
                        return `<li><button type="button" class="help-toc__link${active}" data-help-id="${Utils.escapeHTML(s.id)}"><i class="fas ${icon} ml-2" aria-hidden="true"></i>${Utils.escapeHTML(this.sectionTitle(s))}</button></li>`;
                    }).join('')}
                </ul>
            </div>`).join('');
    },

    bindEvents(sectionEl) {
        const search = sectionEl.querySelector('#help-search-input');
        if (search) {
            search.addEventListener('input', () => {
                this.searchQuery = search.value;
                this.renderContent(sectionEl);
            });
        }
        sectionEl.querySelectorAll('.help-toc__link').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.selectedId = btn.getAttribute('data-help-id');
                this.renderContent(sectionEl);
            });
        });
        sectionEl.querySelectorAll('.help-faq__item').forEach((item) => {
            item.addEventListener('toggle', () => {
                if (item.open) {
                    this.selectedId = item.getAttribute('data-help-id');
                    sectionEl.querySelectorAll('.help-faq__item').forEach((other) => {
                        if (other !== item) other.open = false;
                    });
                }
            });
        });
    },

    renderContent(sectionEl) {
        const sections = this.cache.sections || [];
        const filtered = this.filterSections(sections);
        const { faq, articles } = this.splitFaqAndArticles(filtered);
        if (!this.selectedId && articles.length) {
            this.selectedId = articles[0].id;
        } else if (!this.selectedId && faq.length) {
            this.selectedId = faq[0].id;
        } else if (this.selectedId && !filtered.find((s) => s.id === this.selectedId)) {
            this.selectedId = articles[0]?.id || faq[0]?.id || null;
        }
        const groups = this.groupByCategory(articles);
        const current = articles.find((s) => s.id === this.selectedId) || null;
        const faqPanel = sectionEl.querySelector('#help-faq-panel');
        const toc = sectionEl.querySelector('#help-toc');
        const article = sectionEl.querySelector('#help-article-panel');
        const count = sectionEl.querySelector('#help-result-count');
        if (faqPanel) {
            faqPanel.innerHTML = this.renderFaqAccordion(faq);
            faqPanel.hidden = !faq.length;
        }
        if (toc) toc.innerHTML = this.renderToc(groups);
        if (article) {
            article.innerHTML = articles.length
                ? this.renderArticle(current)
                : `<div class="help-article help-article--empty"><p>${Utils.escapeHTML(this.t('module.help.faqEmpty', 'لا توجد مقالات — راجع الأسئلة الشائعة أعلاه'))}</p></div>`;
        }
        if (count) {
            count.textContent = this.searchQuery
                ? `${filtered.length} ${this.t('module.help.results', 'نتيجة')}`
                : `${filtered.length} ${this.t('module.help.topics', 'موضوع')}`;
        }
        this.bindEvents(sectionEl);
    },

    async load(force) {
        const sectionEl = document.getElementById('help-section');
        if (!sectionEl) return;

        sectionEl.innerHTML = `
            <div class="section-header">
                <h1 class="section-title"><i class="fas fa-circle-question ml-3"></i>${Utils.escapeHTML(this.t('module.help.title', 'مركز المساعدة'))}</h1>
                <p class="section-subtitle">${Utils.escapeHTML(this.t('module.help.subtitle', 'دليل شامل لاستخدام النظام — ابحث أو اختر موضوعاً من الفهرس'))}</p>
            </div>
            <div class="content-card help-center-card mt-6">
                <div class="help-search-bar">
                    <i class="fas fa-search help-search-bar__icon" aria-hidden="true"></i>
                    <input type="search" id="help-search-input" class="form-input help-search-bar__input"
                        placeholder="${Utils.escapeHTML(this.t('module.help.searchPlaceholder', 'ابحث في المساعدة...'))}"
                        value="${Utils.escapeHTML(this.searchQuery)}" autocomplete="off">
                    <span id="help-result-count" class="help-search-bar__count"></span>
                </div>
                <div id="help-faq-panel" class="help-faq-panel" hidden></div>
                <div class="help-center-layout">
                    <aside class="help-toc" id="help-toc" aria-label="${Utils.escapeHTML(this.t('module.help.toc', 'فهرس المساعدة'))}">
                        <p class="text-sm text-gray-500">${Utils.escapeHTML(this.t('module.common.loading', 'جاري التحميل...'))}</p>
                    </aside>
                    <div id="help-article-panel" class="help-article-panel"></div>
                </div>
            </div>`;

        try {
            if (typeof Loading !== 'undefined' && Loading.show) Loading.show();
            await this.fetchHelpData(!!force);
            this.renderContent(sectionEl);
        } catch (e) {
            if (typeof Utils !== 'undefined' && Utils.safeError) Utils.safeError('Help.load error:', e);
            Notification?.error?.(this.t('module.help.loadError', 'تعذر تحميل مركز المساعدة'));
        } finally {
            if (typeof Loading !== 'undefined' && Loading.hide) Loading.hide();
        }
    }
};

if (typeof window !== 'undefined') {
    window.Help = Help;
}
