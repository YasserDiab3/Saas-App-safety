/**
 * Enhanced Loading Screen — بطاقة تحميل موحّدة (#loading-overlay)
 */
const EnhancedLoader = {
    loadingState: {
        total: 100,
        loaded: 0,
        currentStep: '',
        startTime: null,
        errors: []
    },

    elements: {},

    _bound: false,

    init() {
        if (this._bound) return;
        this.elements.overlay = document.getElementById('loading-overlay');
        if (!this.elements.overlay) return;

        this.elements.card = this.elements.overlay.querySelector('.loading-card');
        this.elements.progressBar = document.getElementById('loading-progress-bar');
        this.elements.progressText = document.getElementById('loading-progress-text');
        this.elements.statusText = document.getElementById('loading-status-text');
        this.elements.timeText = document.getElementById('loading-time-text');
        this.elements.currentStepText = document.getElementById('loading-current-step');
        this.elements.errorContainer = document.getElementById('loading-error-container');
        this.elements.errorList = document.getElementById('loading-error-list');
        this.elements.spinnerIcon = document.getElementById('loading-spinner-icon');
        this.elements.progressArc = document.getElementById('loading-orbit-progress');
        this.elements.successIcon = document.getElementById('loading-success-icon');

        this.loadingState.total = 100;
        this.loadingState.startTime = Date.now();
        this._bound = true;
    },

    _pct() {
        const total = Math.max(1, Number(this.loadingState.total) || 100);
        const loaded = Math.max(0, Math.min(total, Number(this.loadingState.loaded) || 0));
        return Math.round((loaded / total) * 100);
    },

    _orbitCircumference: 2 * Math.PI * 36,

    _updateOrbitArc(pct) {
        const arc = this.elements.progressArc;
        if (!arc) return;
        const c = this._orbitCircumference;
        arc.style.strokeDasharray = `${c}`;
        arc.style.strokeDashoffset = `${c * (1 - pct / 100)}`;
    },

    setMode(mode) {
        const card = this.elements.card;
        if (!card) return;
        const isSuccess = mode === 'success';
        card.classList.toggle('loading-card--success', isSuccess);
        if (this.elements.spinnerIcon) {
            this.elements.spinnerIcon.hidden = isSuccess;
        }
        if (this.elements.successIcon) {
            this.elements.successIcon.hidden = !isSuccess;
        }
    },

    show(totalSteps = 100) {
        this.init();
        this.loadingState.total = Math.max(1, totalSteps || 100);
        this.loadingState.loaded = 0;
        this.loadingState.startTime = Date.now();
        this.loadingState.errors = [];
        this.setMode('loading');
        this.updateProgress(0);
    },

    hide() {
        this.init();
        const overlay = this.elements.overlay;
        if (overlay) {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            overlay.setAttribute('aria-hidden', 'true');
        }
        this.setMode('loading');
        this.loadingState.loaded = 0;
        if (this.elements.currentStepText) {
            this.elements.currentStepText.textContent = '';
        }
    },

    updateProgress(step = null, message = null) {
        this.init();
        if (step !== null && !Number.isNaN(Number(step))) {
            const total = Math.max(1, Number(this.loadingState.total) || 100);
            this.loadingState.loaded = Math.max(0, Math.min(total, Number(step)));
        }

        if (message !== null && message !== undefined) {
            this.loadingState.currentStep = String(message);
        }

        const pct = this._pct();

        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${pct}%`;
        }
        this._updateOrbitArc(pct);
        if (this.elements.progressText) {
            this.elements.progressText.textContent = `${pct}%`;
        }
        if (this.elements.timeText && this.loadingState.startTime) {
            const elapsed = Math.round((Date.now() - this.loadingState.startTime) / 1000);
            this.elements.timeText.textContent = elapsed > 0 ? `${elapsed} ث` : '';
        }
        if (this.elements.currentStepText) {
            const stepMsg = this.loadingState.currentStep;
            if (stepMsg && pct < 100) {
                this.elements.currentStepText.textContent = stepMsg;
            } else if (pct >= 100) {
                this.elements.currentStepText.textContent = '';
            }
        }
    },

    setStatus(message) {
        this.init();
        if (this.elements.statusText && message) {
            this.elements.statusText.textContent = message;
        }
    },

    increment(amount = 1, message = null) {
        this.loadingState.loaded = Math.min(
            (Number(this.loadingState.loaded) || 0) + amount,
            Math.max(1, Number(this.loadingState.total) || 100)
        );
        if (message) this.loadingState.currentStep = message;
        this.updateProgress();
    },

    addError(error) {
        this.loadingState.errors.push(error);
        if (this.elements.errorContainer && this.elements.errorList) {
            this.elements.errorContainer.hidden = false;
            const li = document.createElement('li');
            li.textContent = error;
            this.elements.errorList.appendChild(li);
        }
    },

    complete(message = 'تم التحميل بنجاح!') {
        this.init();
        this.loadingState.loaded = Math.max(1, Number(this.loadingState.total) || 100);
        this.setStatus(message);
        this.setMode('success');
        this.updateProgress(this.loadingState.loaded);
        setTimeout(() => this.hide(), 900);
    },

    fail(message = 'فشل التحميل!') {
        this.init();
        this.setStatus(message);
        this.setMode('loading');
    },

    reset() {
        this.loadingState = {
            total: 100,
            loaded: 0,
            currentStep: '',
            startTime: Date.now(),
            errors: []
        };
        if (this.elements.errorContainer) {
            this.elements.errorContainer.hidden = true;
        }
        if (this.elements.errorList) {
            this.elements.errorList.innerHTML = '';
        }
        this.setMode('loading');
        this.updateProgress(0);
    },

    getStats() {
        const total = Math.max(1, Number(this.loadingState.total) || 100);
        const elapsed = this.loadingState.startTime
            ? (Date.now() - this.loadingState.startTime) / 1000
            : 0;
        return {
            percentage: this._pct(),
            loaded: this.loadingState.loaded,
            total,
            elapsed: elapsed.toFixed(2),
            errors: this.loadingState.errors.length,
            currentStep: this.loadingState.currentStep
        };
    }
};

if (typeof window !== 'undefined') {
    window.EnhancedLoader = EnhancedLoader;
}
