import { describe, it, expect } from 'vitest';
import { parseSegments, extractElements } from './parsers.js';

describe('FinTS parsers', () => {
  describe('parseSegments', () => {
    it('should parse single segment', () => {
      const response = "HNHBK:1:3+000000000150+300+DIALOG123+1'";
      const segments = parseSegments(response);

      expect(segments.has('HNHBK')).toBe(true);
      expect(segments.get('HNHBK')?.length).toBe(1);
    });

    it('should parse multiple segments', () => {
      const response = "HNHBK:1:3+data'HIRMG:2:2+data'HIRMS:3:2+data'";
      const segments = parseSegments(response);

      expect(segments.has('HNHBK')).toBe(true);
      expect(segments.has('HIRMG')).toBe(true);
      expect(segments.has('HIRMS')).toBe(true);
    });

    it('should group multiple instances of same segment', () => {
      const response = "HIRMS:3:2+first'HIRMS:4:2+second'";
      const segments = parseSegments(response);

      expect(segments.get('HIRMS')?.length).toBe(2);
    });

    it('should handle escaped quotes', () => {
      const response = "HNHBK:1:3+data with ?'escaped quote'HIRMG:2:2+other'";
      const segments = parseSegments(response);

      expect(segments.has('HNHBK')).toBe(true);
      expect(segments.has('HIRMG')).toBe(true);
    });

    it('should ignore empty parts', () => {
      const response = "HNHBK:1:3+data''HIRMG:2:2+data'";
      const segments = parseSegments(response);

      expect(segments.size).toBe(2);
    });

    it('should ignore invalid segments without proper header', () => {
      const response = "HNHBK:1:3+valid'invalid data'HIRMG:2:2+valid'";
      const segments = parseSegments(response);

      expect(segments.size).toBe(2);
      expect(segments.has('HNHBK')).toBe(true);
      expect(segments.has('HIRMG')).toBe(true);
    });

    it('should handle 5-letter segment names', () => {
      const response = "HKIDN:3:2+data'";
      const segments = parseSegments(response);

      expect(segments.has('HKIDN')).toBe(true);
    });

    it('should handle 6-letter segment names', () => {
      const response = "HITANS:70:6+data'";
      const segments = parseSegments(response);

      expect(segments.has('HITANS')).toBe(true);
    });

    it('should return empty map for empty input', () => {
      const segments = parseSegments('');
      expect(segments.size).toBe(0);
    });

    it('should return empty map for whitespace input', () => {
      const segments = parseSegments('   \n\t  ');
      expect(segments.size).toBe(0);
    });
  });

  describe('extractElements', () => {
    it('should extract elements separated by +', () => {
      const segment = 'HNHBK:1:3+elem1+elem2+elem3';
      const elements = extractElements(segment);

      expect(elements).toContain('elem1');
      expect(elements).toContain('elem2');
      expect(elements).toContain('elem3');
    });

    it('should handle escaped + characters', () => {
      // The segment header must match the expected format
      const segment = 'TESTT:1:1+value with ?+ plus';
      const elements = extractElements(segment);

      // The first element should contain the unescaped +
      expect(elements[0]).toBe('value with + plus');
    });

    it('should preserve colons within elements', () => {
      const segment = 'TESTT:1:1+key:value+other';
      const elements = extractElements(segment);

      expect(elements[0]).toBe('key:value');
      expect(elements[1]).toBe('other');
    });

    it('should handle empty elements', () => {
      const segment = 'TESTT:1:1+first++third';
      const elements = extractElements(segment);

      expect(elements[0]).toBe('first');
      expect(elements[1]).toBe('');
      expect(elements[2]).toBe('third');
    });

    it('should handle segment with no elements after header', () => {
      // With no + after the header, the regex removes the header, leaving empty string
      const segment = 'TESTT:1:1';
      const elements = extractElements(segment);

      // Empty string after header removal results in no elements being pushed
      // but if there's something remaining, it gets pushed
      expect(elements.length).toBeLessThanOrEqual(1);
    });

    it('should handle complex nested data', () => {
      const segment = 'HIUPD:6:6+1234567890:::12345678+DE89370400440532013000+EUR';
      const elements = extractElements(segment);

      expect(elements.length).toBeGreaterThan(0);
      expect(elements).toContain('EUR');
    });

    it('should handle multiple escaped characters in sequence', () => {
      const segment = 'TESTT:1:1+a?+b?:c?@d';
      const elements = extractElements(segment);

      // The escape character removes the special meaning of the next char
      expect(elements[0]).toBe('a+b:c@d');
    });

    it('should strip segment header with trailing +', () => {
      const segment = 'HNHBK:1:3+000000000150+300';
      const elements = extractElements(segment);

      expect(elements[0]).not.toMatch(/^HNHBK/);
    });
  });
});
