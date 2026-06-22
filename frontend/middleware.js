/**
 * Edge middleware: social crawlers (WhatsApp/Facebook) get lightweight share-preview
 * instead of the full index.html (static index wins over vercel.json rewrites).
 */
export default function middleware(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/') {
        return;
    }

    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    const isSocialBot = /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|applebot|embedly|quora link preview|showyoubot|outbrain|pinterest|vkshare|w3c_validator/i.test(ua);

    if (!isSocialBot) {
        return;
    }

    const target = new URL('/share-preview', request.url);
    target.searchParams.set('v', 'hsehub360');
    return Response.redirect(target, 307);
}

export const config = {
    matcher: ['/'],
};
