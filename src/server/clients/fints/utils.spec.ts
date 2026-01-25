import { describe, it, expect } from 'vitest';
import { scrubSensitiveData, encodeFinTS, generateMsgRef, formatFinTSDate } from './utils.js';

describe('FinTS utils', () => {
  describe('scrubSensitiveData', () => {
    it('should scrub PINs in HNSHA segments', () => {
      const input = "HNSHA:5:2+999++secret123'";
      const result = scrubSensitiveData(input);
      expect(result).toBe("HNSHA:5:2+999++***'");
      expect(result).not.toContain('secret123');
    });

    it('should scrub user IDs in HKIDN segments', () => {
      // The regex expects exactly 8 digits for bank code
      const input = '+12345678+user12345+A';
      const result = scrubSensitiveData(input);
      expect(result).not.toContain('user12345');
    });

    it('should scrub user IDs in HNSHK/HNVSK segments', () => {
      const input = ':12345678:username:';
      const result = scrubSensitiveData(input);
      expect(result).toBe(':12345678:***:');
      expect(result).not.toContain('username');
    });

    it('should scrub IBANs', () => {
      const input = 'Account: DE89370400440532013000';
      const result = scrubSensitiveData(input);
      expect(result).toBe('Account: DE********************');
      expect(result).not.toContain('89370400440532013000');
    });

    it('should scrub account numbers', () => {
      // Account number pattern: 8-10 digits between + and +non-digit
      const input = '+1234567890+A';
      const result = scrubSensitiveData(input);
      expect(result).toBe('+***+A');
    });

    it('should scrub device/TAN medium names', () => {
      const input = 'DKB-App (Samsung SM-G991B)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('DKB-App (***)');
      expect(result).not.toContain('Samsung');
    });

    it('should scrub TAN-App names', () => {
      const input = 'TAN-App (iPhone 14)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('TAN-App (***)');
    });

    it('should scrub Banking-App names', () => {
      const input = 'Banking-App (Pixel 7)';
      const result = scrubSensitiveData(input);
      expect(result).toBe('Banking-App (***)');
    });

    it('should handle text without sensitive data', () => {
      const input = 'Hello World';
      const result = scrubSensitiveData(input);
      expect(result).toBe('Hello World');
    });

    it('should handle multiple sensitive items in one text', () => {
      const input = "HNSHA:5:2+999++pin123'+DE89370400440532013000";
      const result = scrubSensitiveData(input);
      expect(result).not.toContain('pin123');
      expect(result).not.toContain('89370400440532013000');
    });
  });

  describe('encodeFinTS', () => {
    it('should escape plus signs', () => {
      const result = encodeFinTS('hello+world');
      expect(result).toBe('hello?+world');
    });

    it('should escape colons', () => {
      const result = encodeFinTS('hello:world');
      expect(result).toBe('hello?:world');
    });

    it('should escape at signs', () => {
      const result = encodeFinTS('hello@world');
      expect(result).toBe('hello?@world');
    });

    it('should escape single quotes', () => {
      const result = encodeFinTS("hello'world");
      expect(result).toBe("hello?'world");
    });

    it('should escape multiple special characters', () => {
      const result = encodeFinTS("a+b:c@d'e");
      expect(result).toBe("a?+b?:c?@d?'e");
    });

    it('should not modify text without special characters', () => {
      const result = encodeFinTS('hello world');
      expect(result).toBe('hello world');
    });
  });

  describe('generateMsgRef', () => {
    it('should generate a 7-digit reference number', () => {
      const ref = generateMsgRef();
      expect(ref).toMatch(/^\d{7}$/);
    });

    it('should generate different references on subsequent calls', () => {
      const refs = new Set<string>();
      for (let i = 0; i < 10; i++) {
        refs.add(generateMsgRef());
      }
      // Most should be unique (there's a small chance of collision)
      expect(refs.size).toBeGreaterThan(5);
    });

    it('should pad short numbers with leading zeros', () => {
      // Mock Math.random to return a small number
      const originalRandom = Math.random;
      Math.random = () => 0.0000001; // Will generate a very small number

      const ref = generateMsgRef();
      expect(ref).toHaveLength(7);
      expect(ref).toMatch(/^0+\d+$/);

      Math.random = originalRandom;
    });
  });

  describe('formatFinTSDate', () => {
    it('should format Date object to YYYYMMDD', () => {
      const date = new Date('2024-01-15');
      const result = formatFinTSDate(date);
      expect(result).toBe('20240115');
    });

    it('should format date string to YYYYMMDD', () => {
      const result = formatFinTSDate('2024-01-15');
      expect(result).toBe('20240115');
    });

    it('should handle end of year dates', () => {
      const result = formatFinTSDate('2024-12-31');
      expect(result).toBe('20241231');
    });

    it('should handle beginning of year dates', () => {
      const result = formatFinTSDate('2024-01-01');
      expect(result).toBe('20240101');
    });

    it('should format ISO date strings', () => {
      const result = formatFinTSDate('2024-06-15T10:30:00Z');
      expect(result).toBe('20240615');
    });
  });
});
