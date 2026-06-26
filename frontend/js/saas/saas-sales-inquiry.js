/**
 * saas-sales-inquiry.js — guest account / quote request from login page.
 */
(function (global) {
    function mapError(message) {
        const m = String(message || '').toLowerCase();
        if (m.includes('full_name')) return 'inq_err_name';
        if (m.includes('org_name')) return 'inq_err_org';
        if (m.includes('email')) return 'inq_err_email';
        if (m.includes('expected_users')) return 'inq_err_users';
        if (m.includes('too many')) return 'inq_err_rate';
        if (/failed to fetch|network|load failed/i.test(m)) return 'inq_err_network';
        return 'inq_err_generic';
    }

    const SalesInquiry = {
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
