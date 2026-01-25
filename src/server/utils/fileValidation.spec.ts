import { describe, it, expect } from 'vitest';
import { validateJsonContent, validateCsvContent } from './fileValidation.js';

describe('validateJsonContent', () => {
  describe('valid JSON content', () => {
    it('should accept valid JSON starting with {', () => {
      const buffer = Buffer.from('{"key": "value"}');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid JSON starting with [', () => {
      const buffer = Buffer.from('[1, 2, 3]');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept JSON with leading whitespace', () => {
      const buffer = Buffer.from('   \n\t{"key": "value"}');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(true);
    });

    it('should accept JSON with BOM and whitespace', () => {
      const buffer = Buffer.from('\ufeff{"key": "value"}');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(true);
    });

    it('should accept large JSON content (only checks prefix)', () => {
      const largeContent = '{"data": "' + 'x'.repeat(10000) + '"}';
      const buffer = Buffer.from(largeContent);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid JSON content', () => {
    it('should reject empty buffer', () => {
      const buffer = Buffer.from('');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should reject whitespace-only content', () => {
      const buffer = Buffer.from('   \n\t   ');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File contains only whitespace');
    });

    it('should reject content starting with invalid character', () => {
      const buffer = Buffer.from('hello world');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expected '{' or '['");
    });

    it('should reject content starting with number', () => {
      const buffer = Buffer.from('12345');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("expected '{' or '['");
    });
  });

  describe('binary file detection', () => {
    it('should reject PNG image', () => {
      // PNG magic bytes
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('PNG image');
    });

    it('should reject JPEG image', () => {
      // JPEG magic bytes
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('JPEG image');
    });

    it('should reject ZIP archive', () => {
      // ZIP magic bytes
      const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ZIP archive');
    });

    it('should reject PDF document', () => {
      // PDF magic bytes: %PDF
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('PDF document');
    });

    it('should reject Windows executable', () => {
      // MZ magic bytes
      const buffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Windows executable');
    });

    it('should reject GZIP archive', () => {
      const buffer = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('GZIP archive');
    });

    it('should reject SQLite database', () => {
      // SQLite magic: "SQLite"
      const buffer = Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20]);
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('SQLite database');
    });
  });

  describe('binary control character detection', () => {
    it('should reject content with NULL bytes', () => {
      const buffer = Buffer.from('{"key": "val\x00ue"}');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('binary data');
    });

    it('should reject content with control characters', () => {
      const buffer = Buffer.from('{"key": "val\x05ue"}');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('binary data');
    });

    it('should accept content with valid whitespace characters', () => {
      const buffer = Buffer.from('{"key": "val\t\n\rue"}');
      const result = validateJsonContent(buffer);
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateCsvContent', () => {
  describe('valid CSV content', () => {
    it('should accept valid CSV with commas', () => {
      const buffer = Buffer.from('name,age,city\nJohn,30,NYC\nJane,25,LA');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid CSV with semicolons', () => {
      const buffer = Buffer.from('name;age;city\nJohn;30;NYC');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(true);
    });

    it('should accept valid CSV with tabs', () => {
      const buffer = Buffer.from('name\tage\tcity\nJohn\t30\tNYC');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(true);
    });

    it('should accept CSV with CRLF line endings', () => {
      const buffer = Buffer.from('name,age\r\nJohn,30\r\nJane,25');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(true);
    });

    it('should accept CSV with multiple lines and no header delimiters', () => {
      const buffer = Buffer.from('single_column\nvalue1\nvalue2');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(true);
    });

    it('should accept CSV with leading whitespace', () => {
      const buffer = Buffer.from('   \n\nname,age\nJohn,30');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid CSV content', () => {
    it('should reject empty buffer', () => {
      const buffer = Buffer.from('');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File is empty');
    });

    it('should reject whitespace-only content', () => {
      const buffer = Buffer.from('   \n\t   ');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File contains only whitespace');
    });

    it('should reject single line without delimiters', () => {
      const buffer = Buffer.from('justplaintext');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not appear to be CSV');
    });
  });

  describe('binary file detection', () => {
    it('should reject PNG image', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('PNG image');
    });

    it('should reject ZIP archive', () => {
      const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ZIP archive');
    });

    it('should reject content with NULL bytes', () => {
      const buffer = Buffer.from('name,age\x00\nJohn,30');
      const result = validateCsvContent(buffer);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('binary data');
    });
  });
});
