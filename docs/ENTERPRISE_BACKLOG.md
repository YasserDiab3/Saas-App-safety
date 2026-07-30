# HSEHub 360 — Enterprise backlog (post 6-month plan)

هذه البنود **خارج نطاق خطة الستة أشهر**. ما يلي يوضح الحالة بصراحة.

| بند | الحالة | ماذا يوجد الآن |
|-----|--------|----------------|
| SSO/SAML/OIDC + SCIM | أساس منتج جاهز + أدوات تفعيل | إعدادات + زر Login + `sso-activate.mjs` + `scim-v2` — **حاجز: ترقية Supabase إلى Pro لتفعيل `saml_enabled` ثم تسجيل IdP** |
| بوابة مقاولين مستقلة | غير مكتمل | موديول مقاولين داخل التطبيق فقط — ليست بوابة منفصلة |
| Offline native app | غير مكتمل | PWA حالية — ليس تطبيق متاجر أصلي |
| SOC2 / ISO27001 برنامج رسمي | أساس منتج جاهز | مركز جاهزية في الإعدادات + Evidence + `docs/COMPLIANCE_SOC2_ISO27001.md` — **الشهادة تدقيق خارجي** |
| موصلات Power BI / ERP | أساس منتج جاهز | Edge `bi-export` + كتالوج webhooks + `docs/POWER_BI_ERP_CONNECTORS.md` — **ليست موصلات SAP/Oracle أصلية** |
| لغات إضافية + industry packs | أساس منتج جاهز | ar/en/fr/tr (مفاتيح أساسية) + حزم Construction / Oil&Gas — `docs/INDUSTRY_PACKS.md` |
| توحيد UX لكل الشاشات | أساس منتج جاهز | tokens + `SaaSUiShell` + توحيد empty states على الشاشات الحرجة — ليس redesign لكل موديول |
| Webhooks منصة كاملة | جزئي | إعدادات + fan-out من `notify-dispatch` + كتالوج أحداث موثّق |

عند الحاجة التجارية لشهادة رسمية أو تكامل ERP مخصص أو بوابة مقاولين مستقلة، تُفتح مشاريع منفصلة.
