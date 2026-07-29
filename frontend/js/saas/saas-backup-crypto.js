/**
 * saas-backup-crypto.js — AES-GCM + PBKDF2 for .hsebackup files.
 * Passphrase never leaves the browser.
 */
(function (global) {
    const MAGIC = 'HSEHUB_BACKUP';
    const FORMAT_VERSION = 1;
    const ITERATIONS = 210000;
    const SALT_BYTES = 16;
    const IV_BYTES = 12;

    function toB64(buf) {
        const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
        let s = '';
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }

    function fromB64(b64) {
        const s = atob(String(b64 || ''));
        const out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out;
    }

    function requireSubtle() {
        if (!global.crypto || !global.crypto.subtle) {
            throw new Error('WebCrypto غير متاح في هذا المتصفح');
        }
        return global.crypto.subtle;
    }

    async function deriveKey(passphrase, saltBytes) {
        const subtle = requireSubtle();
        const enc = new TextEncoder();
        const baseKey = await subtle.importKey(
            'raw',
            enc.encode(String(passphrase || '')),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: ITERATIONS,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptJson(obj, passphrase) {
        const pw = String(passphrase || '');
        if (pw.length < 8) throw new Error('عبارة المرور يجب أن تكون 8 أحرف على الأقل');
        const subtle = requireSubtle();
        const salt = global.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const iv = global.crypto.getRandomValues(new Uint8Array(IV_BYTES));
        const key = await deriveKey(pw, salt);
        const plain = new TextEncoder().encode(JSON.stringify(obj));
        const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
        return {
            magic: MAGIC,
            formatVersion: FORMAT_VERSION,
            kdf: 'PBKDF2-SHA256',
            iterations: ITERATIONS,
            salt: toB64(salt),
            iv: toB64(iv),
            ciphertext: toB64(cipher)
        };
    }

    async function decryptToJson(envelope, passphrase) {
        const pw = String(passphrase || '');
        if (!pw) throw new Error('أدخل عبارة المرور');
        if (!envelope || typeof envelope !== 'object') throw new Error('ملف النسخة غير صالح');
        if (envelope.magic !== MAGIC) throw new Error('هذا ليس ملف نسخة HSEHub صالحاً');
        if (Number(envelope.formatVersion) !== FORMAT_VERSION) {
            throw new Error('إصدار ملف النسخة غير مدعوم');
        }
        const subtle = requireSubtle();
        const salt = fromB64(envelope.salt);
        const iv = fromB64(envelope.iv);
        const cipher = fromB64(envelope.ciphertext);
        const key = await deriveKey(pw, salt);
        let plainBuf;
        try {
            plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
        } catch (_e) {
            throw new Error('فشل فك التشفير — تحقق من عبارة المرور');
        }
        const text = new TextDecoder().decode(plainBuf);
        const payload = JSON.parse(text);
        if (!payload || payload.magic !== MAGIC) throw new Error('محتوى النسخة تالف');
        return payload;
    }

    function downloadJsonFile(obj, filename) {
        const blob = new Blob([JSON.stringify(obj)], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || ('hsehub-backup-' + new Date().toISOString().slice(0, 10) + '.hsebackup');
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 500);
    }

    async function readJsonFile(file) {
        const text = await file.text();
        return JSON.parse(text);
    }

    global.SaaSBackupCrypto = {
        MAGIC,
        FORMAT_VERSION,
        encryptJson,
        decryptToJson,
        downloadJsonFile,
        readJsonFile
    };
})(window);
