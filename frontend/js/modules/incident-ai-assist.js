/**
 * incident-ai-assist.js — practical AI assist for incident/near-miss classification drafts.
 * Requires human confirmation before apply. Uses heuristics + optional AIAssistant.
 */
const IncidentAIAssist = {
    classify(text) {
        const t = String(text || '').toLowerCase();
        let severity = 'متوسط';
        let category = 'عام';
        if (/fatality|وفاة|fatal/.test(t)) severity = 'كارثي';
        else if (/lost time|LTI|إجازة|إصابة عمل|fracture|كسر/.test(t)) severity = 'عالي';
        else if (/first aid|إسعاف|minor|بسيط/.test(t)) severity = 'منخفض';
        if (/fire|حريق|اشتعال/.test(t)) category = 'حريق';
        else if (/chemical|كيمي|spill|تسرب/.test(t)) category = 'كيميائي';
        else if (/fall|سقوط|ارتفاع/.test(t)) category = 'سقوط';
        else if (/vehicle|مروري|صادم|collision/.test(t)) category = 'مركبات';
        else if (/near.?miss|وشيك/.test(t)) category = 'وشيك';

        const actions = [
            'تأمين الموقع ومنع تكرار التعرض',
            'تحقيق الأسباب الجذرية خلال 48 ساعة',
            'إجراء تصحيحي مع تحقق فعالية قبل الإغلاق'
        ];
        return { severity, category, suggestedActions: actions, draftCapa: actions.join('؛ ') };
    },

    async suggestForForm(getTextFn, applyFn) {
        const text = typeof getTextFn === 'function' ? getTextFn() : '';
        let result = this.classify(text);
        try {
            if (typeof AIAssistant !== 'undefined' && AIAssistant.generateDefaultResponse) {
                const hint = AIAssistant.generateDefaultResponse(
                    'صنّف حادث سلامة واقترح إجراءً مختصراً: ' + String(text).slice(0, 400)
                );
                if (hint && typeof hint === 'string' && hint.length > 20) {
                    result = Object.assign({}, result, { aiNote: hint.slice(0, 600) });
                }
            }
        } catch (_e) { /* heuristics enough */ }

        const msg =
            `اقتراح التصنيف (مسودة — أكّد يدوياً):\n` +
            `الخطورة: ${result.severity}\n` +
            `الفئة: ${result.category}\n` +
            `إجراءات مقترحة:\n- ${result.suggestedActions.join('\n- ')}\n\n` +
            `هل تريد تطبيق المسودة على النموذج؟`;
        if (!confirm(msg)) return null;
        if (typeof applyFn === 'function') applyFn(result);
        return result;
    },

    attachButton(opts) {
        const { container, getText, apply } = opts || {};
        if (!container || container.querySelector('[data-hse-ai-assist]')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-secondary';
        btn.setAttribute('data-hse-ai-assist', '1');
        btn.innerHTML = '<i class="fas fa-robot ml-2"></i>اقتراح تصنيف AI';
        btn.addEventListener('click', () => this.suggestForForm(getText, apply));
        container.appendChild(btn);
    }
};

if (typeof window !== 'undefined') window.IncidentAIAssist = IncidentAIAssist;
