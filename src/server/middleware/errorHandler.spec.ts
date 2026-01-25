import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  badRequest,
  unauthorized,
  notFound,
  internalError,
  errorHandler,
  asyncHandler,
  setupSSE,
} from './errorHandler.js';

// Mock the config module
vi.mock('../config/index.js', () => ({
  config: {
    nodeEnv: 'development',
  },
}));

// Mock the logger
vi.mock('../utils/logger.js', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('AppError', () => {
  it('should create an error with status code', () => {
    const error = new AppError(400, 'Bad request');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Bad request');
    expect(error.isOperational).toBe(true);
  });

  it('should create non-operational errors', () => {
    const error = new AppError(500, 'Internal error', false);
    expect(error.isOperational).toBe(false);
  });

  it('should have correct name', () => {
    const error = new AppError(404, 'Not found');
    expect(error.name).toBe('AppError');
  });

  it('should capture stack trace', () => {
    const error = new AppError(500, 'Error');
    expect(error.stack).toBeDefined();
  });
});

describe('error factory functions', () => {
  describe('badRequest', () => {
    it('should create 400 error', () => {
      const error = badRequest('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Invalid input');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('unauthorized', () => {
    it('should create 401 error with default message', () => {
      const error = unauthorized();
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Unauthorized');
    });

    it('should create 401 error with custom message', () => {
      const error = unauthorized('Invalid token');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('notFound', () => {
    it('should create 404 error with default message', () => {
      const error = notFound();
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Resource not found');
    });

    it('should create 404 error with custom message', () => {
      const error = notFound('User not found');
      expect(error.message).toBe('User not found');
    });
  });

  describe('internalError', () => {
    it('should create 500 error with default message', () => {
      const error = internalError();
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Internal server error');
    });

    it('should create non-operational 500 error', () => {
      const error = internalError('Database connection failed');
      expect(error.isOperational).toBe(false);
    });
  });
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnThis();

    mockReq = {};
    mockRes = {
      status: statusSpy,
      json: jsonSpy,
    };
    mockNext = vi.fn();
  });

  it('should handle AppError correctly', () => {
    const error = new AppError(400, 'Bad request');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusSpy).toHaveBeenCalledWith(400);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: 'Bad request',
      })
    );
  });

  it('should handle generic Error as 500', () => {
    const error = new Error('Something went wrong');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    expect(statusSpy).toHaveBeenCalledWith(500);
  });

  it('should include stack trace in development', () => {
    const error = new AppError(400, 'Bad request');

    errorHandler(error, mockReq as Request, mockRes as Response, mockNext);

    const response = jsonSpy.mock.calls[0][0];
    expect(response.stack).toBeDefined();
  });
});

describe('asyncHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = vi.fn();
  });

  it('should call the handler function', async () => {
    const handler = vi.fn().mockResolvedValue('result');
    const wrapped = asyncHandler(handler);

    wrapped(mockReq as Request, mockRes as Response, mockNext);

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });
  });

  it('should pass errors to next', async () => {
    const error = new Error('Async error');
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = asyncHandler(handler);

    wrapped(mockReq as Request, mockRes as Response, mockNext);

    await vi.waitFor(() => {
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  it('should handle resolved promises', async () => {
    const handler = vi.fn().mockResolvedValue({ data: 'test' });
    const wrapped = asyncHandler(handler);

    wrapped(mockReq as Request, mockRes as Response, mockNext);

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalled();
    });
    // next should not be called with an error
    expect(mockNext).not.toHaveBeenCalled();
  });
});

describe('setupSSE', () => {
  let mockRes: Partial<Response> & {
    writableEnded: boolean;
    _closeCallback: (() => void) | null;
  };
  let setHeaderSpy: ReturnType<typeof vi.fn>;
  let flushHeadersSpy: ReturnType<typeof vi.fn>;
  let writeSpy: ReturnType<typeof vi.fn>;
  let endSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();

    setHeaderSpy = vi.fn();
    flushHeadersSpy = vi.fn();
    writeSpy = vi.fn();
    endSpy = vi.fn().mockImplementation(function () {
      mockRes.writableEnded = true;
    });

    mockRes = {
      setHeader: setHeaderSpy,
      flushHeaders: flushHeadersSpy,
      write: writeSpy,
      end: endSpy,
      writableEnded: false,
      _closeCallback: null,
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          mockRes._closeCallback = callback;
        }
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set correct SSE headers', () => {
    setupSSE(mockRes as unknown as Response);

    expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(setHeaderSpy).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(setHeaderSpy).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(setHeaderSpy).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    expect(flushHeadersSpy).toHaveBeenCalled();
  });

  it('should return SSEWriter object', () => {
    const sse = setupSSE(mockRes as unknown as Response);

    expect(sse.send).toBeDefined();
    expect(sse.error).toBeDefined();
    expect(sse.end).toBeDefined();
    expect(sse.isConnected).toBeDefined();
    expect(sse.onClose).toBeDefined();
  });

  describe('SSEWriter.send', () => {
    it('should write SSE formatted data', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      sse.send('test', { message: 'hello' });

      expect(writeSpy).toHaveBeenCalledWith('data: {"type":"test","data":{"message":"hello"}}\n\n');
    });

    it('should return true when connected', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      const result = sse.send('test', { data: true });

      expect(result).toBe(true);
    });

    it('should return false when disconnected', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      mockRes.writableEnded = true;
      const result = sse.send('test', { data: true });

      expect(result).toBe(false);
    });
  });

  describe('SSEWriter.error', () => {
    it('should send error event with Error object', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      sse.error(new Error('Something failed'));

      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Something failed'));
    });

    it('should send error event with string', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      sse.error('String error');

      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('String error'));
    });

    it('should end the stream after error', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      sse.error('Error');

      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('SSEWriter.end', () => {
    it('should call res.end', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      sse.end();

      expect(endSpy).toHaveBeenCalled();
    });

    it('should not call res.end if already ended', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      mockRes.writableEnded = true;
      sse.end();

      expect(endSpy).not.toHaveBeenCalled();
    });
  });

  describe('SSEWriter.isConnected', () => {
    it('should return true when connected', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      expect(sse.isConnected()).toBe(true);
    });

    it('should return false after end', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      sse.end();

      expect(sse.isConnected()).toBe(false);
    });
  });

  describe('SSEWriter.onClose', () => {
    it('should register close callback', () => {
      const sse = setupSSE(mockRes as unknown as Response);
      const callback = vi.fn();

      sse.onClose(callback);

      // Simulate close event
      if (mockRes._closeCallback) {
        mockRes._closeCallback();
      }

      expect(callback).toHaveBeenCalled();
    });

    it('should call multiple callbacks on close', () => {
      const sse = setupSSE(mockRes as unknown as Response);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      sse.onClose(callback1);
      sse.onClose(callback2);

      if (mockRes._closeCallback) {
        mockRes._closeCallback();
      }

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeat at interval', () => {
      setupSSE(mockRes as unknown as Response);

      // Clear initial calls
      writeSpy.mockClear();

      // Advance timer by 25 seconds (heartbeat interval)
      vi.advanceTimersByTime(25000);

      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining(': heartbeat'));
    });

    it('should stop heartbeat on close', () => {
      const sse = setupSSE(mockRes as unknown as Response);

      // Clear initial calls
      writeSpy.mockClear();

      // End the connection
      sse.end();

      // Advance timer
      vi.advanceTimersByTime(30000);

      // Heartbeat write should not be called (only the initial setup)
      // Filter out any non-heartbeat writes
      const heartbeatCalls = writeSpy.mock.calls.filter((call: [string]) =>
        call[0].includes('heartbeat')
      );
      expect(heartbeatCalls).toHaveLength(0);
    });
  });
});
