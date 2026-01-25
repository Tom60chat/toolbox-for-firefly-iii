import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getCacheKey,
  getCachedTransactions,
  setCachedTransactions,
  clearSessionCache,
  clearAllCaches,
  setSessionTracker,
} from './transactionCache.js';
import type { FireflyTransaction } from '../../shared/types/firefly.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Helper to create a mock transaction
function createMockTransaction(id: string): FireflyTransaction {
  return {
    id,
    type: 'transactions',
    attributes: {
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      user: '1',
      group_title: null,
      transactions: [
        {
          user: '1',
          transaction_journal_id: id,
          type: 'withdrawal',
          date: '2024-01-15',
          order: 0,
          currency_id: '1',
          currency_code: 'EUR',
          currency_symbol: '€',
          currency_decimal_places: 2,
          foreign_currency_id: null,
          foreign_currency_code: null,
          foreign_currency_symbol: null,
          foreign_currency_decimal_places: null,
          amount: '100.00',
          foreign_amount: null,
          description: 'Test transaction',
          source_id: '1',
          source_name: 'Checking',
          source_iban: null,
          source_type: 'Asset account',
          destination_id: '2',
          destination_name: 'Shop',
          destination_iban: null,
          destination_type: 'Expense account',
          budget_id: null,
          budget_name: null,
          category_id: null,
          category_name: null,
          bill_id: null,
          bill_name: null,
          reconciled: false,
          notes: null,
          tags: [],
          internal_reference: null,
          external_id: null,
          external_url: null,
          original_source: null,
          recurrence_id: null,
          recurrence_total: null,
          recurrence_count: null,
          bunq_payment_id: null,
          import_hash_v2: null,
          sepa_cc: null,
          sepa_ct_op: null,
          sepa_ct_id: null,
          sepa_db: null,
          sepa_country: null,
          sepa_ep: null,
          sepa_ci: null,
          sepa_batch_id: null,
          interest_date: null,
          book_date: null,
          process_date: null,
          due_date: null,
          payment_date: null,
          invoice_date: null,
        },
      ],
    },
  };
}

describe('transactionCache', () => {
  beforeEach(() => {
    // Clear all caches before each test
    clearAllCaches();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCacheKey', () => {
    it('should generate key from start and end dates', () => {
      const key = getCacheKey('2024-01-01', '2024-01-31');
      expect(key).toBe('2024-01-01-2024-01-31-');
    });

    it('should generate key with empty dates', () => {
      const key = getCacheKey();
      expect(key).toBe('--');
    });

    it('should generate key with only start date', () => {
      const key = getCacheKey('2024-01-01');
      expect(key).toBe('2024-01-01--');
    });

    it('should generate key with only end date', () => {
      const key = getCacheKey(undefined, '2024-01-31');
      expect(key).toBe('-2024-01-31-');
    });

    it('should include extra parameter in key', () => {
      const key = getCacheKey('2024-01-01', '2024-01-31', 'withdrawal');
      expect(key).toBe('2024-01-01-2024-01-31-withdrawal');
    });
  });

  describe('setCachedTransactions and getCachedTransactions', () => {
    it('should cache and retrieve transactions', () => {
      const sessionId = 'session-1';
      const cacheKey = '2024-01-01-2024-01-31-';
      const transactions = [createMockTransaction('1'), createMockTransaction('2')];

      setCachedTransactions(sessionId, cacheKey, transactions);
      const result = getCachedTransactions(sessionId, cacheKey);

      expect(result).toEqual(transactions);
      expect(result).toHaveLength(2);
    });

    it('should return null for unknown session', () => {
      const result = getCachedTransactions('unknown-session', 'any-key');
      expect(result).toBeNull();
    });

    it('should return null for unknown cache key', () => {
      const sessionId = 'session-1';
      setCachedTransactions(sessionId, 'key-1', [createMockTransaction('1')]);

      const result = getCachedTransactions(sessionId, 'key-2');
      expect(result).toBeNull();
    });

    it('should handle empty transaction arrays', () => {
      const sessionId = 'session-1';
      const cacheKey = 'empty-key';

      setCachedTransactions(sessionId, cacheKey, []);
      const result = getCachedTransactions(sessionId, cacheKey);

      expect(result).toEqual([]);
    });

    it('should isolate caches between sessions', () => {
      const transactions1 = [createMockTransaction('1')];
      const transactions2 = [createMockTransaction('2')];
      const cacheKey = 'same-key';

      setCachedTransactions('session-1', cacheKey, transactions1);
      setCachedTransactions('session-2', cacheKey, transactions2);

      expect(getCachedTransactions('session-1', cacheKey)).toEqual(transactions1);
      expect(getCachedTransactions('session-2', cacheKey)).toEqual(transactions2);
    });

    it('should handle multiple cache keys per session', () => {
      const sessionId = 'session-1';
      const transactions1 = [createMockTransaction('1')];
      const transactions2 = [createMockTransaction('2')];

      setCachedTransactions(sessionId, 'key-1', transactions1);
      setCachedTransactions(sessionId, 'key-2', transactions2);

      expect(getCachedTransactions(sessionId, 'key-1')).toEqual(transactions1);
      expect(getCachedTransactions(sessionId, 'key-2')).toEqual(transactions2);
    });

    it('should overwrite existing cache entry', () => {
      const sessionId = 'session-1';
      const cacheKey = 'key-1';
      const oldTransactions = [createMockTransaction('1')];
      const newTransactions = [createMockTransaction('2'), createMockTransaction('3')];

      setCachedTransactions(sessionId, cacheKey, oldTransactions);
      setCachedTransactions(sessionId, cacheKey, newTransactions);

      const result = getCachedTransactions(sessionId, cacheKey);
      expect(result).toEqual(newTransactions);
      expect(result).toHaveLength(2);
    });
  });

  describe('cache expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire cache after TTL', () => {
      const sessionId = 'session-1';
      const cacheKey = 'key-1';
      const transactions = [createMockTransaction('1')];

      setCachedTransactions(sessionId, cacheKey, transactions);

      // Cache should be valid immediately
      expect(getCachedTransactions(sessionId, cacheKey)).toEqual(transactions);

      // Advance time past TTL (10 minutes + 1 second)
      vi.advanceTimersByTime(10 * 60 * 1000 + 1000);

      // Cache should be expired
      expect(getCachedTransactions(sessionId, cacheKey)).toBeNull();
    });

    it('should keep cache before TTL expires', () => {
      const sessionId = 'session-1';
      const cacheKey = 'key-1';
      const transactions = [createMockTransaction('1')];

      setCachedTransactions(sessionId, cacheKey, transactions);

      // Advance time to just before TTL (9 minutes)
      vi.advanceTimersByTime(9 * 60 * 1000);

      // Cache should still be valid
      expect(getCachedTransactions(sessionId, cacheKey)).toEqual(transactions);
    });
  });

  describe('clearSessionCache', () => {
    it('should clear all cache for a session', () => {
      const sessionId = 'session-1';

      setCachedTransactions(sessionId, 'key-1', [createMockTransaction('1')]);
      setCachedTransactions(sessionId, 'key-2', [createMockTransaction('2')]);

      clearSessionCache(sessionId);

      expect(getCachedTransactions(sessionId, 'key-1')).toBeNull();
      expect(getCachedTransactions(sessionId, 'key-2')).toBeNull();
    });

    it('should not affect other sessions', () => {
      setCachedTransactions('session-1', 'key-1', [createMockTransaction('1')]);
      setCachedTransactions('session-2', 'key-1', [createMockTransaction('2')]);

      clearSessionCache('session-1');

      expect(getCachedTransactions('session-1', 'key-1')).toBeNull();
      expect(getCachedTransactions('session-2', 'key-1')).not.toBeNull();
    });

    it('should handle clearing non-existent session', () => {
      // Should not throw
      expect(() => clearSessionCache('non-existent')).not.toThrow();
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all sessions and keys', () => {
      setCachedTransactions('session-1', 'key-1', [createMockTransaction('1')]);
      setCachedTransactions('session-1', 'key-2', [createMockTransaction('2')]);
      setCachedTransactions('session-2', 'key-1', [createMockTransaction('3')]);

      clearAllCaches();

      expect(getCachedTransactions('session-1', 'key-1')).toBeNull();
      expect(getCachedTransactions('session-1', 'key-2')).toBeNull();
      expect(getCachedTransactions('session-2', 'key-1')).toBeNull();
    });
  });

  describe('setSessionTracker', () => {
    it('should call tracker function when new session is cached', () => {
      const tracker = vi.fn();
      setSessionTracker(tracker);

      setCachedTransactions('new-session', 'key', [createMockTransaction('1')]);

      expect(tracker).toHaveBeenCalledWith('new-session');
    });

    it('should not call tracker for existing session', () => {
      const tracker = vi.fn();

      // Set up cache first
      setCachedTransactions('existing-session', 'key-1', [createMockTransaction('1')]);

      // Now set tracker
      setSessionTracker(tracker);

      // Add another key to existing session
      setCachedTransactions('existing-session', 'key-2', [createMockTransaction('2')]);

      // Tracker should not be called since session already existed
      expect(tracker).not.toHaveBeenCalled();
    });
  });
});
