import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DuplicateTransactionFinder } from './duplicateFinder.js';
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
function createMockTransaction(overrides: {
  id?: string;
  date?: string;
  amount?: string;
  description?: string;
  type?: string;
  sourceId?: string;
  sourceName?: string;
  destinationId?: string;
  destinationName?: string;
  currencyCode?: string;
  externalId?: string | null;
  importHash?: string | null;
}): FireflyTransaction {
  return {
    id: overrides.id || '1',
    type: 'transactions',
    attributes: {
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      user: '1',
      group_title: null,
      transactions: [
        {
          user: '1',
          transaction_journal_id: overrides.id || '1',
          type: (overrides.type as any) || 'withdrawal',
          date: overrides.date || '2024-01-15',
          order: 0,
          currency_id: '1',
          currency_code: overrides.currencyCode || 'EUR',
          currency_symbol: '€',
          currency_decimal_places: 2,
          foreign_currency_id: null,
          foreign_currency_code: null,
          foreign_currency_symbol: null,
          foreign_currency_decimal_places: null,
          amount: overrides.amount || '100.00',
          foreign_amount: null,
          description: overrides.description || 'Test transaction',
          source_id: overrides.sourceId || '1',
          source_name: overrides.sourceName || 'Checking Account',
          source_iban: null,
          source_type: 'Asset account',
          destination_id: overrides.destinationId || '2',
          destination_name: overrides.destinationName || 'Shop',
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
          external_id: overrides.externalId ?? null,
          external_url: null,
          original_source: null,
          recurrence_id: null,
          recurrence_total: null,
          recurrence_count: null,
          bunq_payment_id: null,
          import_hash_v2: overrides.importHash ?? null,
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

describe('DuplicateTransactionFinder', () => {
  let mockFireflyApi: any;
  let finder: DuplicateTransactionFinder;

  beforeEach(() => {
    mockFireflyApi = {
      getAllTransactions: vi.fn().mockResolvedValue([]),
      deleteTransaction: vi.fn().mockResolvedValue(undefined),
    };
    finder = new DuplicateTransactionFinder(mockFireflyApi);
  });

  describe('findDuplicates', () => {
    it('should return empty array when no transactions', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });

    it('should return empty array when only one transaction', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([createMockTransaction({ id: '1' })]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });

    it('should detect duplicates with same date and amount', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same description',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same description',
          sourceId: '1',
          destinationId: '2',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      expect(result[0].transactions).toHaveLength(2);
      expect(result[0].matchReasons).toContain('Same date');
      expect(result[0].matchReasons).toContain('Exact same amount');
    });

    it('should detect duplicates within date range', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Test',
          sourceId: '1',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-17', // 2 days apart
          amount: '100.00',
          description: 'Test',
          sourceId: '1',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31', {
        dateRange: 3,
      });

      expect(result).toHaveLength(1);
      expect(result[0].matchReasons).toContain('Dates within 2 day(s)');
    });

    it('should not detect duplicates with different amounts', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '200.00',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });

    it('should not detect duplicates with different types', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          type: 'withdrawal',
          date: '2024-01-15',
          amount: '100.00',
        }),
        createMockTransaction({
          id: '2',
          type: 'deposit',
          date: '2024-01-15',
          amount: '100.00',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toEqual([]);
    });

    it('should not detect duplicates outside date range', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-01',
          amount: '100.00',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15', // 14 days apart
          amount: '100.00',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31', {
        dateRange: 3,
      });

      expect(result).toEqual([]);
    });

    it('should detect duplicates with same external ID', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Transaction',
          sourceId: '1',
          externalId: 'EXT-123',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Transaction',
          sourceId: '1',
          externalId: 'EXT-123',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      expect(result[0].matchReasons).toContain('Same external ID');
    });

    it('should detect duplicates with same import hash', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Transaction',
          sourceId: '1',
          importHash: 'HASH-ABC',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Transaction',
          sourceId: '1',
          importHash: 'HASH-ABC',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      expect(result[0].matchReasons).toContain('Same import hash');
    });

    it('should include confidence breakdown', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same description',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same description',
          sourceId: '1',
          destinationId: '2',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result[0].confidenceBreakdown).toBeDefined();
      expect(result[0].confidenceBreakdown.dateMatch).toBeGreaterThan(0);
      expect(result[0].confidenceBreakdown.amountMatch).toBeGreaterThan(0);
    });

    it('should respect includeDescriptionMatch option', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Different description',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Another description',
          sourceId: '1',
          destinationId: '2',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31', {
        includeDescriptionMatch: false,
      });

      // Should still detect as duplicate based on date, amount, and accounts
      expect(result).toHaveLength(1);
    });

    it('should sort results by match score (highest first)', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        // Lower score pair (less matching criteria)
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'A',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-17', // 2 days apart
          amount: '100.00',
          description: 'B', // Different
          sourceId: '1',
          destinationId: '2',
        }),
        // Higher score pair (same date, same description)
        createMockTransaction({
          id: '3',
          date: '2024-01-20',
          amount: '200.00',
          description: 'Same text',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '4',
          date: '2024-01-20',
          amount: '200.00',
          description: 'Same text',
          sourceId: '1',
          destinationId: '2',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toHaveLength(2);
      // First result should have higher score
      expect(result[0].matchScore).toBeGreaterThanOrEqual(result[1].matchScore);
    });
  });

  describe('streamFindDuplicates', () => {
    it('should emit progress events', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({ id: '1' }),
        createMockTransaction({ id: '2' }),
      ]);

      const events: any[] = [];
      for await (const event of finder.streamFindDuplicates('2024-01-01', '2024-01-31')) {
        events.push(event);
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should emit result events for each duplicate group', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same',
          sourceId: '1',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same',
          sourceId: '1',
        }),
      ]);

      const events: any[] = [];
      for await (const event of finder.streamFindDuplicates('2024-01-01', '2024-01-31')) {
        events.push(event);
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents).toHaveLength(1);
      expect(resultEvents[0].data.transactions).toHaveLength(2);
    });

    it('should emit complete event at the end', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([]);

      const events: any[] = [];
      for await (const event of finder.streamFindDuplicates('2024-01-01', '2024-01-31')) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent.data.total).toBe(0);
    });

    it('should use cached transactions when provided', async () => {
      const cachedTransactions = [
        createMockTransaction({ id: '1' }),
        createMockTransaction({ id: '2' }),
      ];

      const events: any[] = [];
      for await (const event of finder.streamFindDuplicates(
        undefined,
        undefined,
        undefined,
        cachedTransactions
      )) {
        events.push(event);
      }

      // Should not call API when cached transactions are provided
      expect(mockFireflyApi.getAllTransactions).not.toHaveBeenCalled();
    });
  });

  describe('deleteTransaction', () => {
    it('should delete a transaction', async () => {
      await finder.deleteTransaction('123');

      expect(mockFireflyApi.deleteTransaction).toHaveBeenCalledWith('123');
    });
  });

  describe('edge cases', () => {
    it('should handle transactions without splits', async () => {
      const transactionWithNoSplits: FireflyTransaction = {
        id: '1',
        type: 'transactions',
        attributes: {
          created_at: '2024-01-01',
          updated_at: '2024-01-01',
          user: '1',
          group_title: null,
          transactions: [],
        },
      };

      mockFireflyApi.getAllTransactions.mockResolvedValue([
        transactionWithNoSplits,
        createMockTransaction({ id: '2' }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      // Should not crash, just skip transactions without splits
      expect(result).toEqual([]);
    });

    it('should handle group with more than 2 duplicates', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({
          id: '1',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '2',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same',
          sourceId: '1',
          destinationId: '2',
        }),
        createMockTransaction({
          id: '3',
          date: '2024-01-15',
          amount: '100.00',
          description: 'Same',
          sourceId: '1',
          destinationId: '2',
        }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toHaveLength(1);
      expect(result[0].transactions).toHaveLength(3);
    });

    it('should generate unique IDs for duplicate groups', async () => {
      mockFireflyApi.getAllTransactions.mockResolvedValue([
        createMockTransaction({ id: '1', date: '2024-01-15', amount: '100.00', sourceId: '1' }),
        createMockTransaction({ id: '2', date: '2024-01-15', amount: '100.00', sourceId: '1' }),
        createMockTransaction({ id: '3', date: '2024-01-20', amount: '200.00', sourceId: '1' }),
        createMockTransaction({ id: '4', date: '2024-01-20', amount: '200.00', sourceId: '1' }),
      ]);

      const result = await finder.findDuplicates('2024-01-01', '2024-01-31');

      expect(result).toHaveLength(2);
      expect(result[0].id).not.toBe(result[1].id);
      // IDs should be valid UUIDs
      expect(result[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });
});
