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
      brand_sub: 'HSEHub 360 — السلامة • الصحة • البيئة',
      f_email: 'البريد الإلكتروني', f_password: 'كلمة المرور', f_password_confirm: 'تأكيد كلمة المرور',
      f_org: 'اسم المؤسسة', f_name: 'الاسم الكامل', f_phone: 'رقم الجوال',
      f_otp: 'رمز التفعيل',
      ph_email: 'you@company.com', ph_pwd: '••••••••',
      ph_org: 'مثال: شركة النور للصناعات', ph_name: 'اسمك',
      ph_phone: '5xxxxxxxx', ph_otp: '6 أرقام',
      ph_pwd8: '8 أحرف على الأقل', ph_pwd_confirm: 'أعد إدخال كلمة المرور',
      back_app: '← العودة للتطبيق',

      // login
      login_doctitle: 'تسجيل الدخول — HSEHub 360',
      login_title: 'تسجيل الدخول', btn_login: 'دخول',
      no_account: 'لا تملك حساباً؟', signup_link: 'أنشئ مؤسسة جديدة',
      login_filling: 'جاري الدخول...', login_ok: 'تم! جارٍ فتح التطبيق...',
      err_fill_both: 'أدخل البريد وكلمة المرور', err_login_failed: 'فشل الدخول',
      pwd_show: 'إظهار كلمة المرور', pwd_hide: 'إخفاء كلمة المرور',

      // signup
      signup_doctitle: 'إنشاء حساب — HSEHub 360',
      signup_title: 'إنشاء مؤسسة جديدة', btn_signup: 'إنشاء الحساب والمؤسسة',
      have_account: 'لديك حساب؟', login_link: 'تسجيل الدخول',
      su_fill_all: 'يرجى استكمال جميع الحقول', su_pwd_short: 'كلمة المرور 8 أحرف على الأقل',
      su_pwd_mismatch: 'كلمتا المرور غير متطابقتين',
      su_phone_required: 'أدخل رقم الجوال مع رمز الدولة',
      su_phone_invalid: 'رقم الجوال غير صالح',
      su_creating: 'جاري إنشاء الحساب...', su_provisioning: 'جاري تجهيز المؤسسة...',
      su_ok: 'تم بنجاح! جارٍ فتح التطبيق...',
      su_confirm_email: 'تم إنشاء الحساب. فعّل بريدك ثم سجّل الدخول.',
      su_failed: 'تعذّر إنشاء الحساب',
      su_otp_title: 'تفعيل البريد الإلكتروني',
      su_otp_hint: 'أرسلنا رمز تفعيل من 6 أرقام إلى بريدك الإلكتروني',
      btn_verify_otp: 'تأكيد الرمز ومتابعة', btn_resend_otp: 'إعادة إرسال الرمز',
      su_otp_sent: 'تم إرسال رمز جديد', su_otp_invalid: 'رمز غير صحيح أو منتهٍ',
      su_org_code_label: 'كود المؤسسة', su_org_code_hint: 'احفظ هذا الكود — ستحتاجه للدعم والتعريف',
      btn_continue_app: 'الدخول للتطبيق',

      su_terms_version: 'v2026.1',
      su_terms_title: 'إقرار المسؤولية وشروط الاستخدام',
      su_terms_effective: 'الإصدار v2026.1 — ساري من يونيو 2026',
      su_terms_required: 'يجب الموافقة على إقرار المسؤولية وشروط الاستخدام قبل المتابعة',
      su_terms_accept_label: 'أقرّ بأنني مُخوَّل بتمثيل المؤسسة، وقرأت شروط استخدام HSEHub 360 (v2026.1) وأوافق عليها.',
      su_terms_body: '<p class="saas-terms-meta"><strong>إقرار المسؤولية وشروط استخدام HSEHub 360</strong><br>الإصدار v2026.1 — ساري من يونيو 2026</p><p><strong>1. التمهيد</strong><br>باستخدامك منصّة HSEHub 360 («المنصّة») وإنشاء حساب مؤسسة، فإنك («المستخدم» أو «العميل») توافق على هذه الشروط («الشروط») مع HSEHub 360 («مزوِّد المنصّة» أو «نحن»). إذا لم توافق، لا تُكمل التسجيل.</p><p><strong>2. التعريفات</strong><br>• «مزوِّد المنصّة»: HSEHub 360 — مالك/مشغّل المنصّة.<br>• «المنصّة»: نظام HSEHub 360 السحابي لإدارة السلامة والصحة والبيئة (SaaS).<br>• «المؤسسة»: الجهة التي تُسجَّل عبر النموذج.<br>• «البيانات»: جميع المعلومات التي تُدخلها أو تُرفعها المؤسسة أو مستخدموها.<br>• «الحساب»: بيانات الدخول والصلاحيات المرتبطة بالمستخدم.</p><p><strong>3. قبول الشروط</strong><br>تحديد خانة الموافقة والضغط على «إنشاء الحساب والمؤسسة» يُعدّ إقراراً إلكترونياً ملزماً بأنك قرأت وفهمت هذه الشروط وتوافق عليها.</p><p><strong>4. وصف الخدمة والتطوير المستمر</strong><br>المنصّة أداة رقمية مساعدة، قابلة للتطوير والتحديث المستمر. قد تُضاف أو تُعدَّل أو تُوقَف ميزات أو واجهات أو تكاملات دون إشعار مسبق. لا تُعدّ المنصّة استشارة قانونية أو مهنية أو بديلاً عن أنظمة إدارة السلامة المعتمدة لدى المؤسسة.</p><p><strong>5. التسجيل والأهلية</strong><br>تقرّ بأنك مُخوَّل قانوناً بتمثيل المؤسسة، وأن بيانات التسجيل صحيحة وكاملة، وأنك مسؤول عن سرية بيانات الدخول وعن جميع الأنشطة التي تتم عبر حسابك أو حسابات مستخدمي مؤسستك.</p><p><strong>6. ملكية البيانات والأمان</strong><br>• تبقى البيانات ملكاً للمؤسسة (العميل).<br>• نُخزِّن البيانات في بنية قاعدة بيانات سحابية مُدارة لدينا، مع عزل بين المؤسسات (Multi-Tenant) وضوابط وصول وصلاحيات.<br>• نطبّق إجراءات أمنية معقولة تجارياً (تشفير النقل، نسخ احتياطي، سجلات تدقيق) دون ضمان أمان مطلق أو خلوٍّ من الثغرات.<br>• أنت مسؤول عن دقة البيانات، وتصنيفها، وصلاحية جمعها واستخدامها وفق أنظمتكم.</p><p><strong>7. الاستخدام المقبول</strong><br>يُحظر: (أ) استخدام المنصّة لأغراض غير قانونية؛ (ب) محاولة اختراق أو تعطيل النظام؛ (ج) مشاركة الحسابات أو تجاوز الصلاحيات؛ (د) إدخال بيانات كاذبة أو مضللة؛ (هـ) أي استخدام يلحق ضرراً بالمنصّة أو بالغير. نحتفظ بحق تعليق أو إنهاء الحساب عند مخالفة هذا البند.</p><p><strong>8. توفر الخدمة والتعديلات</strong><br>تُقدَّم الخدمة «حسب التوفر» (As Available). قد تحدث انقطاعات للصيانة أو التحديث أو لأسباب خارجة عن سيطرتنا. لا نضمن تشغيلاً متواصلاً بنسبة 100%.</p><p><strong>9. إخلاء المسؤولية عن الضمانات</strong><br>تُقدَّم المنصّة «كما هي» (As Is) و«حسب التوفر»، دون أي ضمانات صريحة أو ضمنية، بما في ذلك — دون حصر — ضمانات الملاءمة لغرض معيّن، أو الدقة، أو خلوّ النظام من الأخطاء.</p><p><strong>10. تحديد المسؤولية</strong><br>إلى أقصى حد يسمح به النظام المعمول به:<br>• لا نتحمل مسؤولية عن أضرار غير مباشرة، أو تبعية، أو خسارة أرباح، أو بيانات، أو سمعة، أو توقف أعمال.<br>• لا نتحمل مسؤولية سوء الاستخدام، أو الإدخال الخاطئ، أو الاعتماد على التقارير/المؤشرات دون تحقق مهني مستقل.<br>• لا تتجاوز مسؤوليتنا الإجمالية — إن وُجدت — المبالغ المدفوعة للاشتراك خلال الـ 12 شهراً السابقة للمطالبة (أو صفراً خلال فترة التجربة المجانية).</p><p><strong>11. التعويض</strong><br>توافق على تعويضنا والدفاع عنا ضد أي مطالبات أو خسائر ناتجة عن: (أ) مخالفتك لهذه الشروط؛ (ب) بياناتك أو استخدامك للمنصّة؛ (ج) مخالفة أنظمة سلامة/صحة/بيئة أو خصوصية أو أي قوانين معمول بها.</p><p><strong>12. الامتثال التنظيمي (HSE)</strong><br>المؤسسة وحدها مسؤولة عن الامتثال للأنظمة والمعايير المحلية والدولية ذات الصلة (OSHA, ISO 45001، إلخ حسب نطاق عملها). مخرجات المنصّة (تقارير، KPIs، سجلات) أدوات مساعدة ولا تُغني عن التقييم المهني أو الالتزامات القانونية.</p><p><strong>13. خدمات الطرف الثالث</strong><br>قد تتكامل المنصّة مع خدمات خارجية (استضافة، بريد، دفع). لا نتحمل مسؤولية أعطال أو سياسات تلك الجهات.</p><p><strong>14. الإنهاء</strong><br>يمكنك التوقف عن الاستخدام في أي وقت. يحق لنا تعليق أو إنهاء الحساب عند مخالفة الشروط أو عدم السداد أو لأسباب أمنية، وفق ما يسمح به النظام.</p><p><strong>15. تعديل الشروط</strong><br>قد نُحدّث هذه الشروط. سيُعرض رقم إصدار جديد عند التسجيل أو التجديد. استمرار الاستخدام بعد التحديث يُعدّ موافقة على الإصدار الجديد.</p><p><strong>16. القانون الواجب التطبيق</strong><br>تخضع هذه الشروط لقوانين جمهورية مصر العربية، دون الإخلال بأحكام حماية المستهلك الإلزامية أو أي أحكام إلزامية في بلد المؤسسة.</p><p><strong>17. التواصل</strong><br>للاستفسارات المتعلقة بهذه الشروط أو المنصّة: Yasser@qhsseconsultant.onmicrosoft.com</p>',

      // billing
      billing_doctitle: 'الاشتراك والفوترة — HSEHub 360',
      billing_title: 'الاشتراك والفوترة', loading: 'جاري التحميل…',
      lbl_org: 'المؤسسة', lbl_org_code: 'كود المؤسسة',
      lbl_plan: 'الخطة', lbl_status: 'الحالة', lbl_renewal: 'التجديد',
      current_plan: 'خطتك الحالية', default_plan: 'افتراضية', subscribe: 'الاشتراك',
      lim_free: 'حتى 5 مستخدمين', lim_pro: 'حتى 50 مستخدم', lim_enterprise: 'حتى 1000 مستخدم',
      users_suffix: 'مستخدم', checkout_failed: 'تعذّر بدء الدفع', err_prefix: 'خطأ: ',
      st_trialing: 'تجريبي', st_active: 'فعّال', st_past_due: 'متأخر السداد',
      st_frozen: 'مجمّد', st_canceled: 'ملغى',
      payment_required_banner: 'انتهت التجربة المجانية (3 أيام) — أضف بيانات الدفع للمتابعة:',
      lbl_trial: 'نهاية التجربة', lbl_seats: 'المقاعد', lbl_storage: 'التخزين',
      module_locked_trial: 'هذا المديول غير متاح في التجربة المجانية — رقِّ من «عروض الأسعار»',
      trial_modules_banner: 'التجربة المجانية: مديولات محدودة فقط',
      nav_pricing_short: 'عروض الأسعار',

      team_title: 'فريق المؤسسة', team_invite: 'دعوة عضو جديد', team_role: 'الدور',
      team_send: 'إرسال الدعوة', team_pending: 'دعوات معلّقة', team_seats: 'المقاعد المستخدمة',
      team_pending_short: 'معلّقة', team_none: 'لا توجد دعوات', team_revoke: 'إلغاء',
      team_sent: 'تم إنشاء الدعوة', team_link: 'رابط الدعوة', team_forbidden: 'يتطلب صلاحية مالك أو مدير',

      invite_accept_title: 'قبول دعوة المؤسسة', invite_accept_btn: 'قبول والدخول',
      invite_no_token: 'رابط الدعوة غير صالح', invite_login_first: 'سجّل الدخول أولاً…',
      invite_ready: 'اضغط لقبول الدعوة والانضمام للمؤسسة', invite_done: 'تم الانضمام — جاري التحويل…',

      // platform console
      pf_doctitle: 'إدارة الخطط — HSEHub 360',
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
      brand_sub: 'HSEHub 360 — Safety • Health • Environment',
      f_email: 'Email', f_password: 'Password', f_password_confirm: 'Confirm password',
      f_org: 'Organization name', f_name: 'Full name', f_phone: 'Mobile number',
      f_otp: 'Verification code',
      ph_email: 'you@company.com', ph_pwd: '••••••••',
      ph_org: 'e.g. Al-Noor Industries', ph_name: 'Your name',
      ph_phone: '5xxxxxxx', ph_otp: '6-digit code',
      ph_pwd8: 'At least 8 characters', ph_pwd_confirm: 'Re-enter your password',
      back_app: 'Back to app →',

      login_doctitle: 'Sign in — HSEHub 360',
      login_title: 'Sign in', btn_login: 'Sign in',
      no_account: "Don't have an account?", signup_link: 'Create a new organization',
      login_filling: 'Signing in...', login_ok: 'Done! Opening the app...',
      err_fill_both: 'Enter email and password', err_login_failed: 'Sign-in failed',
      pwd_show: 'Show password', pwd_hide: 'Hide password',

      signup_doctitle: 'Create account — HSEHub 360',
      signup_title: 'Create a new organization', btn_signup: 'Create account & organization',
      have_account: 'Already have an account?', login_link: 'Sign in',
      su_fill_all: 'Please complete all fields', su_pwd_short: 'Password must be at least 8 characters',
      su_pwd_mismatch: 'Passwords do not match',
      su_phone_required: 'Enter mobile number with country code',
      su_phone_invalid: 'Invalid mobile number',
      su_creating: 'Creating account...', su_provisioning: 'Setting up organization...',
      su_ok: 'Success! Opening the app...',
      su_confirm_email: 'Account created. Verify your email, then sign in.',
      su_failed: 'Could not create account',
      su_otp_title: 'Verify your email',
      su_otp_hint: 'We sent a 6-digit verification code to your email',
      btn_verify_otp: 'Verify & continue', btn_resend_otp: 'Resend code',
      su_otp_sent: 'New code sent', su_otp_invalid: 'Invalid or expired code',
      su_org_code_label: 'Organization code', su_org_code_hint: 'Save this code for support and identification',
      btn_continue_app: 'Enter application',

      su_terms_version: 'v2026.1',
      su_terms_title: 'Liability Acknowledgment & Terms of Use',
      su_terms_effective: 'Version v2026.1 — Effective June 2026',
      su_terms_required: 'You must accept the Terms of Use before continuing',
      su_terms_accept_label: 'I confirm I am authorized to represent my organization, and I have read and agree to the HSEHub 360 Terms of Use (v2026.1).',
      su_terms_body: '<p class="saas-terms-meta"><strong>Liability Acknowledgment & Terms of Use — HSEHub 360</strong><br>Version v2026.1 — Effective June 2026</p><p><strong>1. Introduction</strong><br>By using the HSEHub 360 platform (the "Platform") and creating an organization account, you ("User" or "Customer") agree to these Terms with HSEHub 360 (the "Provider" or "we"). If you do not agree, do not complete registration.</p><p><strong>2. Definitions</strong><br>• "Provider": HSEHub 360 — owner/operator of the Platform.<br>• "Platform": HSEHub 360 cloud HSE management system (SaaS).<br>• "Organization": the entity registered via this form.<br>• "Data": all information entered or uploaded by the Organization or its users.<br>• "Account": login credentials and permissions associated with a user.</p><p><strong>3. Acceptance</strong><br>Checking the acceptance box and clicking "Create account & organization" constitutes a binding electronic acknowledgment that you have read, understood, and agree to these Terms.</p><p><strong>4. Service Description & Continuous Development</strong><br>The Platform is a digital support tool under continuous development. Features, interfaces, or integrations may be added, modified, or discontinued without prior notice. The Platform is not legal or professional advice and is not a substitute for your Organization\'s approved HSE management systems.</p><p><strong>5. Registration & Eligibility</strong><br>You confirm you are legally authorized to represent the Organization, that registration data is accurate and complete, and that you are responsible for credential confidentiality and all activity under your Account and your Organization\'s user accounts.</p><p><strong>6. Data Ownership & Security</strong><br>• Data remains the property of the Organization (Customer).<br>• We store Data in our managed cloud database infrastructure with multi-tenant isolation and access controls.<br>• We apply commercially reasonable security measures (encryption in transit, backups, audit logs) without guaranteeing absolute security or freedom from vulnerabilities.<br>• You are responsible for Data accuracy, classification, and lawful collection and use under your policies and applicable laws.</p><p><strong>7. Acceptable Use</strong><br>Prohibited: (a) unlawful use; (b) attempting to hack or disrupt the Platform; (c) account sharing or permission bypass; (d) false or misleading data entry; (e) any use harming the Platform or third parties. We may suspend or terminate Accounts for violations.</p><p><strong>8. Availability & Changes</strong><br>The service is provided "As Available." Outages may occur for maintenance, updates, or reasons beyond our reasonable control. We do not guarantee 100% uptime.</p><p><strong>9. Disclaimer of Warranties</strong><br>The Platform is provided "As Is" and "As Available" without express or implied warranties, including without limitation fitness for a particular purpose, accuracy, or error-free operation.</p><p><strong>10. Limitation of Liability</strong><br>To the maximum extent permitted by applicable law:<br>• We are not liable for indirect, consequential, loss of profits, data, reputation, or business interruption.<br>• We are not liable for misuse, incorrect entry, or reliance on reports/KPIs without independent professional verification.<br>• Our aggregate liability — if any — shall not exceed subscription fees paid in the 12 months preceding the claim (or zero during a free trial).</p><p><strong>11. Indemnification</strong><br>You agree to indemnify and hold us harmless from claims or losses arising from: (a) your breach of these Terms; (b) your Data or use of the Platform; (c) violation of HSE, privacy, or other applicable laws.</p><p><strong>12. Regulatory Compliance (HSE)</strong><br>The Organization alone is responsible for compliance with applicable local and international standards (e.g. OSHA, ISO 45001). Platform outputs (reports, KPIs, records) are support tools and do not replace professional judgment or legal obligations.</p><p><strong>13. Third-Party Services</strong><br>The Platform may integrate external services (hosting, email, payment). We are not responsible for their failures or policies.</p><p><strong>14. Termination</strong><br>You may stop using the Platform at any time. We may suspend or terminate Accounts for Terms violations, non-payment, or security reasons as permitted by law.</p><p><strong>15. Changes to Terms</strong><br>We may update these Terms. A new version number will be shown at registration or renewal. Continued use after an update constitutes acceptance of the new version.</p><p><strong>16. Governing Law</strong><br>These Terms are governed by the laws of the Arab Republic of Egypt, without prejudice to mandatory consumer protection or other mandatory rules in the Organization\'s country.</p><p><strong>17. Contact</strong><br>For inquiries regarding these Terms or the Platform: Yasser@qhsseconsultant.onmicrosoft.com</p>',

      billing_doctitle: 'Subscription & Billing — HSEHub 360',
      billing_title: 'Subscription & Billing', loading: 'Loading…',
      lbl_org: 'Organization', lbl_org_code: 'Organization code',
      lbl_plan: 'Plan', lbl_status: 'Status', lbl_renewal: 'Renews',
      current_plan: 'Current plan', default_plan: 'Default', subscribe: 'Subscribe',
      lim_free: 'Up to 5 users', lim_pro: 'Up to 50 users', lim_enterprise: 'Up to 1000 users',
      users_suffix: 'users', checkout_failed: 'Could not start checkout', err_prefix: 'Error: ',
      st_trialing: 'Trial', st_active: 'Active', st_past_due: 'Past due',
      st_frozen: 'Frozen', st_canceled: 'Canceled',
      payment_required_banner: 'Free trial ended (3 days) — add payment to continue:',
      lbl_trial: 'Trial ends', lbl_seats: 'Seats', lbl_storage: 'Storage',
      module_locked_trial: 'This module is not included in the free trial — upgrade via Pricing & Plans',
      trial_modules_banner: 'Free trial: limited modules only',
      nav_pricing_short: 'Pricing & Plans',

      team_title: 'Team', team_invite: 'Invite member', team_role: 'Role',
      team_send: 'Send invite', team_pending: 'Pending invites', team_seats: 'Seats used',
      team_pending_short: 'pending', team_none: 'No invites', team_revoke: 'Revoke',
      team_sent: 'Invite created', team_link: 'Invite link', team_forbidden: 'Owner or admin only',

      invite_accept_title: 'Accept invitation', invite_accept_btn: 'Accept & enter',
      invite_no_token: 'Invalid invite link', invite_login_first: 'Sign in first…',
      invite_ready: 'Click to accept and join the organization', invite_done: 'Joined — redirecting…',

      pf_doctitle: 'Plans — HSEHub 360',
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
      if (global.SaaSAuthFields && typeof global.SaaSAuthFields.refreshLabels === 'function') {
        try { global.SaaSAuthFields.refreshLabels(); } catch (_e) { /* ignore */ }
      }
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
