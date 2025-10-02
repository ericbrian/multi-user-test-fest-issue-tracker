/**
 * Unit tests for middleware
 */

const { requireAuth, createDevAutoAuthMiddleware } = require('../../src/middleware');

describe('Middleware', () => {
  describe('requireAuth', () => {
    test('should pass if user is authenticated', () => {
      const req = { user: { id: '123', email: 'test@example.com' } };
      const res = {};
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should return 401 if user is not authenticated', () => {
      const req = {};
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('createDevAutoAuthMiddleware', () => {
    let mockPrisma;

    beforeEach(() => {
      // Mock getPrisma
      mockPrisma = {
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
      };

      jest.mock('../../src/prismaClient', () => ({
        getPrisma: () => mockPrisma,
      }));
    });

    afterEach(() => {
      jest.resetModules();
    });

    test('should skip if SSO is not disabled', async () => {
      const middleware = createDevAutoAuthMiddleware({
        DISABLE_SSO: false,
        DEV_USER_EMAIL: 'dev@example.com',
        DEV_USER_NAME: 'Dev User',
      });

      const req = {};
      const res = {};
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    test('should skip if user already exists', async () => {
      const middleware = createDevAutoAuthMiddleware({
        DISABLE_SSO: true,
        DEV_USER_EMAIL: 'dev@example.com',
        DEV_USER_NAME: 'Dev User',
      });

      const existingUser = { id: '123', email: 'test@example.com' };
      const req = { user: existingUser };
      const res = {};
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBe(existingUser);
    });
  });
});
