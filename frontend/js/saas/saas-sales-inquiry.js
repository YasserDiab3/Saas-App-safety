/**
 * saas-sales-inquiry.js — guest account / quote request from login page.
 */
(function (global) {
    const CONSUMER_EMAIL_DOMAINS = new Set([
        'gmail.com', 'googlemail.com',
        'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.com.br', 'yahoo.co.in', 'yahoo.es', 'yahoo.it',
        'ymail.com', 'rocketmail.com',
        'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
        'outlook.com', 'outlook.sa', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it',
        'live.com', 'live.fr', 'live.nl', 'msn.com',
        'icloud.com', 'me.com', 'mac.com',
        'aol.com', 'aim.com',
        'protonmail.com', 'proton.me', 'pm.me', 'tutanota.com', 'tuta.io',
        'mail.com', 'email.com', 'usa.com', 'inbox.com',
        'gmx.com', 'gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch',
        'yandex.com', 'yandex.ru', 'ya.ru',
        'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru',
        'zoho.com', 'fastmail.com', 'hey.com',
        'rediffmail.com', 'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
        'web.de', 't-online.de', 'freenet.de',
        'laposte.net', 'orange.fr', 'free.fr', 'sfr.fr', 'wanadoo.fr',
        'libero.it', 'virgilio.it', 'alice.it',
        'bol.com.br', 'uol.com.br', 'terra.com.br',
        'wp.pl', 'o2.pl', 'interia.pl', 'onet.pl',
        'seznam.cz', 'naver.com', 'daum.net', 'hanmail.net'
    ]);

    function emailDomain(email) {
        const parts = String(email || '').trim().toLowerCase().split('@');
        return parts.length === 2 ? parts[1] : '';
    }

    function isOrganizationEmail(email) {
        const value = String(email || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return false;
        const domain = emailDomain(value);
        if (!domain || CONSUMER_EMAIL_DOMAINS.has(domain)) return false;
        return true;
    }

    function mapError(message) {
        const m = String(message || '').toLowerCase();
        if (m.includes('work email') || m.includes('organization work')) return 'inq_err_work_email';
        if (m.includes('full_name')) return 'inq_err_name';
        if (m.includes('job_title')) return 'inq_err_job';
        if (m.includes('org_name')) return 'inq_err_org';
        if (m.includes('email')) return 'inq_err_email';
        if (m.includes('expected_users')) return 'inq_err_users';
        if (m.includes('too many')) return 'inq_err_rate';
        if (/failed to fetch|network|load failed/i.test(m)) return 'inq_err_network';
        return 'inq_err_generic';
    }

    const SalesInquiry = {
        isOrganizationEmail,

        async submit(payload) {
            await global.SaaS.ready;
            const client = global.SaaS.client();
            if (!client) {
                return { success: false, messageKey: 'inq_err_network' };
            }

            const { data, error } = await client.rpc('api_submit_sales_inquiry', {
                p_payload: payload || {}
            });

            if (error) {
                return { success: false, messageKey: mapError(error.message), raw: error.message };
            }
            if (!data || data.success !== true) {
                return {
                    success: false,
                    messageKey: mapError((data && data.message) || ''),
                    raw: (data && data.message) || ''
                };
            }
            return { success: true, id: data.id };
        }
    };

    global.SaaSSalesInquiry = SalesInquiry;
})(window);
