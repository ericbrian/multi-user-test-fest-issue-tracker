const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../../src/prismaClient');
jest.mock('../../src/services/roomService');
jest.mock('../../src/services/issueService');

const { getPrisma } = require('../../src/prismaClient');
const { RoomService } = require('../../src/services/roomService');
const { IssueService } = require('../../src/services/issueService');
const { createNoopCache } = require('../../src/cache');

// Mock Data
const MOCK_ROOM_ID = 'room-123';
const ATTACKER_ID = 'attacker-999';
const MEMBER_ID = 'member-001';

const mockPrisma = {
  roomMember: { findUnique: jest.fn() },
};

let mockRoomServiceInstance;
let mockIssueServiceInstance;

beforeEach(() => {
  jest.clearAllMocks();
  getPrisma.mockReturnValue(mockPrisma);

  mockRoomServiceInstance = {
    getTestScriptLines: jest.fn().mockResolvedValue([{ id: 'line-1', text: 'Secret Test' }]),
  };
  RoomService.mockImplementation(() => mockRoomServiceInstance);

  mockIssueServiceInstance = {
    getRoomIssues: jest.fn().mockResolvedValue([{ id: 'issue-1', description: 'Secret Issue' }]),
    getRoomLeaderboard: jest.fn().mockResolvedValue([{ user_id: 'u1', count: 5 }]),
  };
  IssueService.mockImplementation(() => mockIssueServiceInstance);
});

const registerRoomRoutes = require('../../src/routes/rooms');
const registerIssueRoutes = require('../../src/routes/issues');

function createApp(userId) {
  const app = express();
  app.use(express.json());
  // Mock authentication middleware
  app.use((req, res, next) => {
    req.user = { id: userId, email: 'test@test.com' };
    next();
  });
  
  const router = express.Router();
  const deps = { 
    io: { to: () => ({ emit: jest.fn() }) },
    upload: { array: () => (req, res, next) => next() }, // mock multer
    GROUPIER_EMAILS: [],
    cache: createNoopCache()
  };
  
  registerRoomRoutes(router, deps);
  registerIssueRoutes(router, deps);
  
  app.use(router);
  return app;
}

describe('IDOR Vulnerability Proof', () => {
  test('VULNERABILITY CHECK: Attacker (non-member) accessing test script lines should be DENIED (403)', async () => {
    const app = createApp(ATTACKER_ID);
    
    // Simulate NO membership in DB
    mockPrisma.roomMember.findUnique.mockResolvedValue(null);

    const res = await request(app).get(`/api/rooms/${MOCK_ROOM_ID}/test-script-lines`);
    
    // Fail if we get 200 (Proves Vulnerability)
    if (res.status === 200) {
      console.log('🚨 VULNERABILITY CONFIRMED: Attacker accessed test script lines!');
    }
    
    expect(res.status).toBe(403);
    // Also verify service was NOT called
    expect(mockRoomServiceInstance.getTestScriptLines).not.toHaveBeenCalled();
  });

  test('VULNERABILITY CHECK: Attacker accessing issues should be DENIED (403)', async () => {
    const app = createApp(ATTACKER_ID);
    mockPrisma.roomMember.findUnique.mockResolvedValue(null);
    
    const res = await request(app).get(`/api/rooms/${MOCK_ROOM_ID}/issues`);

    if (res.status === 200) {
      console.log('🚨 VULNERABILITY CONFIRMED: Attacker accessed issues!');
    }

    expect(res.status).toBe(403);
    expect(mockIssueServiceInstance.getRoomIssues).not.toHaveBeenCalled();
  });

   test('VULNERABILITY CHECK: Attacker accessing leaderboard should be DENIED (403)', async () => {
    const app = createApp(ATTACKER_ID);
    mockPrisma.roomMember.findUnique.mockResolvedValue(null);
    
    const res = await request(app).get(`/api/rooms/${MOCK_ROOM_ID}/leaderboard`);
    
    if (res.status === 200) {
      console.log('🚨 VULNERABILITY CONFIRMED: Attacker accessed leaderboard!');
    }

    expect(res.status).toBe(403);
    expect(mockIssueServiceInstance.getRoomLeaderboard).not.toHaveBeenCalled();
  });

  test('Valid Member accessing test script lines should SUCCEED (200)', async () => {
    const app = createApp(MEMBER_ID);
    // Simulate valid membership
    mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false }); 
    
    const res = await request(app).get(`/api/rooms/${MOCK_ROOM_ID}/test-script-lines`);
    
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'line-1', text: 'Secret Test' }]);
 });
});
