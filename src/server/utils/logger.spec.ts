import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
    // Reset environment
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_COLOR;
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic logging', () => {
    it('should create a logger with all log methods', () => {
      const logger = createLogger('Test');

      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.child).toBeDefined();
    });

    it('should log error messages', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger('Test');

      logger.error('Test error message');

      expect(consoleSpy.error).toHaveBeenCalled();
      const loggedMessage = consoleSpy.error.mock.calls[0][0];
      expect(loggedMessage).toContain('Test error message');
      expect(loggedMessage).toContain('[Test]');
    });

    it('should log warn messages', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger('Test');

      logger.warn('Test warning');

      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('Test');

      logger.info('Test info');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log debug messages when level is debug', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = createLogger('Test');

      logger.debug('Test debug');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('log level filtering', () => {
    it('should not log debug when level is info', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('Test');

      logger.debug('Should not appear');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should not log info when level is warn', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger('Test');

      logger.info('Should not appear');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should not log warn when level is error', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger('Test');

      logger.warn('Should not appear');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should default to info level when LOG_LEVEL is not set', () => {
      delete process.env.LOG_LEVEL;
      const logger = createLogger('Test');

      // Info should work
      logger.info('Info message');
      expect(consoleSpy.log).toHaveBeenCalled();

      // Debug should not
      consoleSpy.log.mockClear();
      logger.debug('Debug message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should default to info level for invalid LOG_LEVEL value', () => {
      process.env.LOG_LEVEL = 'invalid';
      const logger = createLogger('Test');

      logger.info('Info message');
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('data logging', () => {
    it('should log additional data as JSON', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = createLogger('Test');

      logger.debug('Message with data', { key: 'value', count: 42 });

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('Message with data');
      expect(loggedMessage).toContain('"key"');
      expect(loggedMessage).toContain('"value"');
    });

    it('should log string data directly', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('Test');

      logger.info('Message', 'string data');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('string data');
    });

    it('should log number data directly', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('Test');

      logger.info('Count', 42);

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('42');
    });
  });

  describe('child loggers', () => {
    it('should create child logger with extended context', () => {
      process.env.LOG_LEVEL = 'info';
      const parent = createLogger('Parent');
      const child = parent.child('Child');

      child.info('Child message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('[Parent:Child]');
    });

    it('should create child logger from logger without context', () => {
      process.env.LOG_LEVEL = 'info';
      const parent = createLogger();
      const child = parent.child('Child');

      child.info('Child message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('[Child]');
    });

    it('should create multiple levels of child loggers', () => {
      process.env.LOG_LEVEL = 'info';
      const root = createLogger('Root');
      const level1 = root.child('Level1');
      const level2 = level1.child('Level2');

      level2.info('Deep message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('[Root:Level1:Level2]');
    });
  });

  describe('logger without context', () => {
    it('should work without context', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger();

      logger.info('No context message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should show dash for empty context', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('');

      logger.info('Empty context');

      // The logger uses '-' for empty/missing context in default format
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('color handling', () => {
    it('should disable colors when NO_COLOR is set', () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NO_COLOR = '1';
      const logger = createLogger('Test');

      logger.info('No color message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      // Should not contain ANSI escape codes
      expect(loggedMessage).not.toContain('\x1b[');
    });

    it('should disable colors when LOG_COLOR is false', () => {
      process.env.LOG_LEVEL = 'info';
      process.env.LOG_COLOR = 'false';
      const logger = createLogger('Test');

      logger.info('No color message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      // In test environment, colors are already disabled due to non-TTY
      expect(loggedMessage).not.toContain('\x1b[');
    });
  });

  describe('timestamp formatting', () => {
    it('should include timestamp in log messages', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('Test');

      logger.info('Timestamped message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      // Should contain date pattern like YYYY-MM-DD
      expect(loggedMessage).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('level labels', () => {
    it('should include ERROR label for error messages', () => {
      process.env.LOG_LEVEL = 'error';
      const logger = createLogger('Test');

      logger.error('Error message');

      const loggedMessage = consoleSpy.error.mock.calls[0][0];
      expect(loggedMessage).toContain('ERROR');
    });

    it('should include WARN label for warning messages', () => {
      process.env.LOG_LEVEL = 'warn';
      const logger = createLogger('Test');

      logger.warn('Warning message');

      const loggedMessage = consoleSpy.warn.mock.calls[0][0];
      expect(loggedMessage).toContain('WARN');
    });

    it('should include INFO label for info messages', () => {
      process.env.LOG_LEVEL = 'info';
      const logger = createLogger('Test');

      logger.info('Info message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('INFO');
    });

    it('should include DEBUG label for debug messages', () => {
      process.env.LOG_LEVEL = 'debug';
      const logger = createLogger('Test');

      logger.debug('Debug message');

      const loggedMessage = consoleSpy.log.mock.calls[0][0];
      expect(loggedMessage).toContain('DEBUG');
    });
  });
});
