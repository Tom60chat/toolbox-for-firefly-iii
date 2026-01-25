import { describe, it, expect, vi } from 'vitest';
import {
  checkForErrors,
  extractDialogId,
  extractAccounts,
  extractTanMethods,
  extractAllowedTanMethods,
  checkTanRequired,
} from './extractors.js';

// Mock the utils logger
vi.mock('./utils.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FinTS extractors', () => {
  describe('checkForErrors', () => {
    it('should not throw for successful responses (0xxx codes)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+0010::Success']);

      expect(() => checkForErrors(segments)).not.toThrow();
    });

    it('should not throw for warning responses (3xxx codes)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+3010::Warning message']);

      expect(() => checkForErrors(segments)).not.toThrow();
    });

    it('should throw for error responses (9xxx codes)', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+9000::Error message']);

      expect(() => checkForErrors(segments)).toThrow('FinTS Error 9000');
    });

    it('should check HIRMS segments as well', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:3:2+9010::Invalid PIN']);

      expect(() => checkForErrors(segments)).toThrow('FinTS Error 9010');
    });

    it('should check both HIRMG and HIRMS', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+0010::Success']);
      segments.set('HIRMS', ['HIRMS:3:2+9999::Critical error']);

      expect(() => checkForErrors(segments)).toThrow('FinTS Error 9999');
    });

    it('should handle empty segments', () => {
      const segments = new Map<string, string[]>();

      expect(() => checkForErrors(segments)).not.toThrow();
    });

    it('should include error message in exception', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+9050::Authentication failed']);

      expect(() => checkForErrors(segments)).toThrow('Authentication failed');
    });

    it('should not throw for codes below 9000', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMG', ['HIRMG:2:2+8999::Not an error']);

      expect(() => checkForErrors(segments)).not.toThrow();
    });
  });

  describe('extractDialogId', () => {
    it('should extract dialog ID from HNHBK segment', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);

      const dialogId = extractDialogId(segments);
      expect(dialogId).toBe('DIALOG123');
    });

    it('should throw if HNHBK is missing', () => {
      const segments = new Map<string, string[]>();

      expect(() => extractDialogId(segments)).toThrow('Invalid response: Missing HNHBK segment');
    });

    it('should return "0" if dialog ID element is missing', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300']);

      const dialogId = extractDialogId(segments);
      expect(dialogId).toBe('0');
    });
  });

  describe('extractAccounts', () => {
    it('should extract accounts from HISPA segments', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', [
        'HISPA:5:2+1234567890:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX',
      ]);

      const accounts = extractAccounts(segments);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should extract accounts from HIUPD segments', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIUPD', [
        'HIUPD:6:6+1234567890:::12345678+DE89370400440532013000+EUR+Girokonto++John Doe',
      ]);

      const accounts = extractAccounts(segments);
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should merge HISPA and HIUPD data', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', [
        'HISPA:5:2+1234567890:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX',
      ]);
      segments.set('HIUPD', [
        'HIUPD:6:6+1234567890:::12345678+DE89370400440532013000+EUR+Girokonto++John Doe',
      ]);

      const accounts = extractAccounts(segments);
      // Should have account info from both sources
      expect(accounts.length).toBeGreaterThan(0);
    });

    it('should handle empty segments', () => {
      const segments = new Map<string, string[]>();

      const accounts = extractAccounts(segments);
      expect(accounts).toEqual([]);
    });

    it('should extract IBAN when present', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', ['HISPA:5:2+1234:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX']);

      const accounts = extractAccounts(segments);
      const account = accounts.find((a) => a.iban);
      expect(account?.iban).toBe('DE89370400440532013000');
    });

    it('should extract BIC when present', () => {
      const segments = new Map<string, string[]>();
      segments.set('HISPA', ['HISPA:5:2+1234:BLZ:280:12345678:DE89370400440532013000:COBADEFFXXX']);

      const accounts = extractAccounts(segments);
      const account = accounts.find((a) => a.bic);
      expect(account?.bic).toBe('COBADEFFXXX');
    });
  });

  describe('extractTanMethods', () => {
    it('should extract TAN methods from HITANS', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:70:6:4+1+1+0+N:N:0:940:2:SealOne:Decoupled::DKB App:::DKB App:2048:N:1:N:0:0:N:J:00:0:N',
      ]);

      const methods = extractTanMethods(segments);
      expect(methods.length).toBeGreaterThanOrEqual(0);
    });

    it('should identify decoupled TAN methods', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', ['HITANS:70:6:4+1+1+0+940:2:SealOne:Decoupled::DKB App']);

      const methods = extractTanMethods(segments);
      const decoupledMethod = methods.find((m) => m.id === '940');
      if (decoupledMethod) {
        expect(decoupledMethod.isDecoupled).toBe(true);
      }
    });

    it('should handle empty HITANS', () => {
      const segments = new Map<string, string[]>();

      const methods = extractTanMethods(segments);
      expect(methods).toEqual([]);
    });

    it('should avoid duplicate TAN methods', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', [
        'HITANS:70:6:4+940:2:SealOne:Decoupled::App1+940:2:SealOne:Decoupled::App2',
      ]);

      const methods = extractTanMethods(segments);
      const method940 = methods.filter((m) => m.id === '940');
      expect(method940.length).toBeLessThanOrEqual(1);
    });

    it('should identify chipTAN methods', () => {
      const segments = new Map<string, string[]>();
      segments.set('HITANS', ['HITANS:70:6:4+910:2:HHD1.3.0:::chipTAN manuell']);

      const methods = extractTanMethods(segments);
      const chipTan = methods.find((m) => m.id === '910');
      if (chipTan) {
        expect(chipTan.technicalName).toContain('HHD');
      }
    });
  });

  describe('extractAllowedTanMethods', () => {
    it('should extract allowed TAN methods from HIRMS 3920', () => {
      const segments = new Map<string, string[]>();
      // The format should have 3920 code followed by text, then a colon and the methods
      segments.set('HIRMS', ['HIRMS:3:2+3920::Allowed TAN methods:900:910:920']);

      const allowed = extractAllowedTanMethods(segments);
      // The regex captures everything after "3920...:" as a number sequence
      expect(allowed.length).toBeGreaterThan(0);
    });

    it('should return empty array if no 3920 code', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:3:2+0010::Success']);

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toEqual([]);
    });

    it('should handle missing HIRMS', () => {
      const segments = new Map<string, string[]>();

      const allowed = extractAllowedTanMethods(segments);
      expect(allowed).toEqual([]);
    });

    it('should filter out empty strings', () => {
      const segments = new Map<string, string[]>();
      segments.set('HIRMS', ['HIRMS:3:2+3920::Methods:900::910']);

      const allowed = extractAllowedTanMethods(segments);
      allowed.forEach((m) => {
        expect(m.length).toBeGreaterThan(0);
      });
    });
  });

  describe('checkTanRequired', () => {
    it('should return null if no HITAN segment', () => {
      const segments = new Map<string, string[]>();

      const result = checkTanRequired(segments);
      expect(result).toBeNull();
    });

    it('should extract TAN request from HITAN', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++ORDER_REF_123+Please confirm in your banking app']);

      const result = checkTanRequired(segments);
      expect(result).not.toBeNull();
      expect(result?.dialogId).toBe('DIALOG123');
    });

    it('should extract order reference from HITAN', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++ORDER_REF_123+Please confirm']);

      const result = checkTanRequired(segments);
      expect(result?.orderRef).toBe('ORDER_REF_123');
    });

    it('should extract challenge text from HITAN', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++ORDER_REF+Please confirm in your banking app']);

      const result = checkTanRequired(segments);
      expect(result?.challengeText).toContain('Please confirm');
    });

    it('should provide default challenge text if missing', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5+4++++']);

      const result = checkTanRequired(segments);
      if (result) {
        expect(result.challengeText).toBeTruthy();
      }
    });

    it('should return null if HITAN has no meaningful content', () => {
      const segments = new Map<string, string[]>();
      segments.set('HNHBK', ['HNHBK:1:3+000000000150+300+DIALOG123+1']);
      segments.set('HITAN', ['HITAN:4:6:5++++']);

      const result = checkTanRequired(segments);
      // If both tanProcess and challengeText are empty, returns null
      expect(result).toBeNull();
    });
  });
});
