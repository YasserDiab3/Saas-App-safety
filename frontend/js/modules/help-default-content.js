/**
 * help-default-content.js — bundled default help articles (ar/en).
 * Used when HelpCenter sheet is empty or unreachable.
 */
(function (global) {
    function getDefaultHelpSections() {
        if (global.HelpDefaultContentData && typeof global.HelpDefaultContentData.getExpandedSections === 'function') {
            return global.HelpDefaultContentData.getExpandedSections();
        }
        return [];
    }

    global.HelpDefaultContent = {
        getDefaultHelpSections,
        buildDefaultPayload() {
            return {
                id: 'default',
                sections: getDefaultHelpSections(),
                updatedAt: new Date().toISOString()
            };
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
