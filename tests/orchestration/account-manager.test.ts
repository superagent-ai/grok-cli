import { AccountManager } from '../../src/orchestration/account-manager.js';

/**
 * Test suite for AccountManager
 *
 * Tests the account management system including:
 * - Account initialization
 * - Load balancing strategies (round-robin, least-loaded, cost-optimized)
 * - Rate limiting (60 requests/min)
 * - Usage tracking (requests, tokens, costs)
 */

describe('AccountManager', () => {
  const testAccounts = [
    { apiKey: 'test-key-1', name: 'account-1' },
    { apiKey: 'test-key-2', name: 'account-2' },
  ];

  describe('Initialization', () => {
    it('should initialize with accounts', () => {
      const manager = new AccountManager(testAccounts);
      const stats = manager.getStats();

      expect(stats).toHaveLength(2);
      expect(stats[0].name).toBe('account-1');
      expect(stats[1].name).toBe('account-2');
    });

    it('should throw error with no accounts', () => {
      expect(() => new AccountManager([])).toThrow('At least one account is required');
    });

    it('should initialize with default round-robin strategy', () => {
      const manager = new AccountManager(testAccounts);
      expect(manager.getStrategy()).toBe('round-robin');
    });
  });

  describe('Load Balancing - Round Robin', () => {
    it('should distribute requests evenly in round-robin mode', () => {
      const manager = new AccountManager(testAccounts, 'round-robin');

      const firstClient = manager.getClient();
      const secondClient = manager.getClient();
      const thirdClient = manager.getClient();

      expect(firstClient.accountName).toBe('account-1');
      expect(secondClient.accountName).toBe('account-2');
      expect(thirdClient.accountName).toBe('account-1');
    });
  });

  describe('Load Balancing - Least Loaded', () => {
    it('should select account with fewer requests', () => {
      const manager = new AccountManager(testAccounts, 'least-loaded');

      // First request goes to account-1
      manager.getClient();
      // Record higher usage for account-1
      manager.recordUsage('account-1', 1000, 'grok-4');

      // Next request should go to account-2 (less loaded)
      const client = manager.getClient();
      expect(client.accountName).toBe('account-2');
    });
  });

  describe('Load Balancing - Cost Optimized', () => {
    it('should select account with lower total cost', () => {
      const manager = new AccountManager(testAccounts, 'cost-optimized');

      // Record higher cost for account-1
      manager.recordUsage('account-1', 10000, 'grok-4');

      // Next request should prefer account-2
      const client = manager.getClient();
      expect(client.accountName).toBe('account-2');
    });
  });

  describe('Rate Limiting', () => {
    it('should track requests per minute', () => {
      const manager = new AccountManager(testAccounts);

      // Make several requests
      for (let i = 0; i < 5; i++) {
        manager.getClient();
      }

      const stats = manager.getStats();
      expect(stats[0].requestsPerMinute).toBeGreaterThan(0);
    });

    it('should mark account as unavailable when rate limit is reached', () => {
      const manager = new AccountManager(testAccounts);

      // Make 120 requests (60 per account with round-robin)
      for (let i = 0; i < 120; i++) {
        manager.getClient();
      }

      const stats = manager.getStats();
      // At least one account should be at the limit
      expect(stats.some((s) => s.requestsPerMinute >= 60)).toBe(true);
    });
  });

  describe('Usage Tracking', () => {
    it('should track token usage', () => {
      const manager = new AccountManager(testAccounts);

      manager.recordUsage('account-1', 1000, 'grok-4');

      const stats = manager.getStats();
      expect(stats[0].tokens).toBe(1000);
    });

    it('should calculate costs correctly for different models', () => {
      const manager = new AccountManager(testAccounts);

      // grok-code-fast-1: $0.005/1K tokens
      manager.recordUsage('account-1', 1000, 'grok-code-fast-1');

      const stats = manager.getStats();
      expect(stats[0].cost).toBeCloseTo(0.005, 4);
    });

    it('should accumulate costs over multiple requests', () => {
      const manager = new AccountManager(testAccounts);

      manager.recordUsage('account-1', 1000, 'grok-4'); // $0.015
      manager.recordUsage('account-1', 1000, 'grok-4'); // $0.015

      const stats = manager.getStats();
      expect(stats[0].cost).toBeCloseTo(0.030, 4);
    });
  });

  describe('Strategy Management', () => {
    it('should allow changing strategy', () => {
      const manager = new AccountManager(testAccounts, 'round-robin');

      manager.setStrategy('least-loaded');
      expect(manager.getStrategy()).toBe('least-loaded');
    });
  });

  describe('Stats Management', () => {
    it('should provide accurate stats for all accounts', () => {
      const manager = new AccountManager(testAccounts);

      manager.getClient();
      manager.recordUsage('account-1', 500, 'grok-3-fast');

      const stats = manager.getStats();

      expect(stats[0].requests).toBeGreaterThan(0);
      expect(stats[0].tokens).toBe(500);
      expect(stats[0].cost).toBeGreaterThan(0);
      expect(stats[0].available).toBe(true);
    });

    it('should reset stats correctly', () => {
      const manager = new AccountManager(testAccounts);

      manager.getClient();
      manager.recordUsage('account-1', 1000, 'grok-4');

      manager.resetStats();

      const stats = manager.getStats();
      expect(stats[0].requests).toBe(0);
      expect(stats[0].tokens).toBe(0);
      expect(stats[0].cost).toBe(0);
    });
  });
});
