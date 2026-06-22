/**
 * saas-signup-errors.js — human-readable signup/auth errors (Arabic-friendly).
 */
(function (global) {
    function t(key, fallback) {
        return (global.SaaSI18n && SaaSI18n.t(key)) || fallback;
    }

    function format(err) {
        if (!err) return t('su_failed', 'تعذّر إنشاء الحساب');
        if (typeof err === 'string') return err;

        const msg = err.message || err.msg || err.error_description || err.error || '';
        const code = err.code || err.error_code || err.status || '';
        const raw = String(msg || code || '').toLowerCase();

        if (/504|upstream request timeout|timeout|etimedout/i.test(raw)) {
            return 'انتهت مهلة إرسال بريد التفعيل (SMTP). تم تفعيل التسجيل السريع — حدّث الصفحة وحاول مرة أخرى.';
        }
        if (/email_provider_disabled|email signups are disabled/i.test(raw)) {
            return 'إرسال البريد معطّل في إعدادات Supabase — تواصل مع الدعم.';
        }
        if (/failed to fetch|networkerror|network error|load failed|521|503|enotfound/i.test(raw)) {
            return 'تعذّر الاتصال بخادم HSEHub 360. تحقق من الإنترنت.';
        }
        if (/already registered|already exists|user already/i.test(raw)) {
            return 'هذا البريد مسجّل مسبقاً — سجّل الدخول أو استخدم «نسيت كلمة المرور».';
        }
        if (/rate limit|too many/i.test(raw)) {
            return 'محاولات كثيرة — انتظر دقيقة ثم حاول مجدداً.';
        }
        if (/terms acceptance required/i.test(raw)) {
            return t('su_terms_required', 'يجب الموافقة على الإقرار');
        }
        if (/email not verified/i.test(raw)) {
            return 'فعّل بريدك بإدخال رمز OTP أولاً.';
        }
        if (/user already owns an organization/i.test(raw)) {
            return 'هذا الحساب يملك مؤسسة بالفعل — سجّل الدخول.';
        }
        if (/invalid login credentials|invalid email or password/i.test(raw)) {
            return 'بريد أو كلمة مرور غير صحيحة.';
        }

        if (msg) return String(msg);
        if (code) return String(code);
        try {
            const j = JSON.stringify(err);
            if (j && j !== '{}' && j !== 'null') return j;
        } catch (_e) { /* ignore */ }
        return t('su_failed', 'تعذّر إنشاء الحساب');
    }

    global.SaaSSignupErrors = { format };
})(window);
