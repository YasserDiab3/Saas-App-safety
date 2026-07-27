/**
 * Risk Matrix Component - Compact & Professional
 * مصفوفة تقييم المخاطر - مدمجة واحترافية
 */
const RiskMatrix = {
    t(key, fallback) {
        if (window.i18n && window.i18n.t) return window.i18n.t(key, fallback);
        return fallback;
    },
    /**
     * توليد مصفوفة تقييم المخاطر
     */
    generate(containerId, options = {}) {
        const {
            selectedLikelihood = null,
            selectedConsequence = null,
            interactive = true
        } = options;

        // مستويات مدمجة
        const t = (k, fb) => this.t(k, fb);
        const likelihood = [
            { value: 5, label: t('module.riskmatrix.almost_certain', 'شبه مؤكد') },
            { value: 4, label: t('module.riskmatrix.very_likely', 'محتمل جداً') },
            { value: 3, label: t('module.riskmatrix.likely', 'محتمل') },
            { value: 2, label: t('module.riskmatrix.unlikely', 'غير محتمل') },
            { value: 1, label: t('module.riskmatrix.rare', 'نادر') }
        ];

        const consequence = [
            { value: 1, label: t('module.riskmatrix.negligible', 'ضئيلة') },
            { value: 2, label: t('module.riskmatrix.minor', 'بسيطة') },
            { value: 3, label: t('module.riskmatrix.moderate', 'متوسطة') },
            { value: 4, label: t('module.riskmatrix.major', 'كبيرة') },
            { value: 5, label: t('module.riskmatrix.catastrophic', 'كارثية') }
        ];

        // حساب مستوى الخطر
        const getRiskLevel = (l, c) => {
            const score = l * c;
            if (score >= 15) return { level: 'critical', label: t('module.riskmatrix.critical', 'حرج'), color: '#fff', bg: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)', border: '#991b1b' };
            if (score >= 10) return { level: 'high', label: t('module.riskmatrix.high', 'عالي'), color: '#fff', bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)', border: '#ea580c' };
            if (score >= 5) return { level: 'medium', label: t('module.riskmatrix.medium', 'متوسط'), color: '#000', bg: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', border: '#f59e0b' };
            return { level: 'low', label: t('module.riskmatrix.low', 'منخفض'), color: '#fff', bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: '#059669' };
        };

        // HTML مدمج واحترافي
        return `
            <style>
                .risk-matrix-compact {
                    max-width: 450px;
                    margin: 0 auto;
                    font-family: 'Cairo', 'Segoe UI', sans-serif;
                }
                .risk-matrix-compact table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 3px;
                    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                    padding: 8px;
                    border-radius: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                }
                .risk-matrix-compact th {
                    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                    color: white;
                    padding: 6px 3px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-align: center;
                    border-radius: 6px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .risk-matrix-compact th.corner {
                    width: 70px;
                    font-size: 0.65rem;
                }
                .risk-matrix-compact td.label {
                    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                    color: white;
                    padding: 6px 3px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-align: center;
                    border-radius: 6px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .risk-matrix-compact .risk-cell {
                    padding: 8px 4px;
                    text-align: center;
                    cursor: pointer;
                    border-radius: 6px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .risk-matrix-compact .risk-cell:hover {
                    transform: scale(1.12) translateY(-2px);
                    z-index: 10;
                    box-shadow: 0 6px 16px rgba(0,0,0,0.2);
                }
                .risk-matrix-compact .risk-cell.selected {
                    transform: scale(1.15) translateY(-3px);
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5), 0 8px 20px rgba(0,0,0,0.25);
                    z-index: 20;
                }
                .risk-matrix-compact .risk-cell .score {
                    font-size: 1.2rem;
                    font-weight: 900;
                    line-height: 1;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                }
                .risk-matrix-compact .risk-cell .level {
                    font-size: 0.6rem;
                    font-weight: 700;
                    margin-top: 2px;
                    opacity: 0.95;
                }
                .risk-legend {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px;
                    margin-top: 12px;
                    font-size: 0.7rem;
                }
                .risk-legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 8px;
                    background: white;
                    border-radius: 6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .risk-legend-color {
                    width: 18px;
                    height: 18px;
                    border-radius: 4px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
            </style>
            
            <div class="risk-matrix-compact">
                <table>
                    <thead>
                        <tr>
                            <th class="corner">
                                <div style="font-size: 0.65rem;">${t('module.riskmatrix.likelihood', 'الاحتمالية')}</div>
                                <div style="font-size: 0.55rem; opacity: 0.8;">↓</div>
                            </th>
                            ${consequence.map(c => `
                                <th>
                                    <div>${c.label}</div>
                                    <div style="font-size: 0.85rem; margin-top: 1px;">${c.value}</div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${likelihood.map(l => `
                            <tr>
                                <td class="label">
                                    <div>${l.label}</div>
                                    <div style="font-size: 0.85rem; margin-top: 1px;">${l.value}</div>
                                </td>
                                ${consequence.map(c => {
            const risk = getRiskLevel(l.value, c.value);
            const score = l.value * c.value;
            const isSelected = selectedLikelihood === l.value && selectedConsequence === c.value;

            return `
                                        <td class="risk-cell ${isSelected ? 'selected' : ''}"
                                            data-likelihood="${l.value}"
                                            data-likelihood-label="${l.label}"
                                            data-consequence="${c.value}"
                                            data-consequence-label="${c.label}"
                                            data-score="${score}"
                                            data-level="${risk.level}"
                                            data-level-label="${risk.label}"
                                            style="background: ${risk.bg}; color: ${risk.color};"
                                            onclick="RiskMatrix.selectCell(this, '${containerId}')">
                                            <div class="score">${score}</div>
                                            <div class="level">${risk.label}</div>
                                        </td>
                                    `;
        }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="risk-legend">
                    <div class="risk-legend-item">
                        <div class="risk-legend-color" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);"></div>
                        <span style="color: #059669; font-weight: 700;">${t('module.riskmatrix.low_range', 'منخفض (1-4)')}</span>
                    </div>
                    <div class="risk-legend-item">
                        <div class="risk-legend-color" style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);"></div>
                        <span style="color: #d97706; font-weight: 700;">${t('module.riskmatrix.medium_range', 'متوسط (5-9)')}</span>
                    </div>
                    <div class="risk-legend-item">
                        <div class="risk-legend-color" style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);"></div>
                        <span style="color: #ea580c; font-weight: 700;">${t('module.riskmatrix.high_range', 'عالي (10-14)')}</span>
                    </div>
                    <div class="risk-legend-item">
                        <div class="risk-legend-color" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);"></div>
                        <span style="color: #dc2626; font-weight: 700;">${t('module.riskmatrix.critical_range', 'حرج (15-25)')}</span>
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * معالجة اختيار خلية - مع تحديث تلقائي للملاحظات
     */
    selectCell(cell, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // إزالة التحديد السابق
        container.querySelectorAll('.risk-cell').forEach(c => {
            c.classList.remove('selected');
        });

        // تحديد الخلية الحالية
        cell.classList.add('selected');

        // استخراج البيانات
        const likelihood = parseInt(cell.getAttribute('data-likelihood'));
        const likelihoodLabel = cell.getAttribute('data-likelihood-label');
        const consequence = parseInt(cell.getAttribute('data-consequence'));
        const consequenceLabel = cell.getAttribute('data-consequence-label');
        const score = parseInt(cell.getAttribute('data-score'));
        const level = cell.getAttribute('data-level');
        const levelLabel = cell.getAttribute('data-level-label');

        // التعرف على نوع النموذج (PTW أو Investigation)
        const isInvestigationForm = containerId === 'investigation-risk-matrix';
        const isPTWForm = containerId === 'ptw-risk-matrix';

        if (isPTWForm) {
            // معالجة نموذج تصريح العمل (PTW)
            const likelihoodInput = document.getElementById('ptw-risk-likelihood');
            const consequenceInput = document.getElementById('ptw-risk-consequence');

            if (likelihoodInput) likelihoodInput.value = likelihood;
            if (consequenceInput) consequenceInput.value = consequence;

            // تحديث حقل الملاحظات تلقائياً
            const notesTextarea = document.getElementById('ptw-risk-notes');
            if (notesTextarea) {
                const riskInfo = `${this.t('module.riskmatrix.ptw_risk_header', '📊 تقييم المخاطر المحدد:')}
━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.t('module.riskmatrix.likelihood_label', '• الاحتمالية')}: ${likelihoodLabel} (${likelihood})
${this.t('module.riskmatrix.consequence_label', '• العواقب')}: ${consequenceLabel} (${consequence})
${this.t('module.riskmatrix.score_label', '• النتيجة')}: ${score}
${this.t('module.riskmatrix.risk_level_label', '• مستوى الخطر')}: ${levelLabel}
━━━━━━━━━━━━━━━━━━━━━━━━━━

${this.t('module.riskmatrix.additional_notes', 'ملاحظات إضافية')}:
`;

                // إذا كان الحقل فارغاً أو يحتوي على تقييم سابق، استبدله
                const currentValue = notesTextarea.value.trim();
                if (!currentValue || currentValue.startsWith('📊 تقييم المخاطر المحدد:')) {
                    notesTextarea.value = riskInfo;
                } else {
                    // إضافة التقييم في البداية
                    notesTextarea.value = riskInfo + '\n' + currentValue;
                }

                // تمييز الحقل مؤقتاً
                notesTextarea.style.background = '#fef3c7';
                notesTextarea.style.borderColor = '#f59e0b';
                setTimeout(() => {
                    notesTextarea.style.background = '';
                    notesTextarea.style.borderColor = '';
                }, 1000);
            }
        } else if (isInvestigationForm) {
            // معالجة نموذج التحقيق في الحادث (Investigation)
            
            // تحديث الحقول المخفية
            const probabilityInput = document.getElementById('investigation-risk-probability');
            const severityInput = document.getElementById('investigation-risk-severity');
            const levelInput = document.getElementById('investigation-risk-level');

            if (probabilityInput) probabilityInput.value = likelihood;
            if (severityInput) severityInput.value = consequence;
            if (levelInput) levelInput.value = score;

            // تحديث حقل "نتيجة التقييم" تلقائياً
            const resultInput = document.getElementById('investigation-risk-result');
            if (resultInput) {
                // تحديد القيمة بناءً على مستوى الخطر
                let resultValue = levelLabel; // استخدام النص العربي مباشرة
                
                // تأثير بصري للتحديث
                resultInput.value = resultValue;
                resultInput.style.background = this.getRiskBackgroundColor(level);
                resultInput.style.color = (level === 'low' || level === 'medium') ? '#000' : '#fff';
                resultInput.style.fontWeight = '700';
                resultInput.style.textAlign = 'center';
                
                // تمييز الحقل مؤقتاً
                setTimeout(() => {
                    resultInput.style.background = '#f0fdfa';
                    resultInput.style.color = '#000';
                }, 2000);
            }

            // تحديث حقل "شرح الخطر" تلقائياً
            const explanationTextarea = document.getElementById('investigation-risk-explanation');
            if (explanationTextarea) {
                const riskExplanation = `${this.t('module.riskmatrix.investigation_header', '📊 نتائج تقييم المخاطر للحادث:')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${this.t('module.riskmatrix.likelihood_detail', '• الاحتمالية (Likelihood)')}: ${likelihoodLabel} - ${this.t('module.riskmatrix.level', 'المستوى')} ${likelihood}/5
${this.t('module.riskmatrix.consequence_detail', '• الشدة/العواقب (Consequence)')}: ${consequenceLabel} - ${this.t('module.riskmatrix.level', 'المستوى')} ${consequence}/5
${this.t('module.riskmatrix.total_score', '• الدرجة الكلية للمخاطر')}: ${score} ${this.t('module.riskmatrix.points', 'نقطة')}
${this.t('module.riskmatrix.determined_level', '• مستوى الخطر المحدد')}: ${levelLabel}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${this.t('module.riskmatrix.explanation_recommendations', 'التفسير والتوصيات')}:
${this.getRiskExplanationText(score, levelLabel, likelihoodLabel, consequenceLabel)}

${this.t('module.riskmatrix.investigator_notes', 'ملاحظات إضافية من المحقق')}:
`;

                // إذا كان الحقل فارغاً أو يحتوي على تقييم سابق، استبدله
                const currentValue = explanationTextarea.value.trim();
                if (!currentValue || currentValue.startsWith('📊 نتائج تقييم المخاطر')) {
                    explanationTextarea.value = riskExplanation;
                } else {
                    // الاحتفاظ بالملاحظات الإضافية
                    explanationTextarea.value = riskExplanation;
                }

                // تمييز الحقل مؤقتاً
                explanationTextarea.style.background = '#ecfdf5';
                explanationTextarea.style.borderColor = '#10b981';
                explanationTextarea.style.borderWidth = '2px';
                setTimeout(() => {
                    explanationTextarea.style.background = '#f0fdfa';
                    explanationTextarea.style.borderColor = '#14b8a6';
                    explanationTextarea.style.borderWidth = '1px';
                }, 2000);
            }
        }

        // إطلاق حدث مخصص
        const event = new CustomEvent('riskMatrixSelect', {
            detail: {
                likelihood,
                likelihoodLabel,
                consequence,
                consequenceLabel,
                score,
                level,
                levelLabel,
                containerId
            },
            bubbles: true
        });
        container.dispatchEvent(event);

        // إشعار بصري
        if (typeof Notification !== 'undefined' && Notification.success) {
            Notification.success(`${this.t('module.riskmatrix.selected_risk', 'تم تحديد مستوى الخطر')}: ${levelLabel} (${score})`);
        }

        // Log للتطوير
        if (typeof Utils !== 'undefined' && Utils.safeLog) {
            Utils.safeLog('✅ Risk Matrix Selection:', {
                container: containerId,
                likelihood: `${likelihoodLabel} (${likelihood})`,
                consequence: `${consequenceLabel} (${consequence})`,
                score,
                level: `${levelLabel} (${level})`
            });
        }
    },

    /**
     * الحصول على لون الخلفية بناءً على مستوى الخطر
     */
    getRiskBackgroundColor(level) {
        const colors = {
            'low': 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            'medium': 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            'high': 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            'critical': 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'
        };
        return colors[level] || colors['low'];
    },

    /**
     * الحصول على نص الشرح بناءً على مستوى الخطر
     */
    getRiskExplanationText(score, levelLabel, likelihoodLabel, consequenceLabel) {
        const t = (k, fb) => this.t(k, fb);
        const explanations = {
            'منخفض': t('module.riskmatrix.explanation_low', `هذا الحادث يُصنف ضمن المخاطر المنخفضة (${score} نقاط)، حيث أن احتمالية حدوثه ${likelihoodLabel} والعواقب المحتملة ${consequenceLabel}. يُنصح بمراقبة الوضع واتخاذ إجراءات وقائية بسيطة لتجنب تكرار الحادث.`),
            
            'متوسط': t('module.riskmatrix.explanation_medium', `هذا الحادث يُصنف ضمن المخاطر المتوسطة (${score} نقاط)، مما يعني أن احتمالية حدوثه ${likelihoodLabel} والعواقب المحتملة ${consequenceLabel}. يتطلب الأمر اتخاذ إجراءات تصحيحية واضحة ومتابعة دورية لضمان عدم تكرار الحادث أو تطوره إلى خطر أعلى.`),
            
            'عالي': t('module.riskmatrix.explanation_high', `هذا الحادث يُصنف ضمن المخاطر العالية (${score} نقاط)، حيث أن احتمالية حدوثه ${likelihoodLabel} والعواقب المحتملة ${consequenceLabel}. يتطلب اتخاذ إجراءات عاجلة وشاملة، مع ضرورة تخصيص موارد كافية ومتابعة مكثفة من الإدارة العليا لمنع تكرار الحادث.`),
            
            'حرج': t('module.riskmatrix.explanation_critical', `هذا الحادث يُصنف ضمن المخاطر الحرجة (${score} نقاط)، وهو أعلى مستوى خطورة! احتمالية حدوثه ${likelihoodLabel} والعواقب ${consequenceLabel}. يتطلب تدخلاً فورياً وإيقاف أي أنشطة مشابهة حتى يتم معالجة جميع الأسباب الجذرية. يجب رفع التقرير للإدارة العليا فوراً مع خطة عمل شاملة.`)
        };
        
        return explanations[levelLabel] || t('module.riskmatrix.review_prompt', 'يرجى مراجعة تقييم المخاطر واتخاذ الإجراءات المناسبة.');
    }
};

// ===== Export module to global scope =====
// تصدير الموديول إلى window فوراً لضمان توافره
(function () {
    'use strict';
    try {
        if (typeof window !== 'undefined' && typeof RiskMatrix !== 'undefined') {
            window.RiskMatrix = RiskMatrix;
            
            // إشعار عند تحميل الموديول بنجاح
            if (typeof AppState !== 'undefined' && AppState.debugMode && typeof Utils !== 'undefined' && Utils.safeLog) {
                Utils.safeLog('✅ RiskMatrix module loaded and available on window.RiskMatrix');
            }
        }
    } catch (error) {
        console.error('❌ خطأ في تصدير RiskMatrix:', error);
        // محاولة التصدير مرة أخرى حتى في حالة الخطأ
        if (typeof window !== 'undefined' && typeof RiskMatrix !== 'undefined') {
            try {
                window.RiskMatrix = RiskMatrix;
            } catch (e) {
                console.error('❌ فشل تصدير RiskMatrix:', e);
            }
        }
    }
})();
