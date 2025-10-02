/**
 * Unit tests for JiraService
 */

const { JiraService } = require('../../src/services/jiraService');
const axios = require('axios');

jest.mock('axios');
jest.mock('fs');

describe('JiraService', () => {
  let jiraService;
  let config;

  beforeEach(() => {
    config = {
      JIRA_BASE_URL: 'https://test.atlassian.net',
      JIRA_EMAIL: 'test@example.com',
      JIRA_API_TOKEN: 'test-token',
      JIRA_PROJECT_KEY: 'TEST',
      JIRA_ISSUE_TYPE: 'Bug',
      uploadsDir: '/tmp/uploads',
    };
    jiraService = new JiraService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isConfigured', () => {
    test('should return true when fully configured', () => {
      expect(jiraService.isConfigured()).toBe(true);
    });

    test('should return false when missing base URL', () => {
      jiraService.baseUrl = null;
      expect(jiraService.isConfigured()).toBe(false);
    });

    test('should return false when missing email', () => {
      jiraService.email = null;
      expect(jiraService.isConfigured()).toBe(false);
    });
  });

  describe('generateRoomLabel', () => {
    test('should generate valid label from room name', () => {
      const label = jiraService.generateRoomLabel('My Test Room');
      expect(label).toBe('testfest-my-test-room');
    });

    test('should handle special characters', () => {
      const label = jiraService.generateRoomLabel('Test @#$ Room!');
      expect(label).toBe('testfest-test-room');
    });

    test('should handle empty name', () => {
      const label = jiraService.generateRoomLabel('');
      expect(label).toBe('testfest-room');
    });

    test('should handle multiple spaces', () => {
      const label = jiraService.generateRoomLabel('Test    Room');
      expect(label).toBe('testfest-test-room');
    });
  });

  describe('createIssue', () => {
    test('should throw error if not configured', async () => {
      jiraService.baseUrl = null;
      
      const issue = {
        script_id: 1,
        description: 'Test issue',
        is_issue: true,
        is_annoyance: false,
        is_existing_upper_env: false,
        is_not_sure_how_to_test: false,
      };

      await expect(jiraService.createIssue(issue)).rejects.toThrow('Jira is not configured');
    });

    test('should create issue successfully', async () => {
      axios.post.mockResolvedValueOnce({
        data: { key: 'TEST-123' },
      });

      const issue = {
        script_id: 1,
        description: 'Test issue',
        is_issue: true,
        is_annoyance: false,
        is_existing_upper_env: false,
        is_not_sure_how_to_test: false,
        images: [],
      };

      const jiraKey = await jiraService.createIssue(issue, 'Test Room');

      expect(jiraKey).toBe('TEST-123');
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    test('should handle Jira 401 error', async () => {
      axios.post.mockRejectedValueOnce({
        response: { status: 401, data: {} },
      });

      const issue = {
        script_id: 1,
        description: 'Test issue',
        is_issue: true,
        is_annoyance: false,
        is_existing_upper_env: false,
        is_not_sure_how_to_test: false,
        images: [],
      };

      await expect(jiraService.createIssue(issue)).rejects.toThrow('Jira authentication failed');
    });

    test('should handle Jira 403 error', async () => {
      axios.post.mockRejectedValueOnce({
        response: { status: 403, data: {} },
      });

      const issue = {
        script_id: 1,
        description: 'Test issue',
        is_issue: true,
        is_annoyance: false,
        is_existing_upper_env: false,
        is_not_sure_how_to_test: false,
        images: [],
      };

      await expect(jiraService.createIssue(issue)).rejects.toThrow('Insufficient Jira permissions');
    });
  });

  describe('getAuthHeader', () => {
    test('should return valid Basic auth header', () => {
      const header = jiraService.getAuthHeader();
      expect(header).toContain('Basic ');
      expect(header).toBe('Basic ' + Buffer.from('test@example.com:test-token').toString('base64'));
    });
  });
});
