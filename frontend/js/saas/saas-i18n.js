/* ============================================================
   saas-i18n.js — tiny bilingual (ar/en) engine for standalone
   SaaS pages. Persists choice, flips dir/lang, auto-mounts a
   floating language toggle, and translates [data-i18n*] nodes.

   Usage in a page:
     <span data-i18n="login_title"></span>
     <input data-i18n-ph="f_email">
     <body data-i18n-title="login_doctitle">
     SaaSI18n.init(optionalOnChangeFn);   // after DOM ready
     SaaSI18n.t('key')                     // for dynamic JS strings
   ============================================================ */
(function (global) {
  const DICT = {
    ar: {
      brand_sub: 'منصّة إدارة السلامة المهنية (HSE)',
      f_email: 'البريد الإلكتروني', f_password: 'كلمة المرور',
      f_org: 'اسم المؤسسة', f_name: 'الاسم الكامل',
      ph_email: 'you@company.com', ph_pwd: '••••••••',
      ph_org: 'مثال: شركة النور للصناعات', ph_name: 'اسمك',
      ph_pwd8: '8 أحرف على الأقل',
      back_app: '← العودة للتطبيق',

      // login
      login_doctitle: 'تسجيل الدخول — HSE SaaS',
      login_title: 'تسجيل الدخول', btn_login: 'دخول',
      no_account: 'لا تملك حساباً؟', signup_link: 'أنشئ مؤسسة جديدة',
      login_filling: 'جاري الدخول...', login_ok: 'تم! جارٍ فتح التطبيق...',
      err_fill_both: 'أدخل البريد وكلمة المرور', err_login_failed: 'فشل الدخول',

      // signup
      signup_doctitle: 'إنشاء حساب — HSE SaaS',
      signup_title: 'إنشاء مؤسسة جديدة', btn_signup: 'إنشاء الحساب والمؤسسة',
      have_account: 'لديك حساب؟', login_link: 'تسجيل الدخول',
      su_fill_all: 'يرجى استكمال جميع الحقول', su_pwd_short: 'كلمة المرور 8 أحرف على الأقل',
      su_creating: 'جاري إنشاء الحساب...', su_provisioning: 'جاري تجهيز المؤسسة...',
      su_ok: 'تم بنجاح! جارٍ فتح التطبيق...',
      su_confirm_email: 'تم إنشاء الحساب. فعّل بريدك ثم سجّل الدخول.',
      su_failed: 'تعذّر إنشاء الحساب',

      // billing
      billing_doctitle: 'الاشتراك والفوترة — HSE SaaS',
      billing_title: 'الاشتراك والفوترة', loading: 'جاري التحميل…',
      lbl_org: 'المؤسسة', lbl_plan: 'الخطة', lbl_status: 'الحالة', lbl_renewal: 'التجديد',
      current_plan: 'خطتك الحالية', default_plan: 'افتراضية', subscribe: 'الاشتراك',
      lim_free: 'حتى 5 مستخدمين', lim_pro: 'حتى 50 مستخدم', lim_enterprise: 'حتى 1000 مستخدم',
      users_suffix: 'مستخدم', checkout_failed: 'تعذّر بدء الدفع', err_prefix: 'خطأ: ',
      st_trialing: 'تجريبي', st_active: 'فعّال', st_past_due: 'متأخر السداد',
      st_frozen: 'مجمّد', st_canceled: 'ملغى',
      payment_required_banner: 'انتهت التجربة المجانية (7 أيام) — أضف بيانات الدفع للمتابعة:',
      lbl_trial: 'نهاية التجربة', lbl_seats: 'المقاعد', lbl_storage: 'التخزين',

      team_title: 'فريق المؤسسة', team_invite: 'دعوة عضو جديد', team_role: 'الدور',
      team_send: 'إرسال الدعوة', team_pending: 'دعوات معلّقة', team_seats: 'المقاعد المستخدمة',
      team_pending_short: 'معلّقة', team_none: 'لا توجد دعوات', team_revoke: 'إلغاء',
      team_sent: 'تم إنشاء الدعوة', team_link: 'رابط الدعوة', team_forbidden: 'يتطلب صلاحية مالك أو مدير',

      invite_accept_title: 'قبول دعوة المؤسسة', invite_accept_btn: 'قبول والدخول',
      invite_no_token: 'رابط الدعوة غير صالح', invite_login_first: 'سجّل الدخول أولاً…',
      invite_ready: 'اضغط لقبول الدعوة والانضمام للمؤسسة', invite_done: 'تم الانضمام — جاري التحويل…',

      // platform console
      pf_doctitle: 'إدارة الخطط — لوحة مدير المنصّة',
      pf_login_title: 'دخول مدير المنصّة', pf_title: 'إدارة مديولات الخطط',
      pf_who: 'مدير المنصّة',
      pf_forbidden: '⛔ هذا الحساب ليس مدير منصّة.',
      pf_note: 'إفراغ كل المديولات لخطة = «كل المديولات متاحة». المديولات الأساسية (لوحة التحكم/الملف/الإعدادات/المستخدمون) متاحة دائماً لكل الخطط.',
      pf_max_users: 'حدّ المستخدمين', pf_storage: 'التخزين (MB)',
      pf_select_all: 'تحديد الكل', pf_clear_all: 'إلغاء الكل', pf_save: 'حفظ',
      pf_saving: 'جارٍ الحفظ...', pf_saved: '✅ تم حفظ المديولات والحدود',
      pf_all_modules: '(كل المديولات متاحة)'
    },
    en: {
      brand_sub: 'Occupational Safety Management Platform (HSE)',
      f_email: 'Email', f_password: 'Password',
      f_org: 'Organization name', f_name: 'Full name',
      ph_email: 'you@company.com', ph_pwd: '••••••••',
      ph_org: 'e.g. Al-Noor Industries', ph_name: 'Your name',
      ph_pwd8: 'At least 8 characters',
      back_app: 'Back to app →',

      login_doctitle: 'Sign in — HSE SaaS',
      login_title: 'Sign in', btn_login: 'Sign in',
      no_account: "Don't have an account?", signup_link: 'Create a new organization',
      login_filling: 'Signing in...', login_ok: 'Done! Opening the app...',
      err_fill_both: 'Enter email and password', err_login_failed: 'Sign-in failed',

      signup_doctitle: 'Create account — HSE SaaS',
      signup_title: 'Create a new organization', btn_signup: 'Create account & organization',
      have_account: 'Already have an account?', login_link: 'Sign in',
      su_fill_all: 'Please complete all fields', su_pwd_short: 'Password must be at least 8 characters',
      su_creating: 'Creating account...', su_provisioning: 'Setting up organization...',
      su_ok: 'Success! Opening the app...',
      su_confirm_email: 'Account created. Verify your email, then sign in.',
      su_failed: 'Could not create account',

      billing_doctitle: 'Subscription & Billing — HSE SaaS',
      billing_title: 'Subscription & Billing', loading: 'Loading…',
      lbl_org: 'Organization', lbl_plan: 'Plan', lbl_status: 'Status', lbl_renewal: 'Renews',
      current_plan: 'Current plan', default_plan: 'Default', subscribe: 'Subscribe',
      lim_free: 'Up to 5 users', lim_pro: 'Up to 50 users', lim_enterprise: 'Up to 1000 users',
      users_suffix: 'users', checkout_failed: 'Could not start checkout', err_prefix: 'Error: ',
      st_trialing: 'Trial', st_active: 'Active', st_past_due: 'Past due',
      st_frozen: 'Frozen', st_canceled: 'Canceled',
      payment_required_banner: 'Free trial ended (7 days) — add payment to continue:',
      lbl_trial: 'Trial ends', lbl_seats: 'Seats', lbl_storage: 'Storage',

      team_title: 'Team', team_invite: 'Invite member', team_role: 'Role',
      team_send: 'Send invite', team_pending: 'Pending invites', team_seats: 'Seats used',
      team_pending_short: 'pending', team_none: 'No invites', team_revoke: 'Revoke',
      team_sent: 'Invite created', team_link: 'Invite link', team_forbidden: 'Owner or admin only',

      invite_accept_title: 'Accept invitation', invite_accept_btn: 'Accept & enter',
      invite_no_token: 'Invalid invite link', invite_login_first: 'Sign in first…',
      invite_ready: 'Click to accept and join the organization', invite_done: 'Joined — redirecting…',

      pf_doctitle: 'Plans — Platform Admin Console',
      pf_login_title: 'Platform Admin Login', pf_title: 'Plan Modules Management',
      pf_who: 'Platform Admin',
      pf_forbidden: '⛔ This account is not a platform admin.',
      pf_note: 'Empty modules for a plan = "all modules". Core modules (dashboard/profile/settings/users) are always available on every plan.',
      pf_max_users: 'Max users', pf_storage: 'Storage (MB)',
      pf_select_all: 'Select all', pf_clear_all: 'Clear all', pf_save: 'Save',
      pf_saving: 'Saving...', pf_saved: '✅ Modules & limits saved',
      pf_all_modules: '(all modules available)'
    }
  };

  const KEY = 'saas_lang';
  const I18n = {
    lang: (localStorage.getItem(KEY) === 'en') ? 'en' : 'ar',
    onChange: null, _btn: null,
    t(k) { const d = DICT[this.lang] || DICT.ar; return (k in d) ? d[k] : (DICT.ar[k] || k); },
    apply() {
      const html = document.documentElement;
      html.lang = this.lang; html.dir = (this.lang === 'ar') ? 'rtl' : 'ltr';
      document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.getAttribute('data-i18n')); });
      document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', this.t(el.getAttribute('data-i18n-ph'))); });
      document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = this.t(el.getAttribute('data-i18n-html')); });
      const tk = document.body && document.body.getAttribute('data-i18n-title');
      if (tk) document.title = this.t(tk);
      if (this._btn) this._btn.textContent = (this.lang === 'ar') ? 'EN' : 'ع';
      if (typeof this.onChange === 'function') { try { this.onChange(this.lang); } catch (e) {} }
    },
    toggle() { this.lang = (this.lang === 'ar') ? 'en' : 'ar'; localStorage.setItem(KEY, this.lang); this.apply(); },
    mount() {
      if (this._btn) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'saas-lang-toggle';
      b.addEventListener('click', () => this.toggle());
      document.body.appendChild(b); this._btn = b;
    },
    init(onChange) { this.onChange = onChange || null; this.mount(); this.apply(); }
  };
  global.SaaSI18n = I18n;
})(window);
