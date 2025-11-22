/**
 * Unit tests for middleware
 */

// We'll require the middleware inside each describe block so we can mock `getPrisma` before module load

describe('Middleware', () => {
  describe('requireAuth', () => {
    const { requireAuth } = require('../../src/middleware');
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

    let createDevAutoAuthMiddleware;

    beforeEach(() => {
      // Mock getPrisma
      mockPrisma = {
        user: {
          findUnique: jest.fn(),
          create: jest.fn(),
        },
      };
      jest.mock('../../src/prismaClient', () => ({ getPrisma: () => mockPrisma }));
      // Re-require middleware after mocking prisma client
      createDevAutoAuthMiddleware = require('../../src/middleware').createDevAutoAuthMiddleware;
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

  describe('requireGroupierByRoom', () => {
    let mockPrisma;

    let requireGroupierByRoom;

    beforeEach(() => {
      mockPrisma = {
        roomMember: {
          findUnique: jest.fn(),
        },
      };
      jest.mock('../../src/prismaClient', () => ({ getPrisma: () => mockPrisma }));
      requireGroupierByRoom = require('../../src/middleware').requireGroupierByRoom;
    });

    afterEach(() => {
      jest.resetModules();
    });

    test('responds 400 when no roomId provided', async () => {
      const req = { body: {}, params: {}, query: {}, user: { id: 'u1' } };
      const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      const mw = requireGroupierByRoom();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'roomId is required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('responds 403 when not groupier', async () => {
      const req = { body: { roomId: 'r1' }, params: {}, query: {}, user: { id: 'u1' } };
      const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);
      const mw = requireGroupierByRoom();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    test('calls next when groupier', async () => {
      const req = { body: { roomId: 'r1' }, params: {}, query: {}, user: { id: 'u1' } };
      const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      const mw = requireGroupierByRoom();
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.membership).toBeDefined();
    });
  });

  describe('requireIssueAndMembership', () => {
    let mockPrisma;

    let requireIssueAndMembership;

    beforeEach(() => {
      mockPrisma = {
        issue: { findUnique: jest.fn() },
        roomMember: { findUnique: jest.fn() },
      };
      jest.mock('../../src/prismaClient', () => ({ getPrisma: () => mockPrisma }));
      requireIssueAndMembership = require('../../src/middleware').requireIssueAndMembership;
    });

    afterEach(() => {
      jest.resetModules();
    });

    test('responds 400 when no id param', async () => {
      const req = { params: {}, user: { id: 'u1' } };
      const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      const mw = requireIssueAndMembership();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Issue id is required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('responds 404 when issue not found', async () => {
      const req = { params: { id: 'i1' }, user: { id: 'u1' } };
      const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      mockPrisma.issue.findUnique.mockResolvedValue(null);
      const mw = requireIssueAndMembership();
      await mw(req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Issue not found' });
      expect(next).not.toHaveBeenCalled();
    });

    test('attaches issue and membership and calls next', async () => {
      const req = { params: { id: 'i1' }, user: { id: 'u1' } };
      const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
      const next = jest.fn();
      mockPrisma.issue.findUnique.mockResolvedValue({ id: 'i1', room_id: 'r1', created_by: 'u2' });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      const mw = requireIssueAndMembership();
      await mw(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.issue).toBeDefined();
      expect(req.membership).toBeDefined();
    });
  });
});
