/**
 * Unit tests for RoomService
 */

const { RoomService } = require('../../src/services/roomService');

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

describe('RoomService', () => {
  let roomService;
  let prismaMock;

  beforeEach(() => {
    prismaMock = {
      room: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      roomMember: {
        create: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      roomScript: {
        create: jest.fn(),
      },
      roomScriptLine: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      roomScriptLineProgress: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      scriptTemplate: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn(async (ops) => Promise.all(ops)),
    };
    roomService = new RoomService(prismaMock);
  });

  describe('getAllRooms', () => {
    test('should return rooms with stringified member count', async () => {
      prismaMock.room.findMany.mockResolvedValue([
        { id: '1', name: 'R1', _count: { members: 5 } }
      ]);

      const rooms = await roomService.getAllRooms();
      expect(rooms[0].member_count).toBe('5');
      expect(prismaMock.room.findMany).toHaveBeenCalledWith({
        orderBy: { created_at: 'desc' },
        include: { _count: { select: { members: true } } },
      });
    });
  });

  describe('createRoom', () => {
    test('should create room, script, and member', async () => {
      prismaMock.room.create.mockResolvedValue({});
      prismaMock.roomScript.create.mockResolvedValue({});
      prismaMock.roomMember.create.mockResolvedValue({});

      const data = { name: 'Test Room', userId: 'u1' };
      const room = await roomService.createRoom(data);

      expect(room.id).toBe('test-uuid');
      expect(prismaMock.room.create).toHaveBeenCalled();
      expect(prismaMock.roomScript.create).toHaveBeenCalled();
      expect(prismaMock.roomMember.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ is_groupier: true })
      }));
    });

    test('should copy lines from library script if scriptId provided', async () => {
      prismaMock.room.create.mockResolvedValue({});
      prismaMock.scriptTemplate.findUnique.mockResolvedValue({
        id: 'tpl1',
        name: 'Tpl',
        description: 'Tpl Desc',
        lines: [
          { line_number: 1, name: 'L1', description: 'D1', notes: 'N1' }
        ]
      });
      prismaMock.roomScript.create.mockResolvedValue({});
      prismaMock.roomScriptLine.create.mockResolvedValue({});
      prismaMock.roomMember.create.mockResolvedValue({});

      await roomService.createRoom({ name: 'R', userId: 'u1', scriptId: 'tpl1' });

      expect(prismaMock.scriptTemplate.findUnique).toHaveBeenCalled();
      expect(prismaMock.roomScriptLine.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ name: 'L1' })
      }));
    });
  });

  describe('joinRoom', () => {
    test('should promote to groupier if in email list', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: 'r1', created_by: 'someone-else' });
      prismaMock.roomMember.upsert.mockResolvedValue({});

      const result = await roomService.joinRoom('r1', 'u1', ['admin@test.com'], 'admin@test.com');

      expect(result.isGroupier).toBe(true);
      expect(prismaMock.roomMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
        create: expect.objectContaining({ is_groupier: true })
      }));
    });

    test('should promote to groupier if room creator', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: 'r1', created_by: 'u1' });
      prismaMock.roomMember.upsert.mockResolvedValue({});

      const result = await roomService.joinRoom('r1', 'u1', [], 'user@test.com');

      expect(result.isGroupier).toBe(true);
    });

    test('should NOT promote to groupier if neither creator nor in list', async () => {
       prismaMock.room.findUnique.mockResolvedValue({ id: 'r1', created_by: 'other' });
       prismaMock.roomMember.upsert.mockResolvedValue({});

       const result = await roomService.joinRoom('r1', 'u1', ['admin@test.com'], 'user@test.com');
       expect(result.isGroupier).toBe(false);
    });
  });

  describe('isGroupier', () => {
    test('should return true if membership has is_groupier true', async () => {
      prismaMock.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      const result = await roomService.isGroupier('r1', 'u1');
      expect(result).toBe(true);
      expect(prismaMock.roomMember.findUnique).toHaveBeenCalled();
    });

    test('should return false if membership not found', async () => {
      prismaMock.roomMember.findUnique.mockResolvedValue(null);
      const result = await roomService.isGroupier('r1', 'u1');
      expect(result).toBe(false);
    });
  });

  describe('getScriptLibrary', () => {
    test('should return active script templates with line counts', async () => {
      prismaMock.scriptTemplate.findMany.mockResolvedValue([
        { id: 's1', name: 'S1', _count: { lines: 3 }, is_active: true }
      ]);

      const result = await roomService.getScriptLibrary();
      expect(result[0].line_count).toBe(3);
    });
  });

  describe('getTestScriptLines', () => {
    test('should return lines with user progress mapped to is_checked', async () => {
      prismaMock.roomScriptLine.findMany.mockResolvedValue([
        {
          id: 'l1',
          test_script_line_id: 1,
          progress: [{ is_checked: true, notes: 'done' }]
        },
        {
          id: 'l2',
          test_script_line_id: 2,
          progress: []
        }
      ]);

      const result = await roomService.getTestScriptLines('r1', 'u1');
      expect(result[0].is_checked).toBe(true);
      expect(result[1].is_checked).toBe(false);
    });
  });

  describe('updateTestScriptLineProgress', () => {
    test('should throw if line not found', async () => {
      prismaMock.roomScriptLine.findUnique.mockResolvedValue(null);
      await expect(roomService.updateTestScriptLineProgress('404', 'u1', true))
        .rejects.toThrow('Test script line not found');
    });

    test('should throw if not a member', async () => {
      prismaMock.roomScriptLine.findUnique.mockResolvedValue({
        id: 'l1',
        testScript: { room_id: 'r1' }
      });
      prismaMock.roomMember.findUnique.mockResolvedValue(null);

      await expect(roomService.updateTestScriptLineProgress('l1', 'u1', true))
        .rejects.toThrow('You must be a member of this room');
    });

    test('should upsert progress for members', async () => {
      prismaMock.roomScriptLine.findUnique.mockResolvedValue({
        id: 'l1',
        testScript: { room_id: 'r1' }
      });
      prismaMock.roomMember.findUnique.mockResolvedValue({ user_id: 'u1' });
      prismaMock.roomScriptLineProgress.findUnique.mockResolvedValue(null);
      prismaMock.roomScriptLineProgress.create.mockResolvedValue({ is_checked: true });

      const result = await roomService.updateTestScriptLineProgress('l1', 'u1', true, 'some notes');

      expect(prismaMock.roomScriptLineProgress.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          is_checked: true,
          notes: 'some notes'
        })
      }));
      expect(result.roomId).toBe('r1');
    });

    test('should update existing progress', async () => {
      prismaMock.roomScriptLine.findUnique.mockResolvedValue({
        id: 'l1',
        testScript: { room_id: 'r1' }
      });
      prismaMock.roomMember.findUnique.mockResolvedValue({ user_id: 'u1' });
      prismaMock.roomScriptLineProgress.findUnique.mockResolvedValue({ id: 'p1' });
      prismaMock.roomScriptLineProgress.update.mockResolvedValue({ is_checked: true });

      await roomService.updateTestScriptLineProgress('l1', 'u1', true);

      expect(prismaMock.roomScriptLineProgress.update).toHaveBeenCalled();
      expect(prismaMock.roomScriptLineProgress.create).not.toHaveBeenCalled();
    });
  });

  describe('transferOwnership', () => {
    test('should transfer ownership correctly', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: 'room-1', created_by: 'old-owner' });
      // room.update is needed
      prismaMock.room.update = jest.fn();
      // roomMember check
      prismaMock.roomMember.findUnique.mockResolvedValue({ room_id: 'room-1', user_id: 'new-owner', is_groupier: false });
      // roomMember.update is needed
      prismaMock.roomMember.update = jest.fn();

      await roomService.transferOwnership('room-1', 'old-owner', 'new-owner');

      expect(prismaMock.room.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { created_by: 'new-owner' }
      });
      expect(prismaMock.roomMember.update).toHaveBeenCalledWith({
        where: { room_id_user_id: { room_id: 'room-1', user_id: 'old-owner' } },
        data: { is_groupier: false }
      });
      expect(prismaMock.roomMember.update).toHaveBeenCalledWith({
        where: { room_id_user_id: { room_id: 'room-1', user_id: 'new-owner' } },
        data: { is_groupier: true }
      });
    });

    test('should fail if caller is not the owner', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: 'room-1', created_by: 'real-owner' });

      await expect(roomService.transferOwnership('room-1', 'imposter', 'new-owner'))
        .rejects.toThrow('Only the room creator can transfer ownership');
    });

    test('should fail if new owner is not a member', async () => {
      prismaMock.room.findUnique.mockResolvedValue({ id: 'room-1', created_by: 'old-owner' });
      prismaMock.roomMember.findUnique.mockResolvedValue(null);

      await expect(roomService.transferOwnership('room-1', 'old-owner', 'outsider'))
        .rejects.toThrow('New owner must be a member of the room');
    });
  });
});
