const express = require('express');
const request = require('supertest');

jest.mock('../../src/prismaClient');
jest.mock('../../src/services/roomService');

const { getPrisma } = require('../../src/prismaClient');
const { RoomService } = require('../../src/services/roomService');
const { createMemoryCache } = require('../../src/cache');

const mockPrisma = {
  room: { findMany: jest.fn(), create: jest.fn() },
  roomMember: { create: jest.fn(), findUnique: jest.fn() },
  testScript: { create: jest.fn() },
  testScriptLine: { createMany: jest.fn() },
  scriptLibrary: { findMany: jest.fn(), findUnique: jest.fn() },
};

let mockRoomServiceInstance;

beforeEach(() => {
  jest.clearAllMocks();
  getPrisma.mockReturnValue(mockPrisma);

  mockRoomServiceInstance = {
    getAllRooms: jest.fn().mockResolvedValue([{ id: 'room-1', name: 'Cached Room' }]),
    createRoom: jest.fn().mockResolvedValue({ id: 'room-2', name: 'New Room', created_by: 'user-1' }),
  };
  RoomService.mockImplementation(() => mockRoomServiceInstance);
});

const registerRoomRoutes = require('../../src/routes/rooms');

describe('Rooms API Integration Tests', () => {
  test('invalidates cached rooms list after creating a room', async () => {
    const cache = createMemoryCache({ defaultTtlSeconds: 3600 });
    jest.spyOn(cache, 'del');

    // First GET returns one room; after invalidation, second GET should return new data.
    mockRoomServiceInstance.getAllRooms
      .mockResolvedValueOnce([{ id: 'room-1', name: 'Cached Room' }])
      .mockResolvedValueOnce([{ id: 'room-99', name: 'Fresh Room' }]);

    const app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
      next();
    });

    const router = express.Router();
    registerRoomRoutes(router, {
      io: { to: () => ({ emit: jest.fn() }) },
      GROUPIER_EMAILS: [],
      cache,
    });
    app.use(router);

    // Prime cache
    const first = await request(app).get('/api/rooms');
    expect(first.status).toBe(200);
    expect(first.body.map((r) => r.id)).toEqual(['room-1']);

    // Create room should invalidate rooms_all
    const created = await request(app).post('/api/rooms').send({ name: 'My Room' });
    expect(created.status).toBe(200);
    expect(cache.del).toHaveBeenCalledWith('rooms_all');

    // Next GET should fetch fresh
    const second = await request(app).get('/api/rooms');
    expect(second.status).toBe(200);
    expect(second.body.map((r) => r.id)).toEqual(['room-99']);
    expect(mockRoomServiceInstance.getAllRooms).toHaveBeenCalledTimes(2);
  });

  describe('GET /api/script-library', () => {
    test('returns script library', async () => {
      mockRoomServiceInstance.getScriptLibrary = jest.fn().mockResolvedValue([{ id: 's1', name: 'Script 1' }]);
      const app = express();
      const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, { cache: createMemoryCache() });
      app.use(router);

      const res = await request(app).get('/api/script-library');
      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe('s1');
    });
  });

  describe('POST /api/rooms/:roomId/join', () => {
    test('joins a room', async () => {
      mockRoomServiceInstance.joinRoom = jest.fn().mockResolvedValue({ ok: true, isGroupier: false });
      const app = express();
      const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1', email: 'u1@test.com' }; next(); });
      registerRoomRoutes(router, { GROUPIER_EMAILS: [], cache: createMemoryCache() });
      app.use(router);

      const res = await request(app).post('/api/rooms/room-1/join');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockRoomServiceInstance.joinRoom).toHaveBeenCalledWith('room-1', 'u1', [], 'u1@test.com');
    });
  });

  describe('GET /api/rooms/:roomId/test-script-lines', () => {
    test('returns lines for a member', async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({ user_id: 'u1' });
      mockRoomServiceInstance.getTestScriptLines = jest.fn().mockResolvedValue([{ id: 'l1' }]);

      const app = express();
      const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, { cache: createMemoryCache() });
      app.use(router);

      const res = await request(app).get('/api/rooms/room-1/test-script-lines');
      expect(res.status).toBe(200);
      expect(res.body[0].id).toBe('l1');
    });

    test('returns 403 for non-member', async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue(null);
      const app = express();
      const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, { cache: createMemoryCache() });
      app.use(router);

      const res = await request(app).get('/api/rooms/room-1/test-script-lines');
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/test-script-lines/:lineId/progress', () => {
    test('updates progress', async () => {
      const emitMock = jest.fn();
      const ioMock = { to: jest.fn().mockReturnValue({ emit: emitMock }) };
      mockRoomServiceInstance.updateTestScriptLineProgress = jest.fn().mockResolvedValue({
        progress: { is_checked: true, checked_at: 'now', notes: 'notes' },
        roomId: 'room-1'
      });

      const app = express();
      app.use(express.json());
      const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, { io: ioMock });
      app.use(router);

      const res = await request(app)
        .post('/api/test-script-lines/l1/progress')
        .send({ is_checked: true, notes: 'notes' });

      expect(res.status).toBe(200);
      expect(ioMock.to).not.toHaveBeenCalled();
      expect(emitMock).not.toHaveBeenCalled();
    });

    test('returns 404 for non-existent line', async () => {
      mockRoomServiceInstance.updateTestScriptLineProgress = jest.fn().mockRejectedValue(new Error('Test script line not found'));
      const app = express(); app.use(express.json()); const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, {}); app.use(router);

      const res = await request(app).post('/api/test-script-lines/404/progress').send({ is_checked: true });
      expect(res.status).toBe(404);
    });

    test('returns 403 for membership violation', async () => {
      mockRoomServiceInstance.updateTestScriptLineProgress = jest.fn().mockRejectedValue(new Error('You must be a member of this room to update test progress'));
      const app = express(); app.use(express.json()); const router = express.Router();
      app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, {}); app.use(router);

      const res = await request(app).post('/api/test-script-lines/l1/progress').send({ is_checked: true });
      expect(res.status).toBe(403);
    });
  });

  describe('Error handling', () => {
    test('GET /api/rooms returns 500 on database error', async () => {
      mockRoomServiceInstance.getAllRooms.mockRejectedValue(new Error('DB Fail'));
      const app = express(); const router = express.Router(); app.use((req, _res, next) => { req.user = { id: 'u1' }; next(); });
      registerRoomRoutes(router, { cache: createMemoryCache() }); app.use(router);
      const res = await request(app).get('/api/rooms');
      expect(res.status).toBe(500);
    });
  });
});
