import { describe, it, expect } from 'vitest';
import { wrapMessage, wrapAuthenticatedMessage } from './message.js';

describe('FinTS message', () => {
  describe('wrapMessage', () => {
    it('should wrap segments with header and footer', () => {
      const result = wrapMessage('DIALOG123', 1, ["TEST:2:1+data'"]);

      // Should start with HNHBK and end with HNHBS
      expect(result).toMatch(/^HNHBK:1:3\+/);
      expect(result).toMatch(/HNHBS:\d+:1\+1'$/);
    });

    it('should include dialog ID', () => {
      const result = wrapMessage('MYDIALOG', 1, ["TEST:2:1+data'"]);
      expect(result).toContain('MYDIALOG');
    });

    it('should include message number', () => {
      const result = wrapMessage('DIALOG123', 5, ["TEST:2:1+data'"]);
      // Message number appears in HNHBK and HNHBS
      expect(result).toContain('+5');
    });

    it('should calculate message length', () => {
      const result = wrapMessage('DIALOG123', 1, ["TEST:2:1+data'"]);
      // Should not contain the placeholder
      expect(result).not.toContain('000000000000');
      // Length should be padded to 12 characters
      const lengthMatch = result.match(/^HNHBK:1:3\+(\d{12})\+/);
      expect(lengthMatch).not.toBeNull();
      const declaredLength = parseInt(lengthMatch![1], 10);
      expect(declaredLength).toBe(result.length);
    });

    it('should concatenate multiple segments', () => {
      const result = wrapMessage('DIALOG123', 1, ["SEG1:2:1+data1'", "SEG2:3:1+data2'"]);
      expect(result).toContain("SEG1:2:1+data1'");
      expect(result).toContain("SEG2:3:1+data2'");
    });

    it('should handle empty segments array', () => {
      const result = wrapMessage('DIALOG123', 1, []);
      expect(result).toMatch(/^HNHBK:1:3\+/);
      expect(result).toMatch(/HNHBS:/);
    });

    it('should calculate footer segment number correctly', () => {
      // With 2 segments, footer should be at position 4 (1=HNHBK, 2,3=segments, 4=HNHBS)
      const result = wrapMessage('DIALOG123', 1, ["SEG1:2:1+data1'", "SEG2:3:1+data2'"]);
      expect(result).toMatch(/HNHBS:4:1\+/);
    });
  });

  describe('wrapAuthenticatedMessage', () => {
    it('should wrap with HNVSK and HNVSD', () => {
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'testuser', 'SYS001', [
        "TEST:2:1+data'",
      ]);

      expect(result).toContain('HNVSK:998:3');
      expect(result).toContain('HNVSD:999:1');
    });

    it('should include HNHBK header', () => {
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'testuser', 'SYS001', [
        "TEST:2:1+data'",
      ]);

      expect(result).toMatch(/^HNHBK:1:3\+/);
    });

    it('should include HNHBS footer', () => {
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'testuser', 'SYS001', [
        "TEST:2:1+data'",
      ]);

      expect(result).toMatch(/HNHBS:\d+:1\+1'$/);
    });

    it('should include bank code in HNVSK', () => {
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'testuser', 'SYS001', [
        "TEST:2:1+data'",
      ]);

      expect(result).toContain('280:12345678:testuser');
    });

    it('should include user credentials in HNVSK', () => {
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'myuser', 'SYSID', [
        "TEST:2:1+data'",
      ]);

      expect(result).toContain('myuser');
      expect(result).toContain('SYSID');
    });

    it('should calculate correct message length', () => {
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'testuser', 'SYS001', [
        "TEST:2:1+data'",
      ]);

      const lengthMatch = result.match(/^HNHBK:1:3\+(\d{12})\+/);
      expect(lengthMatch).not.toBeNull();
      const declaredLength = parseInt(lengthMatch![1], 10);
      expect(declaredLength).toBe(result.length);
    });

    it('should wrap signed content in HNVSD', () => {
      const signedContent = "SIGNED:2:1+secure_data'";
      const result = wrapAuthenticatedMessage('DIALOG123', 1, '12345678', 'testuser', 'SYS001', [
        signedContent,
      ]);

      // HNVSD wraps content with length prefix
      expect(result).toContain(`@${signedContent.length}@${signedContent}`);
    });
  });
});
