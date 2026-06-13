/**
 * V5 — MFA TOTP Unit Tests
 */
const { generateSecret, generateTOTP, verifyTOTP, generateBackupCodes, buildProvisioningURI } = require('../modules/auth/mfa');

describe('MFA TOTP', () => {
  test('generates a base32 secret of correct length', () => {
    const secret = generateSecret(20);
    expect(secret).toHaveLength(20);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  test('generates a 6-digit TOTP code', () => {
    const secret = generateSecret();
    const code = generateTOTP(secret);
    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
  });

  test('verifies a valid TOTP code', () => {
    const secret = generateSecret();
    const code = generateTOTP(secret);
    expect(verifyTOTP(secret, code)).toBe(true);
  });

  test('rejects an invalid TOTP code', () => {
    const secret = generateSecret();
    expect(verifyTOTP(secret, '000000')).toBe(false);
  });

  test('generates 8 unique backup codes', () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    const unique = new Set(codes);
    expect(unique.size).toBe(8);
    codes.forEach(c => expect(/^[0-9A-F]{8}$/.test(c)).toBe(true));
  });

  test('builds a valid provisioning URI', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = buildProvisioningURI(secret, 'test@example.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(secret);
    expect(uri).toContain('test%40example.com');
  });

  test('TOTP varies with time', () => {
    const secret = generateSecret();
    const code1 = generateTOTP(secret, 1000000000 * 1000);
    const code2 = generateTOTP(secret, 2000000000 * 1000);
    // Different time windows should produce different codes
    expect(code1).not.toBe(code2);
  });
});
