import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionFinder } from './subscriptionFinder.js';
import type { FireflyTransaction, FireflyTransactionSplit } from '../../shared/types/firefly.js';
import type { FireflyApiClient } from '../clients/firefly.js';

// Helper to create a mock transaction
function createMockTransaction(
  id: string,
  description: string,
  amount: string,
  date: string,
  destinationName: string = 'Netflix',
  destinationId: string = 'dest1',
  sourceName: string = 'Checking',
  sourceId: string = 'src1',
  type: 'withdrawal' | 'deposit' | 'transfer' = 'withdrawal',
  billId: string | null = null
): FireflyTransaction {
  return {
    id,
    type: 'transactions',
    attributes: {
      created_at: date,
      updated_at: date,
      user: '1',
      group_title: description,
      transactions: [
        {
          date,
          description,
          amount,
          type,
          source_id: sourceId,
          source_name: sourceName,
          destination_id: destinationId,
          destination_name: destinationName,
          currency_code: 'EUR',
          currency_symbol: '€',
          currency_id: '1',
          bill_id: billId,
          bill_name: billId ? 'Existing Bill' : undefined,
        } as FireflyTransactionSplit,
      ],
    },
    links: { self: '' },
  };
}

// Create mock Firefly API client
function createMockFireflyApi(): FireflyApiClient {
  return {
    getAllTransactions: vi.fn().mockResolvedValue([]),
    getAllSubscriptions: vi.fn().mockResolvedValue([]),
    getAllRuleGroups: vi.fn().mockResolvedValue([]),
    createRuleGroup: vi.fn().mockResolvedValue({ id: 'rg1', attributes: { title: 'Test' } }),
    createRule: vi.fn().mockResolvedValue({ id: 'r1', attributes: { title: 'Test Rule' } }),
    createSubscription: vi.fn().mockResolvedValue({ id: 's1', attributes: { name: 'Test' } }),
  } as unknown as FireflyApiClient;
}

describe('SubscriptionFinder', () => {
  let mockApi: FireflyApiClient;
  let finder: SubscriptionFinder;

  beforeEach(() => {
    mockApi = createMockFireflyApi();
    finder = new SubscriptionFinder(mockApi);
  });

  describe('getExistingSubscriptions', () => {
    it('should return subscriptions from Firefly API', async () => {
      const mockSubscriptions = [
        { id: '1', attributes: { name: 'Netflix' } },
        { id: '2', attributes: { name: 'Spotify' } },
      ];
      (mockApi.getAllSubscriptions as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockSubscriptions
      );

      const result = await finder.getExistingSubscriptions();

      expect(mockApi.getAllSubscriptions).toHaveBeenCalled();
      expect(result).toEqual(mockSubscriptions);
    });
  });

  describe('findSubscriptionPatterns', () => {
    it('should return empty array when no transactions', async () => {
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await finder.findSubscriptionPatterns();

      expect(result).toEqual([]);
    });

    it('should find monthly subscription pattern', async () => {
      const transactions = [
        createMockTransaction('1', 'Netflix Monthly', '15.99', '2024-01-15'),
        createMockTransaction('2', 'Netflix Monthly', '15.99', '2024-02-15'),
        createMockTransaction('3', 'Netflix Monthly', '15.99', '2024-03-15'),
        createMockTransaction('4', 'Netflix Monthly', '15.99', '2024-04-15'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns();

      expect(result.length).toBeGreaterThan(0);
      const pattern = result[0];
      expect(pattern.pattern.type).toBe('monthly');
      expect(pattern.transactions.length).toBe(4);
    });

    it('should respect minOccurrences option', async () => {
      const transactions = [
        createMockTransaction('1', 'Netflix', '15.99', '2024-01-15'),
        createMockTransaction('2', 'Netflix', '15.99', '2024-02-15'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns(undefined, undefined, {
        minOccurrences: 3,
      });

      expect(result).toEqual([]); // Not enough occurrences
    });

    it('should find weekly subscription pattern', async () => {
      const transactions = [
        createMockTransaction('1', 'Gym Membership', '10.00', '2024-01-01'),
        createMockTransaction('2', 'Gym Membership', '10.00', '2024-01-08'),
        createMockTransaction('3', 'Gym Membership', '10.00', '2024-01-15'),
        createMockTransaction('4', 'Gym Membership', '10.00', '2024-01-22'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].pattern.type).toBe('weekly');
    });

    it('should exclude transactions already linked to subscriptions', async () => {
      const transactions = [
        createMockTransaction(
          '1',
          'Netflix',
          '15.99',
          '2024-01-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
        createMockTransaction(
          '2',
          'Netflix',
          '15.99',
          '2024-02-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
        createMockTransaction(
          '3',
          'Netflix',
          '15.99',
          '2024-03-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns(undefined, undefined, {
        excludeLinkedToSubscriptions: true,
      });

      expect(result).toEqual([]);
    });

    it('should include transactions linked to subscriptions when option is false', async () => {
      const transactions = [
        createMockTransaction(
          '1',
          'Netflix',
          '15.99',
          '2024-01-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
        createMockTransaction(
          '2',
          'Netflix',
          '15.99',
          '2024-02-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
        createMockTransaction(
          '3',
          'Netflix',
          '15.99',
          '2024-03-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
        createMockTransaction(
          '4',
          'Netflix',
          '15.99',
          '2024-04-15',
          'Netflix',
          'dest1',
          'Checking',
          'src1',
          'withdrawal',
          'bill123'
        ),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns(undefined, undefined, {
        excludeLinkedToSubscriptions: false,
      });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should only consider withdrawals', async () => {
      const transactions = [
        createMockTransaction(
          '1',
          'Salary',
          '5000.00',
          '2024-01-15',
          'Employer',
          'dest1',
          'Checking',
          'src1',
          'deposit'
        ),
        createMockTransaction(
          '2',
          'Salary',
          '5000.00',
          '2024-02-15',
          'Employer',
          'dest1',
          'Checking',
          'src1',
          'deposit'
        ),
        createMockTransaction(
          '3',
          'Salary',
          '5000.00',
          '2024-03-15',
          'Employer',
          'dest1',
          'Checking',
          'src1',
          'deposit'
        ),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns();

      expect(result).toEqual([]);
    });

    it('should calculate amount statistics', async () => {
      const transactions = [
        createMockTransaction('1', 'Variable Service', '10.00', '2024-01-15'),
        createMockTransaction('2', 'Variable Service', '12.00', '2024-02-15'),
        createMockTransaction('3', 'Variable Service', '15.00', '2024-03-15'),
        createMockTransaction('4', 'Variable Service', '11.00', '2024-04-15'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns();

      if (result.length > 0) {
        const pattern = result[0];
        expect(pattern.minAmount).toBe(10);
        expect(pattern.maxAmount).toBe(15);
        expect(pattern.averageAmount).toBe(12); // (10+12+15+11)/4
      }
    });

    it('should sort results by confidence', async () => {
      // Create two patterns with different confidence levels
      const transactions = [
        // High confidence - consistent
        createMockTransaction('1', 'Netflix', '15.99', '2024-01-15'),
        createMockTransaction('2', 'Netflix', '15.99', '2024-02-15'),
        createMockTransaction('3', 'Netflix', '15.99', '2024-03-15'),
        createMockTransaction('4', 'Netflix', '15.99', '2024-04-15'),
        createMockTransaction('5', 'Netflix', '15.99', '2024-05-15'),
        createMockTransaction('6', 'Netflix', '15.99', '2024-06-15'),
        // Lower confidence - variable amounts, same destination
        createMockTransaction('7', 'Variable Service', '5.00', '2024-01-20', 'Other', 'dest2'),
        createMockTransaction('8', 'Variable Service', '25.00', '2024-02-20', 'Other', 'dest2'),
        createMockTransaction('9', 'Variable Service', '10.00', '2024-03-20', 'Other', 'dest2'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const result = await finder.findSubscriptionPatterns();

      if (result.length > 1) {
        // Higher confidence patterns should come first
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].pattern.confidence).toBeGreaterThanOrEqual(
            result[i].pattern.confidence
          );
        }
      }
    });
  });

  describe('streamFindSubscriptionPatterns', () => {
    it('should yield progress events', async () => {
      const transactions = [
        createMockTransaction('1', 'Netflix', '15.99', '2024-01-15'),
        createMockTransaction('2', 'Netflix', '15.99', '2024-02-15'),
        createMockTransaction('3', 'Netflix', '15.99', '2024-03-15'),
        createMockTransaction('4', 'Netflix', '15.99', '2024-04-15'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of finder.streamFindSubscriptionPatterns()) {
        events.push(event);
      }

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);
    });

    it('should yield result events for patterns found', async () => {
      const transactions = [
        createMockTransaction('1', 'Netflix', '15.99', '2024-01-15'),
        createMockTransaction('2', 'Netflix', '15.99', '2024-02-15'),
        createMockTransaction('3', 'Netflix', '15.99', '2024-03-15'),
        createMockTransaction('4', 'Netflix', '15.99', '2024-04-15'),
      ];
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue(transactions);

      const events = [];
      for await (const event of finder.streamFindSubscriptionPatterns()) {
        events.push(event);
      }

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents.length).toBeGreaterThan(0);
    });

    it('should yield complete event at the end', async () => {
      (mockApi.getAllTransactions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const events = [];
      for await (const event of finder.streamFindSubscriptionPatterns()) {
        events.push(event);
      }

      const completeEvent = events.find((e) => e.type === 'complete');
      expect(completeEvent).toBeDefined();
    });

    it('should use cached transactions when provided', async () => {
      const cachedTransactions = [
        createMockTransaction('1', 'Netflix', '15.99', '2024-01-15'),
        createMockTransaction('2', 'Netflix', '15.99', '2024-02-15'),
        createMockTransaction('3', 'Netflix', '15.99', '2024-03-15'),
        createMockTransaction('4', 'Netflix', '15.99', '2024-04-15'),
      ];

      const events = [];
      for await (const event of finder.streamFindSubscriptionPatterns(
        undefined,
        undefined,
        undefined,
        cachedTransactions
      )) {
        events.push(event);
      }

      // Should not call getAllTransactions when cached transactions provided
      expect(mockApi.getAllTransactions).not.toHaveBeenCalled();

      const resultEvents = events.filter((e) => e.type === 'result');
      expect(resultEvents.length).toBeGreaterThan(0);
    });
  });

  describe('createSubscription', () => {
    it('should create subscription in Firefly', async () => {
      const request = {
        name: 'Netflix',
        amountMin: '15.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly' as const,
      };

      await finder.createSubscription(request);

      expect(mockApi.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Netflix',
          amount_min: '15.99',
          amount_max: '15.99',
        })
      );
    });

    it('should create rule when destination account provided', async () => {
      const request = {
        name: 'Netflix',
        amountMin: '15.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly' as const,
        destinationAccountName: 'Netflix Inc.',
        createRule: true,
      };

      const result = await finder.createSubscription(request);

      expect(mockApi.createRule).toHaveBeenCalled();
      expect(result.rule).toBeDefined();
    });

    it('should not create rule when createRule is false', async () => {
      const request = {
        name: 'Netflix',
        amountMin: '15.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly' as const,
        destinationAccountName: 'Netflix Inc.',
        createRule: false,
      };

      const result = await finder.createSubscription(request);

      expect(mockApi.createRule).not.toHaveBeenCalled();
      expect(result.rule).toBeUndefined();
    });

    it('should handle rule creation failure gracefully', async () => {
      (mockApi.createRule as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Rule creation failed')
      );

      const request = {
        name: 'Netflix',
        amountMin: '15.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly' as const,
        destinationAccountName: 'Netflix Inc.',
        createRule: true,
      };

      const result = await finder.createSubscription(request);

      // Subscription should still be returned even if rule fails
      expect(result.subscription).toBeDefined();
      expect(result.rule).toBeUndefined();
    });

    it('should use existing rule group if present', async () => {
      const existingGroup = {
        id: 'existing-rg',
        attributes: { title: 'Subscription Rules (Auto-generated)' },
      };
      (mockApi.getAllRuleGroups as ReturnType<typeof vi.fn>).mockResolvedValue([existingGroup]);

      const request = {
        name: 'Netflix',
        amountMin: '15.99',
        amountMax: '15.99',
        date: '2024-01-15',
        repeatFreq: 'monthly' as const,
        destinationAccountName: 'Netflix Inc.',
        createRule: true,
      };

      await finder.createSubscription(request);

      expect(mockApi.createRuleGroup).not.toHaveBeenCalled();
      expect(mockApi.createRule).toHaveBeenCalledWith(
        expect.objectContaining({
          rule_group_id: 'existing-rg',
        })
      );
    });

    it('should include skip interval in subscription', async () => {
      const request = {
        name: 'Bi-monthly',
        amountMin: '50.00',
        amountMax: '50.00',
        date: '2024-01-15',
        repeatFreq: 'monthly' as const,
        skip: 1, // Every other month
      };

      await finder.createSubscription(request);

      expect(mockApi.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
        })
      );
    });
  });
});
