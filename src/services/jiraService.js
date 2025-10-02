/**
 * Jira Integration Service
 * Handles all Jira API interactions
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class JiraService {
  constructor(config) {
    this.baseUrl = config.JIRA_BASE_URL;
    this.email = config.JIRA_EMAIL;
    this.apiToken = config.JIRA_API_TOKEN;
    this.projectKey = config.JIRA_PROJECT_KEY;
    this.issueType = config.JIRA_ISSUE_TYPE || 'Bug';
    this.uploadsDir = config.uploadsDir;
  }

  /**
   * Check if Jira is configured
   */
  isConfigured() {
    return !!(this.baseUrl && this.email && this.apiToken && this.projectKey);
  }

  /**
   * Get authorization header
   */
  getAuthHeader() {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return `Basic ${auth}`;
  }

  /**
   * Create a Jira issue from an internal issue
   * @param {Object} issue - The issue object from database
   * @param {string} roomName - Name of the room for labeling
   * @returns {Promise<string>} - Jira issue key
   */
  async createIssue(issue, roomName = '') {
    if (!this.isConfigured()) {
      throw new Error('Jira is not configured');
    }

    // Create summary (max 255 chars)
    const summary = `Script ${issue.script_id || ''} - ${issue.description?.slice(0, 80) || 'Issue'}`.slice(0, 255);

    // Create description text
    const descriptionText = `Description:\n${issue.description || ''}\n\nFlags: issue=${issue.is_issue}, annoyance=${issue.is_annoyance}, existing_upper_env=${issue.is_existing_upper_env}, not_sure_how_to_test=${issue.is_not_sure_how_to_test}`;

    // Convert to Atlassian Document Format
    const description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: descriptionText
            }
          ]
        }
      ]
    };

    // Generate room label
    const roomLabel = this.generateRoomLabel(roomName);

    // Create payload
    const payload = {
      fields: {
        project: { key: this.projectKey },
        summary,
        description,
        issuetype: { name: this.issueType },
        labels: [roomLabel],
      },
    };

    try {
      // Create issue
      const url = `${this.baseUrl.replace(/\/$/, '')}/rest/api/3/issue`;
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: this.getAuthHeader(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 30000,
      });

      const jiraKey = response.data?.key;
      if (!jiraKey) {
        throw new Error('No Jira key returned from API');
      }

      // Upload attachments if any
      if (issue.images && Array.isArray(issue.images) && issue.images.length > 0) {
        await this.uploadAttachments(jiraKey, issue.images);
      }

      return jiraKey;
    } catch (error) {
      this.handleJiraError(error);
    }
  }

  /**
   * Upload attachments to a Jira issue
   * @param {string} jiraKey - The Jira issue key
   * @param {Array<string>} images - Array of image paths
   */
  async uploadAttachments(jiraKey, images) {
    for (const imagePath of images) {
      try {
        const fullPath = path.join(this.uploadsDir, path.basename(imagePath));
        if (fs.existsSync(fullPath)) {
          const form = new FormData();
          form.append('file', fs.createReadStream(fullPath));

          await axios.post(
            `${this.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${jiraKey}/attachments`,
            form,
            {
              headers: {
                Authorization: this.getAuthHeader(),
                'X-Atlassian-Token': 'no-check',
                ...form.getHeaders()
              },
              timeout: 30000
            }
          );
        }
      } catch (error) {
        console.error(`Failed to upload attachment ${imagePath}:`, error.message);
        // Don't throw, continue with other attachments
      }
    }
  }

  /**
   * Generate a Jira-safe label from room name
   * @param {string} roomName - Room name
   * @returns {string} - Sanitized label
   */
  generateRoomLabel(roomName) {
    return `testfest-${(roomName || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+|-+$/g, '') || 'room'}`;
  }

  /**
   * Handle Jira API errors
   * @param {Error} error - The error from axios
   * @throws {Error} - Formatted error message
   */
  handleJiraError(error) {
    console.error('Jira API error:', error.message);
    
    if (error.response) {
      console.error('Jira response status:', error.response.status);
      console.error('Jira response data:', error.response.data);

      if (error.response.status === 401) {
        throw new Error('Jira authentication failed. Please check credentials.');
      } else if (error.response.status === 403) {
        throw new Error('Insufficient Jira permissions.');
      } else if (error.response.status === 400) {
        throw new Error('Invalid Jira request. Please check project configuration.');
      }
    }
    
    throw new Error('Failed to create Jira issue. Please try again later.');
  }
}

module.exports = { JiraService };
