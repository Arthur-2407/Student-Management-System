const {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../middleware/authMiddleware');

describe('auth token hardening', () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-at-least-32-chars';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-with-at-least-32-chars';
    process.env.JWT_ACCESS_EXPIRY = '15m';
    process.env.JWT_REFRESH_EXPIRY = '7d';
  });

  test('generates typed access and refresh tokens with issuer and audience', () => {
    const tokens = generateTokens({
      id: 7,
      student_id: 'EMP-007',
      email: 'emp007@example.com',
      role: 'student',
      department: 'Operations',
    });

    const accessPayload = verifyAccessToken(tokens.accessToken);
    const refreshPayload = verifyRefreshToken(tokens.refreshToken);

    expect(accessPayload).toMatchObject({
      id: 7,
      studentId: 'EMP-007',
      email: 'emp007@example.com',
      role: 'student',
      department: 'Operations',
    });
    expect(refreshPayload).toMatchObject({
      id: 7,
      studentId: 'EMP-007',
      type: 'refresh',
      tokenFamily: tokens.tokenFamily,
    });
    expect(tokens.accessJti).toBeTruthy();
    expect(tokens.refreshJti).toBeTruthy();
  });

  test('does not accept refresh tokens as access tokens', () => {
    const tokens = generateTokens({
      id: 8,
      student_id: 'EMP-008',
      email: 'emp008@example.com',
      role: 'student',
      department: 'Finance',
    });

    expect(() => verifyAccessToken(tokens.refreshToken)).toThrow();
  });
});
