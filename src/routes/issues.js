const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const { getPrisma } = require('../prismaClient');
const { requireAuth, requireGroupierByRoom, requireIssueAndMembership } = require('../middleware');
const { issueCreationLimiter, uploadLimiter } = require('../rateLimiter');
const { IssueService } = require('../services/issueService');
const { JiraService } = require('../services/jiraService');
const { ApiError } = require('../utils/apiResponse');

function registerIssueRoutes(router, deps) {
  const {
    io,
    upload,
    uploadsDir,
    TAGS,
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPE,
  } = deps;

  const prisma = getPrisma();
  const issueService = new IssueService(prisma, uploadsDir);
  const jiraService = new JiraService({
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPE,
    uploadsDir
  });

  /**
   * @openapi
   * /api/rooms/{roomId}/issues:
   *   get:
   *     tags:
   *       - Issues
   *     summary: Get all issues for a room
   *     description: Retrieves all issues reported in a specific test fest room, including creator information.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     responses:
   *       200:
   *         description: List of issues
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Issue'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/api/rooms/:roomId/issues', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const issues = await issueService.getRoomIssues(roomId);
      res.json(issues);
    } catch (error) {
      console.error('Error fetching issues:', error);
      return ApiError.database(res, 'Failed to fetch issues');
    }
  });

  /**
   * @openapi
   * /api/rooms/{roomId}/issues:
   *   post:
   *     tags:
   *       - Issues
   *     summary: Create a new issue
   *     description: Creates a new issue in a room with optional image attachments (up to 5 images). Rate limited to 30 requests per 15 minutes.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: roomId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Room ID
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             required:
   *               - scriptId
   *               - description
   *             properties:
   *               scriptId:
   *                 type: integer
   *                 description: Test script ID number
   *                 example: 42
   *               description:
   *                 type: string
   *                 description: Issue description (will be sanitized for XSS)
   *                 example: "Login button not responding on mobile"
   *               is_issue:
   *                 type: boolean
   *                 description: Mark as an issue
   *                 example: true
   *               is_annoyance:
   *                 type: boolean
   *                 description: Mark as an annoyance
   *                 example: false
   *               is_existing_upper_env:
   *                 type: boolean
   *                 description: Issue exists in upper environment
   *                 example: false
   *               is_not_sure_how_to_test:
   *                 type: boolean
   *                 description: Tester is unsure how to test
   *                 example: false
   *               images:
   *                 type: array
   *                 items:
   *                   type: string
   *                   format: binary
   *                 description: Image attachments (max 5)
   *                 maxItems: 5
   *     responses:
   *       200:
   *         description: Issue created successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Issue'
   *       400:
   *         description: Invalid input (missing or invalid scriptId/description)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       429:
   *         description: Rate limit exceeded
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/api/rooms/:roomId/issues', requireAuth, issueCreationLimiter, uploadLimiter, upload.array('images', 5), async (req, res) => {
    try {
      const { roomId } = req.params;
      const { scriptId } = req.body;

      // Sanitize description to prevent XSS using xss library
      const description = req.body.description ? xss(String(req.body.description).trim()) : '';

      if (!scriptId || !/^\d+$/.test(String(scriptId))) {
        return ApiError.invalidInput(res, 'Script ID is required and must be numeric', { field: 'scriptId' });
      }
      if (!description || description.length === 0) {
        return ApiError.missingField(res, 'description');
      }

      const scriptNum = parseInt(String(scriptId), 10);

      const isIssue = req.body.is_issue === 'on' || req.body.is_issue === 'true' || req.body.is_issue === true;
      const isAnnoyance = req.body.is_annoyance === 'on' || req.body.is_annoyance === 'true' || req.body.is_annoyance === true;
      const isExistingUpper = req.body.is_existing_upper_env === 'on' || req.body.is_existing_upper_env === 'true' || req.body.is_existing_upper_env === true;
      const isNotSureHowToTest = req.body.is_not_sure_how_to_test === 'on' || req.body.is_not_sure_how_to_test === 'true' || req.body.is_not_sure_how_to_test === true;
      const files = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
      const userId = req.user.id;

      const issueOut = await issueService.createIssue({
        roomId,
        userId,
        scriptId: scriptNum,
        description,
        isIssue,
        isAnnoyance,
        isExistingUpper,
        isNotSureHowToTest,
        files
      });

      io.to(roomId).emit('issue:new', issueOut);
      res.json(issueOut);
    } catch (error) {
      console.error('Error creating issue:', error);

      // Clean up any uploaded files if database operation failed
      try {
        issueService.cleanupFiles(req.files);
      } catch (cleanupError) {
        console.error('Error during file cleanup:', cleanupError);
      }

      return ApiError.internal(res, 'Failed to create issue', error.message);
    }
  });

  /**
   * @openapi
   * /api/issues/{id}/status:
   *   post:
   *     tags:
   *       - Issues
   *     summary: Update issue status
   *     description: Updates the status tag of an issue. Only groupiers (room admins) can perform this action.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Issue ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - status
   *               - roomId
   *             properties:
   *               status:
   *                 type: string
   *                 description: Status tag to apply (must be from configured TAGS or 'clear-status')
   *                 example: "in-progress"
   *               roomId:
   *                 type: string
   *                 format: uuid
   *                 description: Room ID (for permission check and real-time updates)
   *     responses:
   *       200:
   *         description: Status updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Issue'
   *       400:
   *         description: Invalid status value
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: User is not a groupier
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/api/issues/:id/status', requireAuth, requireGroupierByRoom(), async (req, res) => {
    try {
      const { id } = req.params;
      const { status: requestedStatus, roomId } = req.body;

      if (requestedStatus !== 'clear-status' && !TAGS.includes(requestedStatus)) {
        return ApiError.invalidInput(res, 'Invalid status', { validStatuses: [...TAGS, 'clear-status'] });
      }

      const out = await issueService.updateStatus(id, requestedStatus);

      io.to(roomId).emit('issue:update', out);
      res.json(out);
    } catch (error) {
      console.error('Error updating issue status:', error);
      return ApiError.internal(res, 'Failed to update issue status', error.message);
    }
  });

  /**
   * @openapi
   * /api/issues/{id}/jira:
   *   post:
   *     tags:
   *       - Issues
   *     summary: Create Jira ticket from issue
   *     description: Creates a Jira ticket for this issue and links it. Only the issue creator or room groupiers can perform this action. If already linked, returns existing Jira key.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Issue ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - roomId
   *             properties:
   *               roomId:
   *                 type: string
   *                 format: uuid
   *                 description: Room ID (for permission check and real-time updates)
   *     responses:
   *       200:
   *         description: Jira ticket created or already exists
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 jira_key:
   *                   type: string
   *                   description: Jira ticket key
   *                   example: "PROJ-123"
   *       403:
   *         description: User is neither creator nor groupier
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Issue not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error or Jira API error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             examples:
   *               notConfigured:
   *                 value:
   *                   error: "Jira not configured"
   *               authFailed:
   *                 value:
   *                   error: "Jira authentication failed. Please check credentials."
   *               insufficientPermissions:
   *                 value:
   *                   error: "Insufficient Jira permissions."
   *               invalidRequest:
   *                 value:
   *                   error: "Invalid Jira request. Please check project configuration."
   */
  router.post('/api/issues/:id/jira', requireAuth, requireIssueAndMembership(), async (req, res) => {
    try {
      const { id } = req.params;
      const { roomId } = req.body;
      const issue = req.issue;
      const membership = req.membership;
      const isGroupier = membership && membership.is_groupier;
      const isCreator = issue.created_by === req.user.id;

      if (!isGroupier && !isCreator) return ApiError.insufficientPermissions(res, 'Only issue creator or groupiers can create Jira tickets');

      if (!jiraService.isConfigured()) {
        return ApiError.jira.notConfigured(res);
      } if (issue.jira_key) {
        return res.json({ jira_key: issue.jira_key });
      }

      // Fetch room name for Jira labels
      const room = await prisma.room.findUnique({ where: { id: issue.room_id } });
      const roomName = room?.name || '';

      try {
        const jiraKey = await jiraService.createIssue(issue, roomName);
        const updated = await issueService.updateJiraKey(id, jiraKey);
        io.to(roomId).emit('issue:update', updated);
        res.json({ jira_key: jiraKey });
      } catch (jiraError) {
        console.error('Jira API error:', jiraError.message);
        if (jiraError.response) {
          if (jiraError.response.status === 401) {
            return ApiError.jira.authenticationFailed(res);
          } else if (jiraError.response.status === 403) {
            return ApiError.jira.insufficientPermissions(res);
          } else if (jiraError.response.status === 400) {
            return ApiError.jira.invalidRequest(res);
          }
        }
        return ApiError.jira.failed(res);
      }
    } catch (error) {
      console.error('Error in Jira integration:', error);
      return ApiError.internal(res, 'Internal server error while creating Jira issue', error.message);
    }
  });

  /**
   * @openapi
   * /api/issues/{id}:
   *   delete:
   *     tags:
   *       - Issues
   *     summary: Delete an issue
   *     description: Deletes an issue and its associated files. Only the issue creator or room groupiers can perform this action.
   *     security:
   *       - cookieAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Issue ID
   *     responses:
   *       200:
   *         description: Issue deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   *                   example: true
   *       403:
   *         description: User is neither creator nor groupier
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Issue not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.delete('/api/issues/:id', requireAuth, requireIssueAndMembership(), async (req, res) => {
    try {
      const issue = req.issue;
      const membership = req.membership;
      const isGroupier = Boolean(membership && membership.is_groupier);
      const isCreator = issue.created_by === req.user.id;
      if (!isGroupier && !isCreator) return res.status(403).json({ error: 'Forbidden' });

      await issueService.deleteIssue(issue.id);

      io.to(issue.room_id).emit('issue:delete', { id: issue.id });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting issue:', error);
      return ApiError.internal(res, 'Failed to delete issue', error.message);
    }
  });
}

module.exports = registerIssueRoutes;
