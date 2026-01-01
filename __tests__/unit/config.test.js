/**
 * Unit tests for config validation
 * Uses Dependency Injection for robust testing without global state pollution
 */

const { validateConfig } = require('../../src/config');

describe('Config Validation', () => {
  let mockExit;

  beforeEach(() => {
    mockExit = jest.fn();
    // No need to mock process.env or dotenv as we pass explicit env objects
  });

  // Helper to create a base valid environment
  const getBaseEnv = () => ({
    DATABASE_URL: 'postgresql://localhost/test',
    SESSION_SECRET: 'a'.repeat(32),
    NODE_ENV: 'test', // defaulting to test mode to bypass SSO checks unless testing them
  });

  describe('Required variables', () => {
    test('should fail without DATABASE_URL', () => {
      const env = getBaseEnv();
      delete env.DATABASE_URL;
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('should fail without SESSION_SECRET', () => {
      const env = getBaseEnv();
      delete env.SESSION_SECRET;
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('should fail with default SESSION_SECRET', () => {
      const env = getBaseEnv();
      env.SESSION_SECRET = 'change_me_session_secret';
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Valid configuration', () => {
    test('should pass with valid required config', () => {
      const env = getBaseEnv();
      
      const config = validateConfig(env, mockExit);
      
      expect(mockExit).not.toHaveBeenCalled();
      expect(config).toBeDefined();
      expect(config.DATABASE_URL).toBe('postgresql://localhost/test');
      expect(config.SESSION_SECRET).toBe('a'.repeat(32));
    });

    test('should use default values for optional config', () => {
      const env = getBaseEnv();
      // Ensure optionals are undefined
      delete env.PORT;
      delete env.DB_SCHEMA;
      
      const config = validateConfig(env, mockExit);
      
      expect(mockExit).not.toHaveBeenCalled();
      expect(config.PORT).toBe(3000); // Default port
      expect(config.SCHEMA).toBe('testfest');
    });

    test('should parse TAGS correctly', () => {
      const env = getBaseEnv();
      env.TAGS = 'bug,enhancement,wontfix';
      
      const config = validateConfig(env, mockExit);
      
      expect(mockExit).not.toHaveBeenCalled();
      expect(config.TAGS).toEqual(['bug', 'enhancement', 'wontfix']);
    });
  });

  describe('Schema validation', () => {
    test('should accept testfest schema', () => {
      const env = getBaseEnv();
      env.DB_SCHEMA = 'testfest';
      
      const config = validateConfig(env, mockExit);
      
      expect(mockExit).not.toHaveBeenCalled();
      expect(config.SCHEMA).toBe('testfest');
    });

    test('should reject public schema', () => {
      const env = getBaseEnv();
      env.DB_SCHEMA = 'public';
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('should reject invalid schema', () => {
      const env = getBaseEnv();
      env.DB_SCHEMA = 'malicious; DROP TABLE users;';
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('Port validation', () => {
    test('should accept valid port', () => {
      const env = getBaseEnv();
      env.PORT = '8080';
      
      const config = validateConfig(env, mockExit);
      
      expect(mockExit).not.toHaveBeenCalled();
      expect(config.PORT).toBe(8080);
    });

    test('should reject invalid port', () => {
      const env = getBaseEnv();
      env.PORT = '99999';
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('SSO Validation', () => {
    test('should require SSO config in non-test mode', () => {
      const env = getBaseEnv();
      env.NODE_ENV = 'production';
      // Missing SSO vars
      
      validateConfig(env, mockExit);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

     test('should pass SSO config in non-test mode if provided', () => {
      const env = getBaseEnv();
      env.NODE_ENV = 'production';
      env.ENTRA_ISSUER = 'issuer';
      env.ENTRA_CLIENT_ID = 'id';
      env.ENTRA_CLIENT_SECRET = 'secret';
      
      validateConfig(env, mockExit);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });
});
