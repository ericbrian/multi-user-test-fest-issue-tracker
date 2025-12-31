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
});
