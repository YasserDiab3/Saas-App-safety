/**
 * saas-mfa.js — TOTP MFA helpers (enroll, verify, AAL check).
 */
(function (global) {
  const ENROLL_STORAGE_KEY = 'hse_mfa_enroll_pending';
  const ENROLL_TTL_MS = 30 * 60 * 1000;

  function normalizeTotpCode(code) {
    return String(code || '').replace(/\s+/g, '').replace(/\D/g, '');
  }

  function mapMfaError(err) {
    const msg = String(err?.message || err || '');
    if (/invalid totp|invalid code|verification failed/i.test(msg)) {
      return 'رمز غير صحيح. تأكد من مزامنة وقت الجهاز، أو اضغط «إعادة الإعداد» وامسح رمز QR جديداً.';
    }
    if (/session missing|not authenticated/i.test(msg)) {
      return 'انتهت الجلسة. سجّل الدخول ثم أعد محاولة تفعيل MFA.';
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
      return data?.totp || [];
    },

    async verifiedTotpFactor(client) {
      const factors = await this.listTotpFactors(client);
      return factors.find(f => f.status === 'verified') || null;
    },

    async cleanupUnverifiedTotp(client) {
      const factors = await this.listTotpFactors(client);
      for (const f of factors.filter(x => x.status === 'unverified')) {
        const { error } = await client.auth.mfa.unenroll({ factorId: f.id });
        if (error && !/not found|already/i.test(error.message || '')) throw error;
      }
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
      if (!verified.length) throw new Error('لا يوجد عامل MFA مفعّل على هذا الحساب');
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

    /**
     * Resume pending enroll from sessionStorage, or create a fresh one.
     * Avoids creating a new secret on every page refresh (root cause of invalid codes).
     */
    async beginTotpEnrollment(client, opts) {
      const email = opts?.email || '';
      const label = email ? ('HSEHub360 ' + email) : 'HSEHub360';

      const verified = await this.verifiedTotpFactor(client);
      if (verified) {
        clearPendingEnroll();
        return { status: 'verified', factor: verified };
      }

      const pending = readPendingEnroll();
      if (pending) {
        const factors = await this.listTotpFactors(client);
        const stillThere = factors.some(f => f.id === pending.factorId && f.status === 'unverified');
        if (stillThere) {
          return { status: 'pending', ...pending };
        }
        clearPendingEnroll();
      }

      await this.cleanupUnverifiedTotp(client);

      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: label.slice(0, 64),
        issuer: 'HSEHub360'
      });
      if (error) throw error;

      const ui = this.renderEnrollUi(data);
      savePendingEnroll(ui);
      return { status: 'pending', ...ui };
    },

    async resetTotpEnrollment(client, opts) {
      clearPendingEnroll();
      await this.cleanupUnverifiedTotp(client);
      return this.beginTotpEnrollment(client, opts);
    },

    async confirmEnrollment(client, factorId, code) {
      await this.challengeAndVerify(client, factorId, code);
      clearPendingEnroll();
      return true;
    }
  };

  global.SaaSMfa = SaaSMfa;
})(window);
