import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { rateLimit, resetRateLimit, getRateLimitStatus } from './rateLimit.js';

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('rateLimit middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let setHeaderSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnThis();
    setHeaderSpy = vi.fn();

    mockReq = {
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' } as any,
    };

    mockRes = {
      status: statusSpy,
      json: jsonSpy,
      setHeader: setHeaderSpy,
    };

    mockNext = vi.fn();

    // Reset rate limit state between tests
    resetRateLimit('test', '127.0.0.1');
    resetRateLimit('test', '192.168.1.1');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('basic rate limiting', () => {
    it('should allow requests under the limit', () => {
      const limiter = rateLimit('test', {
        maxRequests: 5,
        windowMs: 60000,
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should set rate limit headers', () => {
      const limiter = rateLimit('test', {
        maxRequests: 5,
        windowMs: 60000,
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should block requests over the limit', () => {
      const limiter = rateLimit('test', {
        maxRequests: 2,
        windowMs: 60000,
      });

      // Make 2 requests (should pass)
      limiter(mockReq as Request, mockRes as Response, mockNext);
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // 3rd request should be blocked
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Too many requests'),
        })
      );
    });

    it('should set Retry-After header when blocked', () => {
      const limiter = rateLimit('test', {
        maxRequests: 1,
        windowMs: 60000,
      });

      // First request passes
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Second request blocked
      setHeaderSpy.mockClear();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderSpy).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should reset after window expires', () => {
      const limiter = rateLimit('test', {
        maxRequests: 1,
        windowMs: 60000,
      });

      // First request passes
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Second request blocked
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(statusSpy).toHaveBeenCalledWith(429);

      // Advance time past the window
      vi.advanceTimersByTime(61000);

      // Reset mocks
      statusSpy.mockClear();
      mockNext = vi.fn();

      // Should pass now
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('custom key generator', () => {
    it('should use custom key generator', () => {
      const limiter = rateLimit('test', {
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: (req) => (req as any).customId || 'default',
      });

      (mockReq as any).customId = 'user-123';

      // First request passes
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Different user should also pass
      mockNext = vi.fn();
      (mockReq as any).customId = 'user-456';
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('custom message', () => {
    it('should use custom error message', () => {
      const limiter = rateLimit('test', {
        maxRequests: 1,
        windowMs: 60000,
        message: 'Custom rate limit message',
      });

      // First request passes
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Second request blocked
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Custom rate limit message',
        })
      );
    });
  });

  describe('skipSuccessfulRequests', () => {
    it('should not count successful requests when enabled', () => {
      const limiter = rateLimit('test', {
        maxRequests: 2,
        windowMs: 60000,
        skipSuccessfulRequests: true,
      });

      // Setup res.json override to simulate successful response
      const originalJson = mockRes.json;
      mockRes.json = vi.fn().mockImplementation(function (body) {
        (this as any).statusCode = 200;
        return originalJson?.call(this, body);
      });
      (mockRes as any).statusCode = 200;

      // Make requests that succeed - they should not be counted
      limiter(mockReq as Request, mockRes as Response, mockNext);
      mockRes.json!({ success: true });

      // Reset next mock
      mockNext = vi.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);
      mockRes.json!({ success: true });

      // Third request should still pass because successful ones don't count
      mockNext = vi.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('progressiveBackoff', () => {
    it('should apply backoff on auth failures', () => {
      const limiter = rateLimit('test', {
        maxRequests: 10,
        windowMs: 60000,
        progressiveBackoff: true,
        backoffBaseMs: 1000,
        backoffMaxMs: 60000,
      });

      // Setup res.json override to simulate failure
      const originalJson = mockRes.json;
      mockRes.json = vi.fn().mockImplementation(function (body) {
        return originalJson?.call(this, body);
      });
      (mockRes as any).statusCode = 401;

      // First request - will trigger backoff after failure
      limiter(mockReq as Request, mockRes as Response, mockNext);
      mockRes.json!({ success: false });

      // Immediate second request should be blocked due to backoff
      statusSpy.mockClear();
      mockNext = vi.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(429);
    });

    it('should reset failures on successful auth', () => {
      resetRateLimit('test', '127.0.0.1');

      const limiter = rateLimit('test', {
        maxRequests: 10,
        windowMs: 60000,
        progressiveBackoff: true,
        backoffBaseMs: 1000,
      });

      // Setup res.json for success
      const originalJson = mockRes.json;
      mockRes.json = vi.fn().mockImplementation(function (body) {
        return originalJson?.call(this, body);
      });
      (mockRes as any).statusCode = 200;

      // Successful request
      limiter(mockReq as Request, mockRes as Response, mockNext);
      mockRes.json!({ success: true });

      // Check that failures are reset
      const status = getRateLimitStatus('test', '127.0.0.1');
      expect(status?.failures).toBe(0);
    });
  });

  describe('different clients', () => {
    it('should track different IPs separately', () => {
      const limiter = rateLimit('test', {
        maxRequests: 1,
        windowMs: 60000,
      });

      // First client makes request
      mockReq.ip = '127.0.0.1';
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // First client blocked on second request
      mockNext = vi.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(statusSpy).toHaveBeenCalledWith(429);

      // Second client should still pass
      statusSpy.mockClear();
      mockNext = vi.fn();
      mockReq.ip = '192.168.1.1';
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(429);
    });
  });

  describe('fallback IP detection', () => {
    it('should fallback to socket.remoteAddress', () => {
      const limiter = rateLimit('test', {
        maxRequests: 5,
        windowMs: 60000,
      });

      mockReq.ip = undefined;
      (mockReq as any).socket = { remoteAddress: '10.0.0.1' };

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fallback to unknown when no IP', () => {
      const limiter = rateLimit('test', {
        maxRequests: 5,
        windowMs: 60000,
      });

      mockReq.ip = undefined;
      (mockReq as any).socket = { remoteAddress: undefined };

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});

describe('resetRateLimit', () => {
  it('should clear rate limit for a specific client', () => {
    const limiter = rateLimit('test', {
      maxRequests: 1,
      windowMs: 60000,
    });

    const mockReq: Partial<Request> = { ip: '127.0.0.1' };
    const mockRes: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    };
    const mockNext = vi.fn();

    // Use up the limit
    limiter(mockReq as Request, mockRes as Response, mockNext);

    // Reset
    resetRateLimit('test', '127.0.0.1');

    // Should be able to make requests again
    mockNext.mockClear();
    (mockRes.status as any).mockClear();
    limiter(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalledWith(429);
  });
});

describe('getRateLimitStatus', () => {
  beforeEach(() => {
    resetRateLimit('test', '127.0.0.1');
  });

  it('should return undefined for unknown client', () => {
    const status = getRateLimitStatus('test', 'unknown-ip');
    expect(status).toBeUndefined();
  });

  it('should return status for tracked client', () => {
    const limiter = rateLimit('test', {
      maxRequests: 5,
      windowMs: 60000,
    });

    const mockReq: Partial<Request> = { ip: '127.0.0.1' };
    const mockRes: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      setHeader: vi.fn(),
    };

    limiter(mockReq as Request, mockRes as Response, vi.fn());
    limiter(mockReq as Request, mockRes as Response, vi.fn());

    const status = getRateLimitStatus('test', '127.0.0.1');
    expect(status).toBeDefined();
    expect(status!.count).toBe(2);
  });
});
