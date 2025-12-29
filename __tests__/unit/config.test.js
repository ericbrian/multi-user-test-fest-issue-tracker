/**
 * Unit tests for config validation
 */

// Mock dotenv before requiring config
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

describe('Config Validation', () => {
  let originalEnv;
  let validateConfig;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Mock process.exit
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    
    // Clear require cache to get fresh module
    jest.resetModules();
    validateConfig = require('../../src/config').validateConfig;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Required variables', () => {
    test('should fail without DATABASE_URL', () => {
      delete process.env.DATABASE_URL;
      process.env.SESSION_SECRET = 'a'.repeat(32);
      
      expect(() => validateConfig()).toThrow();
    });

    test('should fail without SESSION_SECRET', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      delete process.env.SESSION_SECRET;
      
      expect(() => validateConfig()).toThrow();
    });

    test('should fail with default SESSION_SECRET', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'change_me_session_secret';
      
      expect(() => validateConfig()).toThrow();
    });
  });

  describe('Valid configuration', () => {
    test('should pass with valid required config', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      
      const config = validateConfig();
      
      expect(config).toBeDefined();
      expect(config.DATABASE_URL).toBe('postgresql://localhost/test');
      expect(config.SESSION_SECRET).toBe('a'.repeat(32));
    });

    test('should use default values for optional config', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      delete process.env.PORT;
      delete process.env.DB_SCHEMA;
      
      const config = validateConfig();
      
      expect(config.PORT).toBe(3000);
      expect(config.SCHEMA).toBe('testfest');
    });

    test('should parse TAGS correctly', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.TAGS = 'bug,enhancement,wontfix';
      
      const config = validateConfig();
      
      expect(config.TAGS).toEqual(['bug', 'enhancement', 'wontfix']);
    });
  });

  describe('Schema validation', () => {
    test('should accept testfest schema', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.DB_SCHEMA = 'testfest';
      
      const config = validateConfig();
      
      expect(config.SCHEMA).toBe('testfest');
    });

    test('should reject public schema', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.DB_SCHEMA = 'public';
      
      expect(() => validateConfig()).toThrow();
    });

    test('should reject invalid schema', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.DB_SCHEMA = 'malicious; DROP TABLE users;';
      
      expect(() => validateConfig()).toThrow();
    });
  });

  describe('Port validation', () => {
    test('should accept valid port', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.PORT = '8080';
      
      const config = validateConfig();
      
      expect(config.PORT).toBe(8080);
    });

    test('should reject invalid port', () => {
      process.env.DATABASE_URL = 'postgresql://localhost/test';
      process.env.SESSION_SECRET = 'a'.repeat(32);
      process.env.PORT = '99999';
      
      expect(() => validateConfig()).toThrow();
    });
  });
});
