/**
 * Expanded help articles — loaded before help-default-content.js
 */
(function (global) {
    function guide(id, moduleKey, icon, order, category, titleAr, titleEn, ar, en) {
        const ol = (steps) => (steps || []).map((s) => `<li>${s}</li>`).join('');
        const ul = (tips) => (tips || []).length
            ? `<h4>${ar.tipsTitle || 'نصائح مهمة'}</h4><ul>${ol(tips)}</ul>`
            : '';
        const olEn = (steps) => (steps || []).map((s) => `<li>${s}</li>`).join('');
        const ulEn = (tips) => (tips || []).length
            ? `<h4>${en.tipsTitle || 'Important tips'}</h4><ul>${olEn(tips)}</ul>`
            : '';
        const bodyAr = `<p><strong>الغرض:</strong> ${ar.purpose}</p><p><strong>كيف تصل إليه:</strong> ${ar.access}</p><h4>خطوات الاستخدام</h4><ol>${ol(ar.steps)}</ol>${ul(ar.tips)}`;
        const bodyEn = `<p><strong>Purpose:</strong> ${en.purpose}</p><p><strong>How to access:</strong> ${en.access}</p><h4>Steps</h4><ol>${olEn(en.steps)}</ol>${ulEn(en.tips)}`;
        return {
            id, moduleKey: moduleKey || '', icon: icon || 'fa-circle-info', order,
            category: category || 'modules', titleAr, titleEn, bodyAr, bodyEn, active: true
        };
    }

    function getExpandedSections() {
        return [
            guide('getting-started', '', 'fa-rocket', 1, 'getting-started',
                'البدء السريع', 'Getting Started',
                {
                    purpose: 'تعريف سريع بمنصة <strong>HSEHub 360</strong> وكيفية التنقل بين المديولات.',
                    access: 'بعد تسجيل الدخول تظهر القائمة الجانبية. استخدم شريط البحث في أعلى مركز المساعدة للوصول لأي موضوع.',
                    steps: [
                        'سجّل الدخول ببريدك الرسمي وكلمة المرور المعتمدة من مؤسستك.',
                        'اطّلع على <strong>سياسة الاستخدام</strong> و<strong>إخلاء المسؤولية</strong> في هذا المركز عند أول استخدام.',
                        'من القائمة الجانبية افتح <strong>لوحة التحكم</strong> لملخص مؤشرات السلامة.',
                        'افتح <strong>ملفي الشخصي</strong> للتحقق من بياناتك وصورتك.',
                        'استخدم مركز المساعدة (هذا المديول) كمرجع دائم لكل مديول.'
                    ],
                    tips: [
                        'فعّل المصادقة الثنائية (MFA) إن طُلب منك ذلك.',
                        'إذا لم يظهر مديول في القائمة فأنت بحاجة لصلاحية من مدير النظام في مؤسستك.'
                    ]
                },
                {
                    purpose: 'Quick introduction to <strong>HSEHub 360</strong> and navigation.',
                    access: 'After sign-in use the sidebar. Use Help Center search to find any topic.',
                    steps: [
                        'Sign in with your organization email and password.',
                        'Read the <strong>Terms of Use</strong> and <strong>Liability Disclaimer</strong> in this center.',
                        'Open the <strong>Dashboard</strong> for HSE KPI summaries.',
                        'Open <strong>My Profile</strong> to verify your data and photo.',
                        'Use this Help Center as the permanent reference for every module.'
                    ],
                    tips: ['Enable MFA when prompted.', 'Missing modules require permission from your org admin.']
                }),

            guide('terms-of-use', '', 'fa-file-contract', 2, 'legal',
                'سياسة الاستخدام', 'Terms of Use',
                {
                    purpose: 'تحدد شروط استخدام منصة HSEHub 360 والتزامات المستخدم والمؤسسة.',
                    access: 'مركز المساعدة → قسم <strong>السياسات والمسؤولية</strong> → سياسة الاستخدام.',
                    steps: [
                        'يُستخدم النظام لأغراض السلامة والصحة المهنية والبيئة وفق سياسات مؤسستك فقط.',
                        'يتحمل المستخدم مسؤولية صحة البيانات التي يُدخلها (حوادث، تدريب، زيارات عيادة، إلخ).',
                        'يُحظر مشاركة بيانات الدخول أو الوصول غير المصرّح به لحسابات الآخرين.',
                        'يُحظر إساءة استخدام النظام أو محاولة اختراقه أو تعطيله.',
                        'تحتفظ المؤسسة ومدير المنصّة بحق تعليق الحساب عند مخالفة السياسة.',
                        'قد يُحدَّث النظام دورياً؛ يُعتبر الاستمرار في الاستخدام موافقة على التحديثات المنشورة.'
                    ],
                    tips: [
                        'أبلغ مدير النظام فوراً عند الاشتباه باستخدام غير مصرّح.',
                        'لا تُدخل بيانات شخصية حساسة إلا بما تقتضيه متطلبات العمل والقانون المحلي.'
                    ]
                },
                {
                    purpose: 'Terms governing use of HSEHub 360 by users and the organization.',
                    access: 'Help Center → <strong>Policies & liability</strong> → Terms of Use.',
                    steps: [
                        'Use the platform only for legitimate HSE purposes per your organization policies.',
                        'You are responsible for the accuracy of data you enter.',
                        'Do not share credentials or access others\' accounts.',
                        'Do not abuse, attack, or attempt to disrupt the system.',
                        'Accounts may be suspended for policy violations.',
                        'Continued use after updates constitutes acceptance of published changes.'
                    ],
                    tips: ['Report unauthorized use to your admin immediately.', 'Enter sensitive personal data only as required by work and local law.']
                }),

            guide('liability-disclaimer', '', 'fa-scale-balanced', 3, 'legal',
                'إخلاء المسؤولية والمسؤولية', 'Liability & Disclaimer',
                {
                    purpose: 'توضيح حدود مسؤولية المنصّة والمؤسسة والمستخدم فيما يتعلق بالبيانات والقرارات.',
                    access: 'مركز المساعدة → قسم <strong>السياسات والمسؤولية</strong> → إخلاء المسؤولية.',
                    steps: [
                        'المنصّة أداة لتوثيق ومتابعة أنشطة السلامة؛ لا تُغني عن الالتزام بالأنظمة والمعايير المحلية.',
                        'المؤسسة المشغِّلة تبقى مسؤولة عن الامتثال التنظيمي وسلامة العمل في مواقعها.',
                        'لا تضمن المنصّة خلو البيانات من الأخطاء الناتجة عن إدخال المستخدمين؛ يجب التحقق قبل الاعتماد الرسمي.',
                        'التقارير والمؤشرات داخل النظام للمساعدة في اتخاذ القرار ولا تُعتبر استشارة قانونية أو طبية.',
                        'في حالات الطوارئ اتبع إجراءات الطوارئ المعتمدة في موقعك وليس محتوى المساعدة فقط.',
                        'للحوادث الجسيمة أو الإصابات اتبع بروتوكول الإبلاغ الرسمي لدى مؤسستك والجهات المختصة.'
                    ],
                    tips: [
                        'راجع السجلات دورياً مع فريق السلامة قبل التقديم للجهات الرقابية.',
                        'احتفظ بنسخ احتياطية للوثائق الحرجة حسب سياسة مؤسستك.'
                    ]
                },
                {
                    purpose: 'Limits of platform, organization, and user liability regarding data and decisions.',
                    access: 'Help Center → <strong>Policies & liability</strong> → Disclaimer.',
                    steps: [
                        'The platform supports HSE documentation; it does not replace local laws and standards.',
                        'Your organization remains responsible for regulatory compliance and workplace safety.',
                        'Data accuracy depends on user input; verify before official reliance.',
                        'Reports and KPIs assist decisions; they are not legal or medical advice.',
                        'In emergencies follow your site emergency procedures, not Help text alone.',
                        'For serious incidents follow your official reporting protocol and authorities.'
                    ],
                    tips: ['Review records with the safety team before regulatory submission.', 'Keep backups per your organization policy.']
                }),

            guide('login-security', '', 'fa-shield-halved', 4, 'getting-started',
                'تسجيل الدخول والأمان', 'Login & Security',
                {
                    purpose: 'حماية حسابك وبيانات المؤسسة.',
                    access: 'صفحة <strong>/login</strong> للدخول؛ من القائمة السفلية أو الملف الشخصي للخروج.',
                    steps: [
                        'أدخل البريد وكلمة المرور ثم أكمل رمز MFA إن وُجد.',
                        'من <strong>ملفي الشخصي</strong> غيّر كلمة المرور عند الحاجة.',
                        'استخدم «تسجيل الخروج» على الأجهزة المشتركة.',
                        'لا تحفظ كلمة المرور في متصفحات عامة.'
                    ],
                    tips: ['كلمة مرور قوية وفريدة لكل خدمة.', 'أبلغ المدير عند فقدان جهازك.']
                },
                {
                    purpose: 'Protect your account and organization data.',
                    access: '<strong>/login</strong> to sign in; profile or menu to sign out.',
                    steps: ['Enter email/password and MFA if required.', 'Change password from <strong>My Profile</strong>.', 'Sign out on shared devices.', 'Do not save passwords on public browsers.'],
                    tips: ['Use a strong unique password.', 'Report lost devices to your admin.']
                }),

            guide('permissions-overview', '', 'fa-user-lock', 5, 'getting-started',
                'الصلاحيات والأدوار', 'Permissions & Roles',
                {
                    purpose: 'فهم سبب اختلاف المديولات بين المستخدمين.',
                    access: 'الإعدادات → الصلاحيات (للمدير)؛ القائمة الجانبية (للمستخدم).',
                    steps: [
                        'كل مستخدم يرى المديولات الممنوحة له فقط.',
                        'الأدوار الشائعة: مدير مؤسسة، مشرف، مستخدم عادي.',
                        'لطلب صلاحية تواصل مع مدير النظام في مؤسستك.',
                        'قد تُقيَّد بعض المديولات بخطة الاشتراك للمؤسسة.'
                    ],
                    tips: ['راجع صلاحياتك دورياً عند تغيير مهامك.']
                },
                {
                    purpose: 'Why modules differ between users.',
                    access: 'Settings → Permissions (admin); sidebar (user).',
                    steps: ['You only see granted modules.', 'Common roles: org admin, supervisor, user.', 'Request access from your admin.', 'Some modules depend on subscription plan.'],
                    tips: ['Review permissions when your role changes.']
                }),

            guide('faq-login', '', 'fa-key', 10, 'faq', 'كيف أسجّل الدخول؟', 'How do I sign in?',
                { purpose: 'الوصول للتطبيق.', access: 'رابط الدخول من مؤسستك أو /login', steps: ['افتح صفحة الدخول.', 'أدخل البريد وكلمة المرور.', 'أكمل MFA إن طُلب.', 'نسيت كلمة المرور؟ استخدم الرابط في شاشة الدخول.'] },
                { purpose: 'Access the app.', access: 'Your org link or /login', steps: ['Open login page.', 'Enter email and password.', 'Complete MFA if asked.', 'Use Forgot password link if needed.'] }),

            guide('faq-modules-hidden', '', 'fa-eye-slash', 11, 'faq', 'لماذا لا أرى بعض المديولات؟', 'Why are some modules hidden?',
                { purpose: 'تفسير غياب مديول من القائمة.', access: 'القائمة الجانبية', steps: ['المديول غير مفعّل لصلاحياتك.', 'قد يكون غير مشمول بخطة المؤسسة.', 'تواصل مع مدير النظام لطلب الوصول.'] },
                { purpose: 'Why a module is missing.', access: 'Sidebar', steps: ['Not granted to your role.', 'May not be in org plan.', 'Contact your admin for access.'] }),

            guide('faq-incident', 'incidents', 'fa-exclamation-triangle', 12, 'faq', 'كيف أسجّل حادثاً؟', 'How do I log an incident?',
                { purpose: 'تسجيل حادث عمل.', access: 'القائمة → الحوادث', steps: ['افتح مديول الحوادث.', 'اضغط إضافة / تسجيل حادث.', 'أدخل التاريخ والموقع والوصف.', 'أرفق الصور إن وجدت.', 'احفظ وأبلغ المشرف حسب الإجراء.'] },
                { purpose: 'Log a work incident.', access: 'Sidebar → Incidents', steps: ['Open Incidents.', 'Click Add incident.', 'Enter date, location, details.', 'Attach photos.', 'Save and notify supervisor.'] }),

            guide('faq-profile-photo', 'profile', 'fa-camera', 13, 'faq', 'كيف أحدّث صورتي؟', 'How do I update my photo?',
                { purpose: 'تحديث الصورة الشخصية.', access: 'ملفي الشخصي أو أيقونة المستخدم', steps: ['افتح الملف الشخصي.', 'اضغط على الصورة.', 'اختر ملفاً مناسباً.', 'احفظ.'] },
                { purpose: 'Update profile photo.', access: 'My Profile or avatar', steps: ['Open profile.', 'Click photo.', 'Choose image.', 'Save.'] }),

            guide('faq-password', '', 'fa-lock', 14, 'faq', 'كيف أغيّر كلمة المرور؟', 'How do I change my password?',
                { purpose: 'تغيير كلمة المرور.', access: 'ملفي الشخصي', steps: ['افتح الملف الشخصي.', 'اختر تغيير كلمة المرور.', 'أدخل الحالية والجديدة.', 'احفظ.'] },
                { purpose: 'Change password.', access: 'My Profile', steps: ['Open profile.', 'Change password.', 'Enter current and new.', 'Save.'] }),

            guide('faq-export', '', 'fa-file-export', 15, 'faq', 'كيف أصدّر تقريراً؟', 'How do I export a report?',
                { purpose: 'تصدير بيانات من المديولات.', access: 'داخل كل مديول يدعم التصدير', steps: ['افتح المديول المطلوب.', 'طبّق الفلاتر (تاريخ، موقع، قسم).', 'اضغط تصدير Excel أو PDF إن وُجد.', 'احفظ الملف على جهازك.'] },
                { purpose: 'Export module data.', access: 'Within supporting modules', steps: ['Open the module.', 'Apply filters.', 'Click Export Excel/PDF.', 'Save the file.'] }),

            guide('faq-support', '', 'fa-headset', 16, 'faq', 'كيف أتواصل مع الدعم؟', 'How do I contact support?',
                { purpose: 'الحصول على مساعدة.', access: 'مدير المؤسسة أولاً', steps: ['وثّق المشكلة (خطوات، وقت، لقطة شاشة).', 'تواصل مع مدير النظام في مؤسستك.', 'للمشاكل المنصّة يتصعد المدير لفريق HSEHub 360.'] },
                { purpose: 'Get assistance.', access: 'Org admin first', steps: ['Document the issue.', 'Contact your org admin.', 'Platform issues escalate to HSEHub 360.'] }),

            guide('dashboard', 'dashboard', 'fa-chart-line', 20, 'modules', 'لوحة التحكم', 'Dashboard',
                {
                    purpose: 'نظرة شاملة على مؤشرات السلامة والصحة المهنية في مؤسستك.',
                    access: 'القائمة الجانبية → <strong>لوحة التحكم</strong> (أول عنصر عادةً).',
                    steps: [
                        'راجع بطاقات المؤشرات: حوادث، تدريب، عيادة، تصاريح، وغيرها حسب تفعيل المديولات.',
                        'انقر على أي بطاقة للانتقال مباشرة إلى المديول المعني.',
                        'استخدم <strong>تقرير الموظف</strong> للبحث برقم وظيفي أو اسم والحصول على ملخص سجلاته.',
                        'راقب الاتجاهات الشهرية لدعم اجتماعات السلامة.'
                    ],
                    tips: ['حدّث الصفحة بعد إدخال بيانات جديدة لرؤية أحدث الأرقام.', 'البطاقات المعطّلة تعني أن المديول غير متاح لصلاحياتك.']
                },
                {
                    purpose: 'Overview of HSE KPIs for your organization.',
                    access: 'Sidebar → <strong>Dashboard</strong>.',
                    steps: ['Review KPI cards.', 'Click a card to open the module.', 'Use <strong>Employee report</strong> for person lookup.', 'Track monthly trends for safety meetings.'],
                    tips: ['Refresh after new data entry.', 'Hidden cards mean no module access.']
                }),

            guide('profile', 'profile', 'fa-id-card', 21, 'modules', 'ملفي الشخصي', 'My Profile',
                {
                    purpose: 'عرض بياناتك الوظيفية وتحديث بعض الإعدادات الشخصية.',
                    access: 'القائمة → <strong>ملفي الشخصي</strong> أو الصورة في الشريط الجانبي.',
                    steps: ['راجع الاسم والقسم والمصنع وتاريخ التعيين.', 'حدّث صورتك الشخصية.', 'غيّر كلمة المرور عند الحاجة.', 'راجع إحصائيات مرتبطة بسجلاتك إن ظهرت.'],
                    tips: ['استخدم صورة رسمية واضحة.', 'تأكد من صحة القسم والموقع لدقة التقارير.']
                },
                {
                    purpose: 'View job data and update personal settings.',
                    access: 'Sidebar → <strong>My Profile</strong> or avatar.',
                    steps: ['Review name, department, site, hire date.', 'Update photo.', 'Change password.', 'Review your related stats.'],
                    tips: ['Use a clear professional photo.', 'Verify department/site for accurate reports.']
                }),

            guide('users', 'users', 'fa-users-cog', 22, 'admin', 'إدارة المستخدمين', 'User Management',
                {
                    purpose: 'إنشاء الحسابات وتوزيع الصلاحيات (مدير المؤسسة).',
                    access: 'الإعدادات → <strong>المستخدمون والصلاحيات</strong>.',
                    steps: ['أضف مستخدماً ببريده الرسمي.', 'عيّن الدور (مدير/مستخدم).', 'فعّل المديولات المسموحة لكل شخص.', 'عطّل الحساب عند مغادرة الموظف.', 'راجع الصلاحيات ربع سنوياً.'],
                    tips: ['بريد واحد = حساب واحد.', 'مبدأ أقل صلاحية: امنح فقط ما يحتاجه العمل.']
                },
                {
                    purpose: 'Create accounts and assign permissions (org admin).',
                    access: 'Settings → <strong>Users & permissions</strong>.',
                    steps: ['Add user with official email.', 'Assign role.', 'Enable allowed modules.', 'Disable on employee exit.', 'Review permissions quarterly.'],
                    tips: ['One email per account.', 'Least privilege principle.']
                }),

            guide('user-tasks', 'user-tasks', 'fa-tasks', 23, 'modules', 'مهام المستخدمين', 'User Tasks',
                {
                    purpose: 'متابعة المهام المسندة وتحديث حالة الإنجاز.',
                    access: 'القائمة → <strong>مهام المستخدمين</strong>.',
                    steps: ['اعرض قائمة المهام المسندة لك أو لفريقك.', 'افتح المهمة لقراءة التفاصيل والموعد النهائي.', 'حدّث الحالة (قيد التنفيذ / مكتملة).', 'أضف ملاحظات عند التأخير.', 'استخدم الفلاتر حسب الأولوية أو المسؤول.'],
                    tips: ['أغلق المهام فور الإنجاز لدقة مؤشرات الأداء.']
                },
                {
                    purpose: 'Track assigned tasks and update progress.',
                    access: 'Sidebar → <strong>User Tasks</strong>.',
                    steps: ['View assigned tasks.', 'Open task for details and due date.', 'Update status.', 'Add notes if delayed.', 'Filter by priority or owner.'],
                    tips: ['Close tasks promptly for accurate KPIs.']
                }),

            guide('employees', 'employees', 'fa-database', 24, 'modules', 'قاعدة بيانات الموظفين', 'Employees Database',
                {
                    purpose: 'السجل المركزي للموظفين المستخدم في باقي المديولات.',
                    access: 'القائمة → <strong>قاعدة بيانات الموظفين</strong>.',
                    steps: ['ابحث بالرقم الوظيفي أو الاسم أو القسم.', 'أضف موظفاً جديداً أو عدّل سجلاً موجوداً.', 'حمّل قالب Excel من نافذة الاستيراد.', 'استورد دفعة موظفين ثم راجع الأخطاء.', 'اربط الصورة والقسم والمصنع بدقة.'],
                    tips: ['الرقم الوظيفي الموحّد يسهّل ربط العيادة والتدريب.', 'راجع الاستيراد على دفعات صغيرة أولاً.']
                },
                {
                    purpose: 'Central employee registry for all modules.',
                    access: 'Sidebar → <strong>Employees Database</strong>.',
                    steps: ['Search by ID, name, or department.', 'Add or edit records.', 'Download Excel template.', 'Import batch and review errors.', 'Link photo, department, site.'],
                    tips: ['Consistent employee ID links clinic and training.', 'Test import with small batches.'] }
            ),

            guide('incidents', 'incidents', 'fa-exclamation-triangle', 30, 'modules', 'الحوادث', 'Incidents',
                {
                    purpose: 'توثيق حوادث العمل والإصابات والإجراءات التصحيحية.',
                    access: 'القائمة → <strong>الحوادث</strong>.',
                    steps: ['اضغط <strong>إضافة حادث</strong>.', 'أدخل التاريخ والوقت والموقع والمصنع.', 'صف الحادث والإصابات وعدد المتضررين.', 'حدد الإجراءات الفورية والتصحيحية.', 'أرفق الصور والتقارير.', 'احفظ وتابع حتى الإغلاق.'],
                    tips: ['سجّل فوراً — التأخير يضعف التحقيق.', 'اربط الحادث بالموظفين من قاعدة البيانات عند الإمكان.']
                },
                {
                    purpose: 'Document work incidents, injuries, and corrective actions.',
                    access: 'Sidebar → <strong>Incidents</strong>.',
                    steps: ['Click <strong>Add incident</strong>.', 'Enter date, time, site, plant.', 'Describe incident and injuries.', 'Record immediate and corrective actions.', 'Attach evidence.', 'Save and follow up to closure.'],
                    tips: ['Log immediately.', 'Link employees from the database when possible.'] }
            ),

            guide('nearmiss', 'nearmiss', 'fa-exclamation-circle', 31, 'modules', 'الحوادث الوشيكة', 'Near Miss',
                {
                    purpose: 'توثيق الأحداث التي كادت تسبب إصابة دون وقوع ضرر فعلي.',
                    access: 'القائمة → <strong>الحوادث الوشيكة</strong>.',
                    steps: ['سجّل الحدث فور ملاحظته.', 'صف الموقف الخطر والأسباب الجذرية المحتملة.', 'اقترح إجراءات وقائية.', 'صنّف حسب الخطورة.', 'تابع تنفيذ الإجراءات في <strong>متابعة الإجراءات</strong>.'],
                    tips: ['شجّع الفريق على الإبلاغ دون لوم — يقلل الحوادث الفعلية.']
                },
                {
                    purpose: 'Document events that could have caused harm.',
                    access: 'Sidebar → <strong>Near Miss</strong>.',
                    steps: ['Log when observed.', 'Describe hazard and root causes.', 'Propose preventive actions.', 'Classify severity.', 'Track in <strong>Action Tracking</strong>.'],
                    tips: ['Promote no-blame reporting.'] }
            ),

            guide('ptw', 'ptw', 'fa-id-card', 32, 'modules', 'تصاريح العمل (PTW)', 'Permit to Work',
                {
                    purpose: 'التحكم في أعمال عالية المخاطر (حرارة، ارتفاعات، أعمال كهربائية، إلخ).',
                    access: 'القائمة → <strong>تصاريح العمل</strong>.',
                    steps: ['أنشئ تصريحاً جديداً واختر نوع العمل.', 'حدد الموقع والفريق والمدة.', 'أرفق تقييم المخاطر إن وُجد.', 'احصل على موافقات المسؤولين بالترتيب.', 'لا تبدأ العمل قبل اكتمال الموافقات.', 'أغلق التصريح بعد انتهاء العمل.'],
                    tips: ['اربط التصريح بـ <strong>جهات الإصدار</strong> إن كانت مؤسستك تستخدمها.']
                },
                {
                    purpose: 'Control high-risk work activities.',
                    access: 'Sidebar → <strong>Permit to Work</strong>.',
                    steps: ['Create permit and select work type.', 'Set location, team, duration.', 'Attach risk assessment.', 'Obtain approvals in order.', 'Do not start until approved.', 'Close permit after work.'],
                    tips: ['Link to <strong>Issuing Authorities</strong> if used.'] }
            ),

            guide('issuing-authorities', 'issuing-authorities', 'fa-stamp', 33, 'modules', 'جهات الإصدار', 'Issuing Authorities',
                {
                    purpose: 'إدارة الجهات المعتمدة لإصدار أو اعتماد التصاريح والوثائق.',
                    access: 'القائمة → <strong>جهات الإصدار</strong>.',
                    steps: ['أضف جهة إصدار (اسم، نوع، جهة اتصال).', 'اربط الجهة بتصاريح العمل أو الوثائق.', 'حدّث حالة الاعتماد وتواريخ الانتهاء.', 'راجع القائمة دورياً لإزالة الجهات الملغاة.'],
                    tips: ['وحّد أسماء الجهات لتسهيل التقارير.']
                },
                {
                    purpose: 'Manage authorities that issue or approve permits/documents.',
                    access: 'Sidebar → <strong>Issuing Authorities</strong>.',
                    steps: ['Add authority record.', 'Link to PTW or legal docs.', 'Update accreditation and expiry.', 'Review list periodically.'],
                    tips: ['Standardize authority names for reporting.'] }
            ),

            guide('training', 'training', 'fa-graduation-cap', 34, 'modules', 'التدريب', 'Training',
                {
                    purpose: 'تخطيط الدورات وتسجيل الحضور والشهادات.',
                    access: 'القائمة → <strong>التدريب</strong>.',
                    steps: ['أنشئ برنامجاً أو دورة (عنوان، تاريخ، محاضر).', 'سجّل المتدربين من قاعدة الموظفين.', 'سجّل الحضور يوم التدريب.', 'أرفق شهادات أو مواد الدورة.', 'راجع تقارير الساعات التراكمية.'],
                    tips: ['اربط التدريب الإلزامي (مثل السلامة الأساسية) بكل موظف جديد.']
                },
                {
                    purpose: 'Plan courses, attendance, and certificates.',
                    access: 'Sidebar → <strong>Training</strong>.',
                    steps: ['Create course.', 'Register trainees.', 'Record attendance.', 'Attach certificates.', 'Review cumulative hours.'],
                    tips: ['Link mandatory safety training for new hires.'] }
            ),

            guide('clinic', 'clinic', 'fa-hospital', 35, 'modules', 'العيادة الطبية', 'Occupational Clinic',
                {
                    purpose: 'تسجيل زيارات العيادة والأدوية والإجازات المرضية.',
                    access: 'القائمة → <strong>العيادة الطبية</strong>.',
                    steps: ['افتح سجل زيارة جديدة.', 'ابحث عن الموظف بالرقم الوظيفي.', 'أدخل الشكوى والفحص والتشخيص.', 'سجّل الأدوية المصروفة والكمية.', 'سجّل أي إجازة مرضية ومدتها.', 'احفظ واطبع التقرير إن لزم.'],
                    tips: ['حافظ على سرية السجلات الطبية.', 'لا تشارك بيانات صحية خارج النظام دون إذن.']
                },
                {
                    purpose: 'Log clinic visits, medications, sick leave.',
                    access: 'Sidebar → <strong>Occupational Clinic</strong>.',
                    steps: ['New visit record.', 'Find employee by ID.', 'Enter complaint, exam, diagnosis.', 'Log medications.', 'Record sick leave.', 'Save and print if needed.'],
                    tips: ['Maintain medical confidentiality.'] }
            ),

            guide('fire-equipment', 'fire-equipment', 'fa-fire-extinguisher', 36, 'modules', 'معدات الإطفاء', 'Fire Equipment',
                {
                    purpose: 'جرد ومتابعة فحص طفايات الحريق ومعدات الإطفاء.',
                    access: 'القائمة → <strong>معدات الإطفاء</strong>.',
                    steps: ['سجّل كل طفاية (موقع، نوع، سعة، رقم تسلسلي).', 'جدول الفحص الدوري.', 'سجّل نتيجة كل فحص (سليم / يحتاج صيانة).', 'أنشئ مهمة متابعة للصيانة عند اللزوم.'],
                    tips: ['ضع باركود أو رقم موحّد لكل قطعة.']
                },
                {
                    purpose: 'Inventory and inspection of fire equipment.',
                    access: 'Sidebar → <strong>Fire Equipment</strong>.',
                    steps: ['Register each unit.', 'Schedule periodic inspection.', 'Record pass/fail.', 'Create maintenance follow-up.'],
                    tips: ['Use consistent asset IDs.'] }
            ),

            guide('periodic-inspections', 'periodic-inspections', 'fa-clipboard-check', 37, 'modules', 'الفحوصات الدورية', 'Periodic Inspections',
                {
                    purpose: 'جدولة وتنفيذ فحوصات السلامة الدورية.',
                    access: 'القائمة → <strong>الفحوصات الدورية</strong>.',
                    steps: ['أنشئ خطة فحص (معدات، موقع، تكرار).', 'نفّذ الفحص في الموعد.', 'وثّق الملاحظات والصور.', 'افتح إجراءات تصحيحية للمخالفات.', 'راجع نسب الإغلاق شهرياً.'],
                    tips: ['اربط الفحص بـ <strong>متابعة الإجراءات</strong>.']
                },
                {
                    purpose: 'Schedule and record periodic safety inspections.',
                    access: 'Sidebar → <strong>Periodic Inspections</strong>.',
                    steps: ['Create inspection plan.', 'Execute on schedule.', 'Document findings.', 'Open corrective actions.', 'Review closure rates monthly.'],
                    tips: ['Link to <strong>Action Tracking</strong>.'] }
            ),

            guide('ppe', 'ppe', 'fa-hard-hat', 38, 'modules', 'مهمات الوقاية الشخصية', 'PPE',
                {
                    purpose: 'إدارة مخزون مهمات الوقاية وصرفها للموظفين.',
                    access: 'القائمة → <strong>مهمات الوقاية الشخصية</strong>.',
                    steps: ['عرّف أنواع المهمات في المخزون.', 'سجّل الكميات والحد الأدنى.', 'صرف للموظف مع توقيع أو تأكيد استلام.', 'راجع الاستهلاك الشهري.', 'أعد الطلب قبل نفاد المخزون.'],
                    tips: ['اربط الصرف بالرقم الوظيفي.']
                },
                {
                    purpose: 'PPE stock and issuance.',
                    access: 'Sidebar → <strong>PPE</strong>.',
                    steps: ['Define PPE types.', 'Set stock levels.', 'Issue to employee with receipt.', 'Review monthly usage.', 'Reorder before stockout.'],
                    tips: ['Link issuance to employee ID.'] }
            ),

            guide('violations', 'violations', 'fa-ban', 39, 'modules', 'المخالفات', 'Violations',
                {
                    purpose: 'توثيق مخالفات السلامة والجزاءات والمتابعة.',
                    access: 'القائمة → <strong>المخالفات</strong>.',
                    steps: ['سجّل المخالفة (شخص، موقع، وصف، تاريخ).', 'صنّف الخطورة.', 'سجّل الإجراء المتخذ.', 'تابع حتى الإغلاق.', 'استخدم التقارير لتحليل التكرار.'],
                    tips: ['وحّد معايير التصنيف بين المشرفين.']
                },
                {
                    purpose: 'Document safety violations and penalties.',
                    access: 'Sidebar → <strong>Violations</strong>.',
                    steps: ['Log violation.', 'Classify severity.', 'Record action taken.', 'Follow to closure.', 'Analyze trends.'],
                    tips: ['Standardize classification.'] }
            ),

            guide('contractors', 'contractors', 'fa-users', 40, 'modules', 'المقاولين', 'Contractors',
                {
                    purpose: 'إدارة بيانات المقاولين وعمالهم ووثائقهم.',
                    access: 'القائمة → <strong>المقاولين</strong>.',
                    steps: ['أضف مقاولاً (اسم، نشاط، جهة اتصال).', 'سجّل العمال التابعين.', 'ارفع التصاريح والشهادات والتواريخ.', 'راجع صلاحية الوثائق قبل الدخول للموقع.', 'سجّل التقييمات الدورية.'],
                    tips: ['منع الدخول عند انتهاء شهادة السلامة أو التأمين.']
                },
                {
                    purpose: 'Manage contractors, workers, documents.',
                    access: 'Sidebar → <strong>Contractors</strong>.',
                    steps: ['Add contractor.', 'Register workers.', 'Upload permits and certs.', 'Verify before site access.', 'Record evaluations.'],
                    tips: ['Block access when certs expire.'] }
            ),

            guide('behavior-monitoring', 'behavior-monitoring', 'fa-user-check', 41, 'modules', 'مراقبة السلوكيات', 'Behavior Monitoring',
                {
                    purpose: 'رصد السلوكيات الآمنة وغير الآمنة لتعزيز ثقافة السلامة.',
                    access: 'القائمة → <strong>مراقبة السلوكيات</strong>.',
                    steps: ['سجّل ملاحظة سلوك (آمن / غير آمن).', 'حدد الموقع والوقت والأشخاص المعنيين.', 'صف السلوك والظروف.', 'اقترح تعزيزاً أو تصحيحاً.', 'راجع الإحصائيات في الاجتماعات.'],
                    tips: ['ركّز على السلوك وليس الشخص.']
                },
                {
                    purpose: 'Observe safe and unsafe behaviors.',
                    access: 'Sidebar → <strong>Behavior Monitoring</strong>.',
                    steps: ['Log observation.', 'Set location, time, people.', 'Describe behavior.', 'Suggest reinforcement or correction.', 'Review stats in meetings.'],
                    tips: ['Focus on behavior not blame.'] }
            ),

            guide('chemical-safety', 'chemical-safety', 'fa-flask', 42, 'modules', 'السلامة الكيميائية', 'Chemical Safety',
                {
                    purpose: 'إدارة المواد الكيميائية وبطاقات السلامة (SDS).',
                    access: 'القائمة → <strong>السلامة الكيميائية</strong>.',
                    steps: ['سجّل المادة (اسم، CAS، موقع التخزين).', 'ارفع بطاقة SDS محدثة.', 'حدد مخاطر التعامل والتخزين.', 'سجّل الكميات والحركات.', 'راجع المواد منتهية الصلاحية.'],
                    tips: ['وفّر SDS للعاملين عند نقطة الاستخدام.']
                },
                {
                    purpose: 'Chemicals and SDS management.',
                    access: 'Sidebar → <strong>Chemical Safety</strong>.',
                    steps: ['Register chemical.', 'Upload current SDS.', 'Define handling/storage hazards.', 'Log quantities.', 'Review expiry.'],
                    tips: ['SDS available at point of use.'] }
            ),

            guide('daily-observations', 'daily-observations', 'fa-eye', 43, 'modules', 'الملاحظات اليومية', 'Daily Observations',
                {
                    purpose: 'تسجيل ملاحظات السلامة اليومية في المصانع والمواقع.',
                    access: 'القائمة → <strong>الملاحظات اليومية</strong>.',
                    steps: ['أنشئ ملاحظة يومية جديدة.', 'اختر المصنع/المنطقة.', 'صف الملاحظة (إيجابية أو تحتاج إجراء).', 'أرفق صوراً إن أمكن.', 'حوّل الملاحظات الخطرة إلى إجراء متابعة.'],
                    tips: ['شجّع المشرفين على تسجيل ملاحظة واحدة يومياً على الأقل.']
                },
                {
                    purpose: 'Daily safety observations at sites.',
                    access: 'Sidebar → <strong>Daily Observations</strong>.',
                    steps: ['New observation.', 'Select plant/area.', 'Describe finding.', 'Attach photos.', 'Escalate risks to actions.'],
                    tips: ['Aim for at least one observation per supervisor per day.'] }
            ),

            guide('iso', 'iso', 'fa-certificate', 44, 'modules', 'نظام ISO', 'ISO Management',
                {
                    purpose: 'متابعة متطلبات أنظمة ISO والوثائق المرتبطة.',
                    access: 'القائمة → <strong>نظام ISO</strong>.',
                    steps: ['عرّف المعايير أو البنود المطلوبة.', 'اربط الوثائق والسجلات.', 'سجّل نتائج المراجعات الداخلية.', 'تابع الإجراءات غير المطابقة.', 'جهّز تقارير التدقيق.'],
                    tips: ['اربط ISO مع <strong>الوثائق القانونية</strong> و<strong>متابعة الإجراءات</strong>.']
                },
                {
                    purpose: 'Track ISO requirements and records.',
                    access: 'Sidebar → <strong>ISO Management</strong>.',
                    steps: ['Define clauses.', 'Link documents.', 'Record internal audits.', 'Track nonconformities.', 'Prepare audit reports.'],
                    tips: ['Link with Legal Documents and Action Tracking.'] }
            ),

            guide('emergency', 'emergency', 'fa-bell', 45, 'modules', 'تنبيهات الطوارئ', 'Emergency Alerts',
                {
                    purpose: 'إرسال تنبيهات طوارئ سريعة للمستخدمين المعنيين.',
                    access: 'القائمة → <strong>تنبيهات الطوارئ</strong>.',
                    steps: ['أنشئ تنبيهاً (نوع الطوارئ، الرسالة).', 'حدد الجمهور أو الموقع.', 'أرسل التنبيه.', 'تابع الإقرارات بالاستلام إن وُجدت.', 'وثّق الإجراءات بعد الطوارئ.'],
                    tips: ['استخدم فقط في حالات طوارئ حقيقية أو تدريبات معلنة.']
                },
                {
                    purpose: 'Send rapid emergency notifications.',
                    access: 'Sidebar → <strong>Emergency Alerts</strong>.',
                    steps: ['Create alert.', 'Select audience/site.', 'Send.', 'Track acknowledgments.', 'Document post-emergency actions.'],
                    tips: ['Real emergencies or announced drills only.'] }
            ),

            guide('risk-assessment', 'risk-assessment', 'fa-balance-scale', 46, 'modules', 'تقييم المخاطر', 'Risk Assessment',
                {
                    purpose: 'تحديد المخاطر وتقديرها ووضع ضوابط التخفيف.',
                    access: 'القائمة → <strong>تقييم المخاطر</strong>.',
                    steps: ['عرّف النشاط أو المهمة.', 'حدد المخاطر (HAZID).', 'قدّر الاحتمالية والشدة.', 'حدد الضوابط الحالية والمطلوبة.', 'راجع التقييم عند تغيير العملية.'],
                    tips: ['اربط التقييم بتصاريح العمل للأعمال عالية الخطورة.']
                },
                {
                    purpose: 'Identify, assess, and mitigate risks.',
                    access: 'Sidebar → <strong>Risk Assessment</strong>.',
                    steps: ['Define activity.', 'Identify hazards.', 'Rate likelihood/severity.', 'Define controls.', 'Review when process changes.'],
                    tips: ['Link to PTW for high-risk work.'] }
            ),

            guide('sop-jha', 'sop-jha', 'fa-tasks', 47, 'modules', 'إجراءات العمل وتحليل المهام', 'SOP & JHA',
                {
                    purpose: 'توثيق إجراءات التشغيل الآمنة (SOP) وتحليل مخاطر المهام (JHA).',
                    access: 'القائمة → <strong>إجراءات العمل وتحليل المهام</strong>.',
                    steps: ['أنشئ SOP (خطوات آمنة، معدات، PPE).', 'أنشئ JHA لمهمة محددة.', 'راجع مع العاملين المعنيين.', 'اعتمد الإصدار وتاريخ المراجعة.', 'وزّع على المواقع المعنية.'],
                    tips: ['حدّث SOP/JHA بعد أي حادث أو تغيير معدات.']
                },
                {
                    purpose: 'Safe operating procedures and job hazard analysis.',
                    access: 'Sidebar → <strong>SOP & JHA</strong>.',
                    steps: ['Create SOP.', 'Create JHA for task.', 'Review with workers.', 'Approve version/date.', 'Distribute to sites.'],
                    tips: ['Update after incidents or equipment changes.'] }
            ),

            guide('legal-documents', 'legal-documents', 'fa-file-contract', 48, 'modules', 'الوثائق القانونية', 'Legal Documents',
                {
                    purpose: 'أرشفة التراخيص والوثائق التنظيمية مع تنبيهات الانتهاء.',
                    access: 'القائمة → <strong>الوثائق القانونية</strong>.',
                    steps: ['أضف وثيقة (نوع، رقم، جهة إصدار).', 'حدد تاريخ البداية والانتهاء.', 'ارفع نسخة PDF.', 'فعّل التذكير قبل الانتهاء.', 'راجع الوثائق المنتهية شهرياً.'],
                    tips: ['اربط الوثيقة بجهة الإصدار إن وُجدت.']
                },
                {
                    purpose: 'Archive licenses and regulatory documents.',
                    access: 'Sidebar → <strong>Legal Documents</strong>.',
                    steps: ['Add document.', 'Set validity dates.', 'Upload PDF.', 'Enable expiry reminders.', 'Monthly expiry review.'],
                    tips: ['Link to issuing authority when applicable.'] }
            ),

            guide('sustainability', 'sustainability', 'fa-leaf', 49, 'modules', 'الاستدامة', 'Sustainability',
                {
                    purpose: 'متابعة استهلاك الموارد والمؤشرات البيئية.',
                    access: 'القائمة → <strong>الاستدامة</strong>.',
                    steps: ['سجّل قراءات المياه/الكهرباء/الغاز دورياً.', 'قارن بالفترة السابقة.', 'حدد أهداف التخفيض.', 'وثّق المشاريع البيئية.', 'صدّر التقارير للإدارة.'],
                    tips: ['سجّل القراءات في نفس اليوم من كل شهر للدقة.']
                },
                {
                    purpose: 'Track resource use and environmental KPIs.',
                    access: 'Sidebar → <strong>Sustainability</strong>.',
                    steps: ['Log utility readings.', 'Compare periods.', 'Set reduction targets.', 'Document projects.', 'Export management reports.'],
                    tips: ['Read meters same day each month.'] }
            ),

            guide('safety-budget', 'safety-budget', 'fa-wallet', 50, 'modules', 'ميزانية السلامة', 'Safety Budget',
                {
                    purpose: 'تخطيط ومتابعة ميزانية السلامة مقابل الإنفاق الفعلي.',
                    access: 'القائمة → <strong>ميزانية السلامة</strong>.',
                    steps: ['عرّف بنود الميزانية السنوية.', 'سجّل الاعتمادات والمنصرف.', 'قارن الفعلي بالمخطط شهرياً.', 'وثّق التجاوزات وأسبابها.', 'قدّم تقريراً للإدارة.'],
                    tips: ['اربط البنود بمشتريات PPE والتدريب والصيانة.']
                },
                {
                    purpose: 'Plan and track safety budget vs actual.',
                    access: 'Sidebar → <strong>Safety Budget</strong>.',
                    steps: ['Define annual line items.', 'Record allocations and spend.', 'Monthly variance review.', 'Document overruns.', 'Report to management.'],
                    tips: ['Link to PPE, training, maintenance.'] }
            ),

            guide('safety-performance-kpis', 'safety-performance-kpis', 'fa-gauge-high', 51, 'modules', 'مؤشرات الأداء', 'Safety KPIs',
                {
                    purpose: 'لوحات مؤشرات أداء السلامة والخطة السنوية.',
                    access: 'القائمة → <strong>مؤشرات الأداء</strong>.',
                    steps: ['راجع المؤشرات المعرفة (LTIR، أيام بلا حوادث، إلخ).', 'حدّث الأهداف السنوية.', 'أدخل القيم الفعلية شهرياً.', 'حلّل الانحرافات.', 'شارك اللوحة في اجتماعات HSE.'],
                    tips: ['تأكد من إدخال الحوادث والتدريب في موعده لدقة المؤشرات.']
                },
                {
                    purpose: 'Safety KPI dashboards and annual plan.',
                    access: 'Sidebar → <strong>Safety KPIs</strong>.',
                    steps: ['Review defined KPIs.', 'Set annual targets.', 'Enter actuals monthly.', 'Analyze variances.', 'Share in HSE meetings.'],
                    tips: ['Timely incident/training data improves accuracy.'] }
            ),

            guide('safety-health-management', 'safety-health-management', 'fa-user-shield', 52, 'modules', 'إدارة السلامة والصحة', 'Safety & Health Management',
                {
                    purpose: 'هيكل فريق السلامة والاجتماعات والخطط الاستراتيجية.',
                    access: 'القائمة → <strong>إدارة السلامة والصحة</strong>.',
                    steps: ['عرّف أعضاء فريق السلامة وأدوارهم.', 'جدول اجتماعات HSE.', 'وثّق محاضر الاجتماعات والقرارات.', 'تابع تنفيذ القرارات.', 'اربط الخطة السنوية بالمؤشرات.'],
                    tips: ['اجعل مسؤولاً لكل بند خطة.']
                },
                {
                    purpose: 'Safety team structure, meetings, strategic plans.',
                    access: 'Sidebar → <strong>Safety & Health Management</strong>.',
                    steps: ['Define team and roles.', 'Schedule HSE meetings.', 'Record minutes/decisions.', 'Track implementation.', 'Link annual plan to KPIs.'],
                    tips: ['Assign owner per plan item.'] }
            ),

            guide('action-tracking', 'action-tracking', 'fa-clipboard-list', 53, 'modules', 'سجل متابعة الإجراءات', 'Action Tracking',
                {
                    purpose: 'متابعة الإجراءات التصحيحية والوقائية حتى الإغلاق.',
                    access: 'القائمة → <strong>سجل متابعة الإجراءات</strong>.',
                    steps: ['أنشئ إجراءاً (مصدر، وصف، مسؤول، موعد).', 'حدّث نسبة الإنجاز.', 'أرفق إثبات الإغلاق.', 'راجع المتأخرة أسبوعياً.', 'أغلق الإجراء بعد التحقق.'],
                    tips: ['مصدر الإجراء قد يكون فحصاً أو حادثاً أو ملاحظة يومية.']
                },
                {
                    purpose: 'Track CAPA until closure.',
                    access: 'Sidebar → <strong>Action Tracking</strong>.',
                    steps: ['Create action with owner/due date.', 'Update progress.', 'Attach closure evidence.', 'Weekly overdue review.', 'Close after verification.'],
                    tips: ['Sources: inspections, incidents, observations.'] }
            ),

            guide('change-management', 'change-management', 'fa-exchange-alt', 54, 'modules', 'إدارة التغيرات', 'Change Management',
                {
                    purpose: 'اعتماد التغييرات التي قد تؤثر على السلامة.',
                    access: 'القائمة → <strong>إدارة التغيرات</strong>.',
                    steps: ['قدّم طلب تغيير (وصف، سبب، تأثير متوقع).', 'أجرِ تقييم مخاطر للتغيير.', 'احصل على موافقات الجهات المعنية.', 'نفّذ التغيير ووثّقه.', 'راجع بعد التنفيذ (MOC follow-up).'],
                    tips: ['لا تُطبّق تغييرات المعدات أو العمليات دون اعتماد.']
                },
                {
                    purpose: 'Approve safety-impacting changes.',
                    access: 'Sidebar → <strong>Change Management</strong>.',
                    steps: ['Submit change request.', 'Risk assess the change.', 'Obtain approvals.', 'Implement and document.', 'Post-implementation review.'],
                    tips: ['No process/equipment change without approval.'] }
            ),

            guide('ai-assistant', 'ai-assistant', 'fa-robot', 55, 'modules', 'المساعد الذكي', 'AI Assistant',
                {
                    purpose: 'مساعدة في أسئلة السلامة واستخراج ملخصات من سجلات النظام.',
                    access: 'القائمة → <strong>المساعد الذكي</strong>.',
                    steps: ['افتح المساعد واكتب سؤالك بوضوح.', 'حدد المديول أو الفترة إن طُلب.', 'راجع الإجابة وتحقق من المصدر.', 'لا تعتمد على الإجابة دون مراجعة بشرية للقرارات الحرجة.'],
                    tips: ['لا تُدخل بيانات سرية غير ضرورية في المحادثة.', 'الإجابات استرشادية وليست بديلاً عن السياسات الرسمية.']
                },
                {
                    purpose: 'HSE Q&A and summaries from system data.',
                    access: 'Sidebar → <strong>AI Assistant</strong>.',
                    steps: ['Open assistant and ask clearly.', 'Specify module/period if asked.', 'Verify answers against source records.', 'Human review for critical decisions.'],
                    tips: ['Avoid unnecessary secrets in chat.', 'Answers are guidance not official policy.'] }
            ),

            guide('settings', 'settings', 'fa-cog', 90, 'admin', 'الإعدادات', 'Settings',
                {
                    purpose: 'إعدادات المؤسسة والتكامل والصلاحيات (مدير المؤسسة).',
                    access: 'القائمة → <strong>الإعدادات</strong>.',
                    steps: ['حدّث بيانات الشركة والشعار.', 'اضبط إعدادات النماذج والمواقع.', 'أدر الصلاحيات والمستخدمين.', 'راجع التكاملات والنسخ الاحتياطي.', 'تابع سجل النشاط والإصدارات.'],
                    tips: ['تعديل محتوى مركز المساعدة من لوحة مدير المنصّة فقط.']
                },
                {
                    purpose: 'Org settings, integrations, permissions (org admin).',
                    access: 'Sidebar → <strong>Settings</strong>.',
                    steps: ['Update company profile/logo.', 'Form/site settings.', 'Manage users/permissions.', 'Review integrations/backups.', 'Activity log and versions.'],
                    tips: ['Help Center content is edited in platform console only.'] }
            ),

            guide('help', 'help', 'fa-circle-question', 91, 'modules', 'مركز المساعدة', 'Help Center',
                {
                    purpose: 'الدليل الشامل لاستخدام النظام.',
                    access: 'القائمة → <strong>مركز المساعدة والدعم</strong>.',
                    steps: ['استخدم البحث في الأعلى للعثور على موضوع.', 'تصفح الأقسام: بدء سريع، سياسات، أسئلة شائعة، مديولات.', 'اضغط على مقال لقراءة التفاصيل.', 'ارجع للفهرس من القائمة الجانبية داخل المركز.'],
                    tips: ['محتوى هذا المركز يُدار من مدير النظام (المنصّة).']
                },
                {
                    purpose: 'Complete system user guide.',
                    access: 'Sidebar → <strong>Help Center</strong>.',
                    steps: ['Use search at top.', 'Browse categories: getting started, policies, FAQ, modules.', 'Click an article to read.', 'Use in-center index to navigate.'],
                    tips: ['Content managed by platform administrator.'] }
            ),

            guide('support', '', 'fa-headset', 99, 'getting-started', 'الدعم الفني', 'Technical Support',
                {
                    purpose: 'الحصول على مساعدة إضافية.',
                    access: 'مدير المؤسسة → تصعيد لفريق المنصّة عند الحاجة.',
                    steps: ['جمع معلومات المشكلة (المستخدم، المتصفح، الخطوات).', 'لقطة شاشة أو رسالة الخطأ.', 'تواصل مع مدير النظام في مؤسستك.', 'للأعطال المنصّة يتولى المدير التواصل مع دعم HSEHub 360.'],
                    tips: ['اذكر رقم الإصدار الظاهر في التطبيق عند الإبلاغ.']
                },
                {
                    purpose: 'Additional assistance.',
                    access: 'Org admin escalates to platform support.',
                    steps: ['Gather issue details.', 'Screenshot or error text.', 'Contact org admin.', 'Platform issues escalated to HSEHub 360.'],
                    tips: ['Include app version from the UI.'] }
            )
        ];
    }

    global.HelpDefaultContentData = { getExpandedSections };
})(typeof window !== 'undefined' ? window : globalThis);
