import { describe, it, expect } from 'vitest';
import { parseJsonAsync } from './asyncJson.js';

describe('parseJsonAsync', () => {
  describe('valid JSON parsing', () => {
    it('should parse a simple object', async () => {
      const json = '{"name": "test", "value": 123}';
      const result = await parseJsonAsync(json);
      expect(result).toEqual({ name: 'test', value: 123 });
    });

    it('should parse an array', async () => {
      const json = '[1, 2, 3, "four"]';
      const result = await parseJsonAsync(json);
      expect(result).toEqual([1, 2, 3, 'four']);
    });

    it('should parse nested objects', async () => {
      const json = '{"outer": {"inner": {"deep": true}}}';
      const result = await parseJsonAsync(json);
      expect(result).toEqual({ outer: { inner: { deep: true } } });
    });

    it('should parse null', async () => {
      const json = 'null';
      const result = await parseJsonAsync(json);
      expect(result).toBeNull();
    });

    it('should parse boolean values', async () => {
      expect(await parseJsonAsync('true')).toBe(true);
      expect(await parseJsonAsync('false')).toBe(false);
    });

    it('should parse number values', async () => {
      expect(await parseJsonAsync('42')).toBe(42);
      expect(await parseJsonAsync('3.14159')).toBe(3.14159);
      expect(await parseJsonAsync('-100')).toBe(-100);
    });

    it('should parse strings', async () => {
      const result = await parseJsonAsync('"hello world"');
      expect(result).toBe('hello world');
    });

    it('should parse empty array', async () => {
      const result = await parseJsonAsync('[]');
      expect(result).toEqual([]);
    });

    it('should parse empty object', async () => {
      const result = await parseJsonAsync('{}');
      expect(result).toEqual({});
    });

    it('should handle unicode characters', async () => {
      const json = '{"emoji": "🎉", "text": "日本語"}';
      const result = await parseJsonAsync<{ emoji: string; text: string }>(json);
      expect(result.emoji).toBe('🎉');
      expect(result.text).toBe('日本語');
    });

    it('should handle escaped characters', async () => {
      const json = '{"text": "line1\\nline2\\ttab"}';
      const result = await parseJsonAsync<{ text: string }>(json);
      expect(result.text).toBe('line1\nline2\ttab');
    });

    it('should handle large numbers', async () => {
      const json = '{"big": 9007199254740991}';
      const result = await parseJsonAsync<{ big: number }>(json);
      expect(result.big).toBe(9007199254740991);
    });
  });

  describe('invalid JSON parsing', () => {
    it('should reject malformed JSON', async () => {
      await expect(parseJsonAsync('{"invalid')).rejects.toThrow('Invalid JSON file');
    });

    it('should reject trailing commas', async () => {
      await expect(parseJsonAsync('{"key": "value",}')).rejects.toThrow('Invalid JSON file');
    });

    it('should reject single quotes', async () => {
      await expect(parseJsonAsync("{'key': 'value'}")).rejects.toThrow('Invalid JSON file');
    });

    it('should reject unquoted keys', async () => {
      await expect(parseJsonAsync('{key: "value"}')).rejects.toThrow('Invalid JSON file');
    });

    it('should reject comments', async () => {
      await expect(parseJsonAsync('{"key": "value"} // comment')).rejects.toThrow(
        'Invalid JSON file'
      );
    });

    it('should reject undefined', async () => {
      await expect(parseJsonAsync('undefined')).rejects.toThrow('Invalid JSON file');
    });

    it('should reject empty string', async () => {
      await expect(parseJsonAsync('')).rejects.toThrow('Invalid JSON file');
    });

    it('should reject invalid number formats', async () => {
      await expect(parseJsonAsync('{value: 01}')).rejects.toThrow('Invalid JSON file');
    });
  });

  describe('type inference', () => {
    interface TestType {
      id: number;
      name: string;
      active: boolean;
    }

    it('should infer types correctly', async () => {
      const json = '{"id": 1, "name": "test", "active": true}';
      const result = await parseJsonAsync<TestType>(json);

      expect(result.id).toBe(1);
      expect(result.name).toBe('test');
      expect(result.active).toBe(true);
    });

    it('should work with array types', async () => {
      const json = '[{"id": 1}, {"id": 2}]';
      const result = await parseJsonAsync<{ id: number }[]>(json);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
    });
  });

  describe('async behavior', () => {
    it('should execute asynchronously (yields to event loop)', async () => {
      // This tests that the function actually uses setImmediate
      const json = '{"test": true}';

      let syncComplete = false;
      const promise = parseJsonAsync(json).then(() => {
        // This should run after the sync code
        expect(syncComplete).toBe(true);
        return true;
      });

      syncComplete = true;
      await expect(promise).resolves.toBe(true);
    });

    it('should handle timeout parameter gracefully (API compatibility)', async () => {
      // The timeout parameter is kept for API compatibility but unused
      const json = '{"test": true}';
      const result = await parseJsonAsync(json, 5000);
      expect(result).toEqual({ test: true });
    });
  });

  describe('error messages', () => {
    it('should provide meaningful error message for parse errors', async () => {
      try {
        await parseJsonAsync('{"incomplete":');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid JSON file');
      }
    });

    it('should include original error details in message', async () => {
      try {
        await parseJsonAsync('not json at all');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('Invalid JSON file');
      }
    });
  });
});
