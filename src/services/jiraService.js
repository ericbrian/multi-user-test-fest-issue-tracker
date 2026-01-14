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
    // Ensure roomName is a string to prevent "[object Object]" in text/labels
    if (typeof roomName !== 'string') {
      console.warn('JiraService.createIssue received non-string roomName, falling back to default.');
      roomName = String(roomName?.name || 'Unknown Room');
    }

    if (!this.isConfigured()) {
      throw new Error('Jira is not configured');
    }

    // Create summary (max 255 chars)
    const summary = `[Test Fest] Script ${issue.script_id || '?'} - ${issue.description?.slice(0, 80) || 'Issue'}`.slice(0, 255);

    const reporterName = issue.createdBy?.name || issue.createdBy?.email || 'Unknown User';

    // Construct ADF content
    const content = [];

    // 1. Description Header
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Issue Description' }]
    });

    // 2. Description Body
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: issue.description || 'No description provided.' }]
    });

    // 3. Context Header
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Context' }]
    });

    // 4. Context List
    const contextItems = [];
    contextItems.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `Test Fest: ${roomName}` }] }]
    });
    if (issue.script_id) {
      contextItems.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `Test Script ID: ${issue.script_id}` }] }]
      });
    }
    contextItems.push({
      type: 'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `Reported By: ${reporterName}` }] }]
    });

    content.push({
      type: 'bulletList',
      content: contextItems
    });

    // 5. Flags List
    const flagItems = [];
    if (issue.is_issue) flagItems.push('Is an Issue');
    if (issue.is_annoyance) flagItems.push('Is an Annoyance');
    if (issue.is_existing_upper_env) flagItems.push('Exists in Upper Environment');
    if (issue.is_not_sure_how_to_test) flagItems.push('Not Sure How To Test');

    if (flagItems.length > 0) {
      // Add Header only if there are flags
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Flags' }]
      });

      content.push({
        type: 'bulletList',
        content: flagItems.map(flag => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: flag }] }]
        }))
      });
    }

    // Convert to Atlassian Document Format
    const description = {
      type: 'doc',
      version: 1,
      content: content
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
        // Required custom fields for this Jira instance
        customfield_10909: 'N/A', // Job Name
        customfield_10910: 'None', // Dependencies
        // customfield_10908: 'Test Fest', // Source - Removed as it causes 400 error (not on screen)
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
    console.log(`Attempting to upload ${images.length} attachments for issue ${jiraKey}`);
    for (const imagePath of images) {
      try {
        let fileStream;

        if (imagePath.startsWith('http')) {
           // Fetch from URL (CDN)
           console.log(`Downloading attachment from URL: ${imagePath}`);
           const response = await axios.get(imagePath, { responseType: 'stream' });
           fileStream = response.data;
        } else {
           // Local file
           const fullPath = path.join(this.uploadsDir, path.basename(imagePath));
           if (fs.existsSync(fullPath)) {
             console.log(`Uploading attachment: ${fullPath}`);
             fileStream = fs.createReadStream(fullPath);
           }
        }

        if (fileStream) {
          const form = new FormData();
          form.append('file', fileStream);

          await axios.post(
            `${this.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${jiraKey}/attachments`,
            form,
            {
              headers: {
                Authorization: this.getAuthHeader(),
                'X-Atlassian-Token': 'no-check',
                ...form.getHeaders()
              },
              maxBodyLength: Infinity,
              maxContentLength: Infinity,
              timeout: 60000
            }
          );
          console.log(`Successfully uploaded: ${path.basename(imagePath)}`);
        } else {
          console.warn(`Attachment file not found: ${imagePath}`);
        }
      } catch (error) {
        console.error(`Failed to upload attachment ${imagePath}:`, error.message);
        if (error.response) {
          console.error('Jira upload error response:', error.response.data);
        }
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
      console.error('Jira response data (full):', JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 401) {
        throw new Error('Jira authentication failed. Please check credentials.');
      } else if (error.response.status === 403) {
        throw new Error('Insufficient Jira permissions.');
      } else if (error.response.status === 400) {
        // Extract detailed error messages from Jira
        let errorDetails = 'Invalid Jira request.';
        if (error.response.data && error.response.data.errors) {
          errorDetails += ' Field errors: ' + JSON.stringify(error.response.data.errors);
        }
        if (error.response.data && error.response.data.errorMessages) {
          errorDetails += ' Messages: ' + error.response.data.errorMessages.join(', ');
        }
        throw new Error(errorDetails);
      }
    }

    throw new Error('Failed to create Jira issue. Please try again later.');
  }
}

module.exports = { JiraService };
