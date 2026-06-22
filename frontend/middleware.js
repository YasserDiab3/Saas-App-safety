/**
 * Edge middleware: link-preview crawlers get share-preview (HSEHub 360 meta).
 * Must NOT redirect WhatsApp/Facebook in-app browsers — they include "WhatsApp"
 * in UA but also send a full Mozilla/WebKit string (real users on mobile).
 */
function isLinkPreviewBot(userAgent) {
    const ua = (userAgent || '').toLowerCase();
    if (!ua) return false;

    const isFullBrowser = /mozilla\/5\.0/.test(ua) &&
        /applewebkit|chrome|safari|crios|fxios|edgios|opios/.test(ua);

    // Facebook link unfurl (may include Mozilla compatible)
    if (/facebookexternalhit|facebot/.test(ua)) return true;

    // WhatsApp in-app WebView on iOS/Android — real user, not preview bot
    if (isFullBrowser) return false;

    // Bare WhatsApp fetcher, e.g. "WhatsApp/2.23.20.0"
    if (/whatsapp/.test(ua)) return true;

    // Other preview bots without a full browser signature
    if (!/mozilla\/5\.0/.test(ua)) {
        return /twitterbot|linkedinbot|slackbot|telegrambot|discordbot|embedly|pinterest|showyoubot|outbrain|vkshare|w3c_validator/i.test(ua);
    }

    return false;
}

const SESSION_COOKIE = 'hse_has_session';

export default function middleware(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/') return;

    const ua = request.headers.get('user-agent') || '';

    if (isLinkPreviewBot(ua)) {
        const target = new URL('/share-preview', request.url);
        target.searchParams.set('v', 'hsehub360');
        return Response.redirect(target, 307);
    }

    // Guests: skip ~700KB index.html on mobile — send straight to lightweight /login
    const hasSession = request.cookies.get(SESSION_COOKIE)?.value === '1';
    if (!hasSession) {
        const login = new URL('/login', request.url);
        const next = url.pathname + url.search;
        if (next && next !== '/') login.searchParams.set('next', next);
        return Response.redirect(login, 302);
    }
}

export const config = {
    matcher: ['/'],
};
