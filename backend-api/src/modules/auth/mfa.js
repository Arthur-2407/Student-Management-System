/**
 * V5 — TOTP-BASED MFA (Multi-Factor Authentication)
 *
 * Provides:
 *   - TOTP secret generation and QR code URL
 *   - TOTP code verification
 *   - MFA enrollment/disable flow
 *   - Backup codes generation
 *
 * Uses the HMAC-based OTP algorithm (RFC 6238) with a pure-JS implementation
 * so no additional dependencies are needed.
 */
const crypto = require('crypto');
const { logger } = require('../../config/logger');

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'sha1';

/**
 * Generate a base32-encoded secret for TOTP enrollment.
 */
function generateSecret(length = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(length);
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += chars[bytes[i] % 32];
  }
  return secret;
}

/**
 * Decode a base32 string to Buffer.
 */
function base32Decode(base32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32.toUpperCase()) {
    const val = chars.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate the current TOTP code for a given secret.
 */
function generateTOTP(secret, time = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(time / 1000 / TOTP_PERIOD);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(0, 0);
  counterBuf.writeUInt32BE(counter, 4);

  const hmac = crypto.createHmac(TOTP_ALGORITHM, key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24
    | (hmac[offset + 1] & 0xff) << 16
    | (hmac[offset + 2] & 0xff) << 8
    | (hmac[offset + 3] & 0xff)) % Math.pow(10, TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Verify a TOTP code, allowing ±1 window for clock drift.
 */
function verifyTOTP(secret, code) {
  const now = Date.now();
  for (const offset of [-1, 0, 1]) {
    const time = now + offset * TOTP_PERIOD * 1000;
    if (generateTOTP(secret, time) === code) {
      return true;
    }
  }
  return false;
}

/**
 * Generate 8 backup codes.
 */
function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
  }
  return codes;
}

/**
 * Build a provisioning URI for QR code generation.
 */
function buildProvisioningURI(secret, email, issuer = 'AttendanceSystem') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

module.exports = {
  generateSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  buildProvisioningURI,
};
