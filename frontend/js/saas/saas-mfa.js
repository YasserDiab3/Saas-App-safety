/**
 * saas-mfa.js — TOTP MFA helpers (enroll, verify, AAL check).
 */
(function (global) {
  const SaaSMfa = {
    async getAal(client) {
      const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      return data;
    },

    async needsVerification(client) {
      const aal = await this.getAal(client);
      return aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
    },

    async verifiedTotpFactor(client) {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp || []).find(f => f.status === 'verified') || null;
    },

    async verifyTotpCode(client, code) {
      const factor = await this.verifiedTotpFactor(client);
      if (!factor) throw new Error('no verified TOTP factor');
      const { data: ch, error: ce } = await client.auth.mfa.challenge({ factorId: factor.id });
      if (ce) throw ce;
      const { error: ve } = await client.auth.mfa.verify({
        factorId: factor.id,
        challengeId: ch.id,
        code: String(code || '').trim()
      });
      if (ve) throw ve;
      return true;
    },

    async enrollTotp(client, friendlyName) {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName || 'HSEHub 360',
        issuer: 'HSEHub 360'
      });
      if (error) throw error;
      return data;
    },

    async confirmEnrollment(client, factorId, code) {
      const { data: ch, error: ce } = await client.auth.mfa.challenge({ factorId });
      if (ce) throw ce;
      const { error: ve } = await client.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: String(code || '').trim()
      });
      if (ve) throw ve;
      return true;
    }
  };

  global.SaaSMfa = SaaSMfa;
})(window);
