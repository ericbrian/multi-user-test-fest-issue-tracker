/**
 * Issue Management Service
 * Handles business logic for issues
 */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class IssueService {
  constructor(prisma, uploadsDir) {
    this.prisma = prisma;
    this.uploadsDir = uploadsDir;
  }

  /**
   * Format issue for client
   * @param {Object} issue - Issue from database
   * @returns {Object} - Formatted issue
   */
  formatIssueForClient(issue) {
    const { createdBy, ...rest } = issue;
    return {
      ...rest,
      created_by_name: createdBy?.name || null,
      created_by_email: createdBy?.email || null,
    };
  }

  /**
   * Get all issues for a room
   * @param {string} roomId - Room UUID
   * @returns {Promise<Array>} - Array of formatted issues
   */
  async getRoomIssues(roomId) {
    const issues = await this.prisma.issue.findMany({
      where: { room_id: roomId },
      include: { createdBy: { select: { name: true, email: true } } },
      orderBy: [{ script_id: 'asc' }, { created_at: 'asc' }],
    });

    return issues.map(issue => this.formatIssueForClient(issue));
  }

  /**
   * Create a new issue
   * @param {Object} data - Issue creation data
   * @returns {Promise<Object>} - Created issue
   */
  async createIssue(data) {
    const {
      roomId,
      userId,
      scriptId,
      description,
      isIssue,
      isAnnoyance,
      isExistingUpper,
      isNotSureHowToTest,
      files,
    } = data;

    const id = uuidv4();

    await this.prisma.issue.create({
      data: {
        id,
        room_id: roomId,
        created_by: userId,
        script_id: scriptId,
        description: description || '',
        images: files,
        is_issue: isIssue,
        is_annoyance: isAnnoyance,
        is_existing_upper_env: isExistingUpper,
        is_not_sure_how_to_test: isNotSureHowToTest,
      },
    });

    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    return this.formatIssueForClient(issue);
  }

  /**
   * Update issue status
   * @param {string} issueId - Issue UUID
   * @param {string} status - New status
   * @returns {Promise<Object>} - Updated issue
   */
  async updateStatus(issueId, status) {
    const normalizedStatus = status === 'clear-status' ? 'open' : status;

    await this.prisma.issue.update({
      where: { id: issueId },
      data: { status: normalizedStatus },
    });

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    return this.formatIssueForClient(issue);
  }

  /**
   * Update issue with Jira key
   * @param {string} issueId - Issue UUID
   * @param {string} jiraKey - Jira issue key
   * @returns {Promise<Object>} - Updated issue
   */
  async updateJiraKey(issueId, jiraKey) {
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { jira_key: jiraKey },
    });

    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
      include: { createdBy: { select: { name: true, email: true } } },
    });

    return this.formatIssueForClient(issue);
  }

  /**
   * Delete an issue and its files
   * @param {string} issueId - Issue UUID
   * @returns {Promise<void>}
   */
  async deleteIssue(issueId) {
    const issue = await this.prisma.issue.findUnique({ where: { id: issueId } });
    
    if (!issue) {
      throw new Error('Issue not found');
    }

    // Delete uploaded images from disk (best effort)
    try {
      const images = Array.isArray(issue.images) ? issue.images : [];
      images.forEach((imagePath) => {
        if (typeof imagePath === 'string' && imagePath.startsWith('/uploads/')) {
          const fullPath = path.join(this.uploadsDir, path.basename(imagePath));
          fs.unlink(fullPath, (err) => {
            if (err && err.code !== 'ENOENT') {
              console.error('Error deleting file:', err);
            }
          });
        }
      });
    } catch (error) {
      console.error('Error cleaning up files:', error);
      // Don't fail the delete operation
    }

    // Delete from database
    await this.prisma.issue.delete({ where: { id: issueId } });
  }

  /**
   * Clean up uploaded files (called on failed issue creation)
   * @param {Array} files - Multer files array
   */
  cleanupFiles(files) {
    if (!files || files.length === 0) return;

    files.forEach(file => {
      fs.unlink(file.path, (err) => {
        if (err) console.error('Error cleaning up uploaded file:', err);
      });
    });
  }
}

module.exports = { IssueService };
