/**
 * saas-config.js — public SaaS configuration.
 *
 * The ANON key is a PUBLIC client key (safe in the browser). All access is
 * protected by Postgres Row-Level Security keyed to the JWT's tenant_id.
 * NEVER put the service_role key here.
 */
window.SAAS_CONFIG = {
    supabaseUrl: 'https://tbkajjarkqhsdiabufjv.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRia2FqamFya3Foc2RpYWJ1Zmp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzM1ODEsImV4cCI6MjA5NjM0OTU4MX0.gTXGYbBw8UOS0gGrrpjUKkxx5dG5qJmDuLybZOem9uE',

    // عند true: الواجهة تستخدم Supabase بدل Apps Script.
    // الهجرات مطبَّقة والاتصال مُختبَر E2E → مُفعّل لاختبار SaaS على Vercel.
    useSupabaseBackend: true,

    // شعار المنصّة الافتراضي (يظهر قبل رفع شعار المؤسسة)
    appName: 'QHSSE Consultant',
    defaultLogoUrl: 'assets/brand/logo.png',
    defaultFaviconUrl: 'assets/brand/favicon.png'
};
