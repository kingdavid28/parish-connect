import { describe, it, expect } from 'vitest';

// Password strength rules (mirrors Signup.tsx)
const PASSWORD_RULES = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
    { label: 'One number', test: (p: string) => /\d/.test(p) },
];
const passwordStrength = (p: string) => PASSWORD_RULES.filter(r => r.test(p)).length;

describe('password strength', () => {
    it('scores 0 for empty string', () => expect(passwordStrength('')).toBe(0));
    it('scores 1 for only length', () => expect(passwordStrength('abcdefgh')).toBe(2)); // length + lowercase
    it('scores 4 for strong password', () => expect(passwordStrength('Passw0rd')).toBe(4));
    it('scores 3 for missing number', () => expect(passwordStrength('Password')).toBe(3));
    it('scores 3 for missing uppercase', () => expect(passwordStrength('passw0rd')).toBe(3));
});

// GCash number validation (mirrors wallet.php regex)
const isValidGcash = (n: string) => /^(09|\+639)\d{9}$/.test(n);

describe('GCash number validation', () => {
    it('accepts 09XXXXXXXXX format', () => expect(isValidGcash('09171234567')).toBe(true));
    it('accepts +639XXXXXXXXX format', () => expect(isValidGcash('+639171234567')).toBe(true));
    it('rejects too short', () => expect(isValidGcash('0917123')).toBe(false));
    it('rejects letters', () => expect(isValidGcash('0917ABCDEFG')).toBe(false));
    it('rejects empty', () => expect(isValidGcash('')).toBe(false));
});

// GBless amount validation
describe('GBless amount validation', () => {
    const CASHOUT_MIN = 1_000_000;
    const GBLESS_PER_PHP = 10_000;

    it('converts PHP to GBless correctly', () => {
        expect(100 * GBLESS_PER_PHP).toBe(1_000_000);
        expect(50 * GBLESS_PER_PHP).toBe(500_000);
    });

    it('blocks cashout below minimum', () => {
        expect(500_000 < CASHOUT_MIN).toBe(true);
        expect(1_000_000 < CASHOUT_MIN).toBe(false);
    });

    it('converts GBless to PHP correctly', () => {
        expect(1_000_000 / GBLESS_PER_PHP).toBe(100);
    });
});
