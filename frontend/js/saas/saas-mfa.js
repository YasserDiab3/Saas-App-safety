/**
 * saas-mfa.js — TOTP MFA helpers (enroll, verify, AAL check).
 */
(function (global) {
  const ENROLL_STORAGE_KEY = 'hse_mfa_enroll_pending';
  const ENROLL_TTL_MS = 30 * 60 * 1000;

  function normalizeTotpCode(code) {
    return String(code || '').replace(/\s+/g, '').replace(/\D/g, '');
  }

  function uniqueFriendlyName(email) {
    const base = email ? email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '') : 'user';
    return ('HSEHub360-' + base + '-' + Date.now().toString(36)).slice(0, 64);
  }

  function mapMfaError(err) {
    const msg = String(err?.message || err || '');
    if (/invalid totp|invalid code|verification failed/i.test(msg)) {
      return 'رمز غير صحيح. تأكد من مزامنة وقت الجهاز، أو اضغط «إعادة الإعداد» وامسح رمز QR جديداً.';
    }
    if (/already exists|friendly name/i.test(msg)) {
      return 'يوجد إعداد MFA عالق. اضغط «إعادة الإعداد» لحذفه وإنشاء رمز QR جديد.';
    }
    if (/session missing|not authenticated/i.test(msg)) {
      return 'انتهت الجلسة. سجّل الدخول ثم أعد محاولة تفعيل MFA.';
    }
    if (/aal2|assurance/i.test(msg)) {
      return 'لا يمكن إزالة MFA المفعّل بدون رمز صحيح. اطلب من مسؤول المنصّة إعادة تعيين MFA لحسابك.';
    }
    return msg || 'تعذّر التحقق من الرمز';
  }

  function readPendingEnroll() {
    try {
      const raw = sessionStorage.getItem(ENROLL_STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data?.factorId || !data?.secret) return null;
      if (Date.now() - (data.createdAt || 0) > ENROLL_TTL_MS) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function savePendingEnroll(payload) {
    try {
      sessionStorage.setItem(ENROLL_STORAGE_KEY, JSON.stringify({
        ...payload,
        createdAt: Date.now()
      }));
    } catch (_e) { /* ignore */ }
  }

  function clearPendingEnroll() {
    try { sessionStorage.removeItem(ENROLL_STORAGE_KEY); } catch (_e) { /* ignore */ }
  }

  const SaaSMfa = {
    normalizeTotpCode,
    mapMfaError,
    clearPendingEnroll,

    async getAal(client) {
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return data;
    },

    async needsVerification(client) {
      const aal = await this.getAal(client);
      return aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
    },

    async listTotpFactors(client) {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      const fromTotp = data?.totp || [];
      const fromAll = (data?.all || []).filter(f => f.factor_type === 'totp' || f.type === 'totp');
      const map = new Map();
      for (const f of [...fromTotp, ...fromAll]) map.set(f.id, f);
      return [...map.values()];
    },

    async verifiedTotpFactor(client) {
      const factors = await this.listTotpFactors(client);
      return factors.find(f => f.status === 'verified') || null;
    },

    async unenrollFactor(client, factorId) {
      const { error } = await client.auth.mfa.unenroll({ factorId });
      if (error && !/not found|already|does not exist/i.test(error.message || '')) {
        throw error;
      }
    },

    async cleanupTotpFactors(client, opts) {
      const includeVerified = Boolean(opts?.includeVerified);
      const factors = await this.listTotpFactors(client);
      const targets = factors.filter(f => includeVerified || f.status === 'unverified');
      const errors = [];
      for (const f of targets) {
        try {
          await this.unenrollFactor(client, f.id);
        } catch (e) {
          errors.push(e);
        }
      }
      return { removed: targets.length - errors.length, errors, remaining: await this.listTotpFactors(client) };
    },

    async challengeAndVerify(client, factorId, code) {
      const normalized = normalizeTotpCode(code);
      if (normalized.length !== 6) {
        throw new Error('أدخل رمزاً من 6 أرقام');
      }
      if (client.auth.mfa.challengeAndVerify) {
        const { error } = await client.auth.mfa.challengeAndVerify({
          factorId,
          code: normalized
        });
        if (error) throw error;
        return true;
      }
      const { data: ch, error: ce } = await client.auth.mfa.challenge({ factorId });
      if (ce) throw ce;
      const { error: ve } = await client.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: normalized
      });
      if (ve) throw ve;
      return true;
    },

    async verifyTotpCode(client, code) {
      const factors = await this.listTotpFactors(client);
      const verified = factors.filter(f => f.status === 'verified');
      if (!verified.length) {
        throw new Error('لا يوجد MFA مفعّل. افتح /mfa-setup لإكمال التفعيل.');
      }
      let lastErr;
      for (const factor of verified) {
        try {
          await this.challengeAndVerify(client, factor.id, code);
          return true;
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('رمز غير صحيح');
    },

    renderEnrollUi(data) {
      return {
        factorId: data.id,
        qrCode: data.totp?.qr_code || '',
        secret: data.totp?.secret || '',
        uri: data.totp?.uri || ''
      };
    },

    async enrollNewTotp(client, email) {
      const friendlyName = uniqueFriendlyName(email);
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
        issuer: 'HSEHub360'
      });
      if (error) {
        if (/already exists|friendly name/i.test(error.message || '')) {
          await this.cleanupTotpFactors(client, { includeVerified: false });
          const retry = await client.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: uniqueFriendlyName(email),
            issuer: 'HSEHub360'
          });
          if (retry.error) throw retry.error;
          return this.renderEnrollUi(retry.data);
        }
        throw error;
      }
      return this.renderEnrollUi(data);
    },

    async beginTotpEnrollment(client, opts) {
      const email = opts?.email || '';

      const verified = await this.verifiedTotpFactor(client);
      if (verified && !opts?.forceNew) {
        clearPendingEnroll();
        return { status: 'verified', factor: verified };
      }

      const pending = readPendingEnroll();
      if (pending && !opts?.forceNew) {
        const factors = await this.listTotpFactors(client);
        const match = factors.find(f => f.id === pending.factorId && f.status === 'unverified');
        if (match) return { status: 'pending', ...pending };
        clearPendingEnroll();
      }

      await this.cleanupTotpFactors(client, { includeVerified: false });

      const ui = await this.enrollNewTotp(client, email);
      if (!ui.secret) {
        throw new Error('تعذّر إنشاء رمز QR. اضغط «إعادة الإعداد».');
      }
      savePendingEnroll(ui);
      return { status: 'pending', ...ui };
    },

    async resetTotpEnrollment(client, opts) {
      clearPendingEnroll();
      const cleanup = await this.cleanupTotpFactors(client, { includeVerified: false });
      const stillVerified = cleanup.remaining.some(f => f.status === 'verified');
      if (stillVerified) {
        const err = new Error('MFA verified factor requires AAL2 to remove');
        err.code = 'MFA_VERIFIED_STUCK';
        throw err;
      }
      return this.beginTotpEnrollment(client, { ...opts, forceNew: true });
    },

    async confirmEnrollment(client, factorId, code) {
      const factors = await this.listTotpFactors(client);
      const target = factors.find(f => f.id === factorId);
      if (!target) {
        throw new Error('انتهت صلاحية إعداد MFA. اضغط «إعادة الإعداد».');
      }
      if (target.status === 'verified') {
        clearPendingEnroll();
        return true;
      }
      await this.challengeAndVerify(client, factorId, code);
      clearPendingEnroll();
      return true;
    }
  };

  global.SaaSMfa = SaaSMfa;
})(window);
