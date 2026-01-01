/**
 * Unit tests for IssueService
 */

const { IssueService } = require('../../src/services/issueService');
const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid'),
}));

describe('IssueService', () => {
  let issueService;
  let prismaMock;
  const uploadsDir = '/tmp/uploads';

  beforeEach(() => {
    prismaMock = {
      roomScriptLineProgress: {
        findMany: jest.fn(),
      },
      issue: {
        findMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    issueService = new IssueService(prismaMock, uploadsDir);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRoomLeaderboard', () => {
    test('should aggregate progress by user and sort by count desc', async () => {
      prismaMock.roomScriptLineProgress.findMany.mockResolvedValue([
        { user_id: 'u1', user: { name: 'Alice', email: 'alice@test' }, is_checked: true },
        { user_id: 'u1', user: { name: 'Alice', email: 'alice@test' }, is_checked: true },
        { user_id: 'u2', user: { name: 'Bob', email: 'bob@test' }, is_checked: true },
        { user_id: null, user: null, is_checked: true },
      ]);

      const leaderboard = await issueService.getRoomLeaderboard('room-1');

      expect(prismaMock.roomScriptLineProgress.findMany).toHaveBeenCalledWith({
        where: {
          is_checked: true,
          testScriptLine: {
            testScript: {
              room_id: 'room-1',
            },
          },
        },
        include: {
          user: { select: { name: true, email: true } },
        },
      });

      expect(leaderboard).toHaveLength(3);
      expect(leaderboard[0]).toEqual({ user_id: 'u1', name: 'Alice', email: 'alice@test', count: 2 });
      expect(leaderboard[1]).toEqual({ user_id: null, name: null, email: null, count: 1 });
      expect(leaderboard[2]).toEqual({ user_id: 'u2', name: 'Bob', email: 'bob@test', count: 1 });
    });

    test('should handle alphabetizing equal counts', async () => {
       prismaMock.roomScriptLineProgress.findMany.mockResolvedValue([
        { user_id: 'u2', user: { name: 'Bob', email: 'bob@test' }, is_checked: true },
        { user_id: 'u1', user: { name: 'Alice', email: 'alice@test' }, is_checked: true },
      ]);

      const leaderboard = await issueService.getRoomLeaderboard('room-1');
      expect(leaderboard[0].name).toBe('Alice');
      expect(leaderboard[1].name).toBe('Bob');
    });
  });

  describe('formatIssueForClient', () => {
    test('should flatten createdBy object', () => {
      const issue = {
        id: '1',
        description: 'test',
        createdBy: { name: 'Tester', email: 'test@test.com' }
      };
      const formatted = issueService.formatIssueForClient(issue);
      expect(formatted.created_by_name).toBe('Tester');
      expect(formatted.created_by_email).toBe('test@test.com');
      expect(formatted.createdBy).toBeUndefined();
    });
  });

  describe('getRoomIssues', () => {
    test('should return formatted issues for a room', async () => {
      prismaMock.issue.findMany.mockResolvedValue([
        { id: 'i1', description: 'test', createdBy: { name: 'User' } }
      ]);

      const result = await issueService.getRoomIssues('r1');

      expect(prismaMock.issue.findMany).toHaveBeenCalled();
      expect(result[0].created_by_name).toBe('User');
    });
  });

  describe('createIssue', () => {
    test('should call prisma create and return formatted issue', async () => {
      const input = {
        roomId: 'r1',
        userId: 'u1',
        scriptId: 10,
        description: 'desc',
        isIssue: true,
        files: ['img.png']
      };
      
      prismaMock.issue.create.mockResolvedValue({});
      prismaMock.issue.findUnique.mockResolvedValue({
        id: 'test-uuid',
        description: 'desc',
        createdBy: { name: 'User', email: 'u@test' }
      });

      const result = await issueService.createIssue(input);

      expect(prismaMock.issue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: 'test-uuid',
          room_id: 'r1',
          created_by: 'u1',
          script_id: 10,
          description: 'desc',
          images: ['img.png'],
          is_issue: true
        })
      });
      expect(result.created_by_name).toBe('User');
    });
  });

  describe('updateStatus', () => {
    test('should normalize clear-status to open', async () => {
      prismaMock.issue.update.mockResolvedValue({});
      prismaMock.issue.findUnique.mockResolvedValue({ id: 'i1', status: 'open' });

      await issueService.updateStatus('i1', 'clear-status');

      expect(prismaMock.issue.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { status: 'open' }
      });
    });
  });

  describe('updateJiraKey', () => {
    test('should update jira key and return formatted issue', async () => {
      prismaMock.issue.update.mockResolvedValue({});
      prismaMock.issue.findUnique.mockResolvedValue({ id: 'i1', jira_key: 'TEST-1' });

      const result = await issueService.updateJiraKey('i1', 'TEST-1');

      expect(prismaMock.issue.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { jira_key: 'TEST-1' }
      });
      expect(result.jira_key).toBe('TEST-1');
    });
  });

  describe('deleteIssue', () => {
    test('should delete issue from db after attempting file cleanup', async () => {
      const issue = {
        id: 'issue-1',
        images: ['/uploads/img1.png', 'not-an-upload.jpg']
      };
      prismaMock.issue.findUnique.mockResolvedValue(issue);
      prismaMock.issue.delete.mockResolvedValue(issue);

      await issueService.deleteIssue('issue-1');

      expect(prismaMock.issue.findUnique).toHaveBeenCalledWith({ where: { id: 'issue-1' } });
      expect(fs.unlink).toHaveBeenCalledWith(path.join(uploadsDir, 'img1.png'), expect.any(Function));
      // should not try to unlink not-an-upload.jpg because it doesn't start with /uploads/
      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(prismaMock.issue.delete).toHaveBeenCalledWith({ where: { id: 'issue-1' } });
    });

    test('should log error if unlink fails with non-ENOENT', async () => {
      const issue = { id: 'i1', images: ['/uploads/fail.png'] };
      prismaMock.issue.findUnique.mockResolvedValue(issue);
      const logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // Simulate unlink error
      fs.unlink.mockImplementation((path, cb) => cb({ code: 'EBUSY' }));

      await issueService.deleteIssue('i1');

      expect(logSpy).toHaveBeenCalledWith('Error deleting file:', expect.any(Object));
      logSpy.mockRestore();
    });

    test('should throw error if issue not found', async () => {
      prismaMock.issue.findUnique.mockResolvedValue(null);
      await expect(issueService.deleteIssue('404')).rejects.toThrow('Issue not found');
    });
  });

  describe('cleanupFiles', () => {
    test('should unlink each file path', () => {
      const files = [{ path: 'p1' }, { path: 'p2' }];
      issueService.cleanupFiles(files);
      expect(fs.unlink).toHaveBeenCalledTimes(2);
    });

    test('should do nothing if no files', () => {
      issueService.cleanupFiles(null);
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });
});
