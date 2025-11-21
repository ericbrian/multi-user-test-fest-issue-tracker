const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const { getPrisma } = require('../prismaClient');
const { requireAuth } = require('../middleware');
const { issueCreationLimiter, uploadLimiter } = require('../rateLimiter');
const { IssueService } = require('../services/issueService');
const { JiraService } = require('../services/jiraService');

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

  router.get('/api/rooms/:roomId/issues', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const issues = await issueService.getRoomIssues(roomId);
      res.json(issues);
    } catch (error) {
      console.error('Error fetching issues:', error);
      res.status(500).json({ error: 'Failed to fetch issues' });
    }
  });

  // Issues create with uploads (with rate limiting)
  router.post('/api/rooms/:roomId/issues', requireAuth, issueCreationLimiter, uploadLimiter, upload.array('images', 5), async (req, res) => {
    try {
      const { roomId } = req.params;
      const { scriptId } = req.body;

      // Sanitize description to prevent XSS using xss library
      const description = req.body.description ? xss(String(req.body.description).trim()) : '';

      if (!scriptId || !/^\d+$/.test(String(scriptId))) {
        return res.status(400).json({ error: 'Script ID is required and must be numeric' });
      }
      if (!description || description.length === 0) {
        return res.status(400).json({ error: 'Issue Description is required' });
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

      res.status(500).json({ error: 'Failed to create issue' });
    }
  });

  // Update issue status (Groupier only)
  router.post('/api/issues/:id/status', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { status: requestedStatus, roomId } = req.body;

      if (requestedStatus !== 'clear-status' && !TAGS.includes(requestedStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });
      if (!membership || !membership.is_groupier) return res.status(403).json({ error: 'Forbidden' });

      const out = await issueService.updateStatus(id, requestedStatus);

      io.to(roomId).emit('issue:update', out);
      res.json(out);
    } catch (error) {
      console.error('Error updating issue status:', error);
      res.status(500).json({ error: 'Failed to update issue status' });
    }
  });

  // Send to Jira (Groupier or Creator)
  router.post('/api/issues/:id/jira', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { roomId } = req.body;

      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });

      const issue = await prisma.issue.findUnique({
        where: { id },
        include: { createdBy: true }
      });
      if (!issue) return res.status(404).json({ error: 'Issue not found' });

      const isGroupier = membership && membership.is_groupier;
      const isCreator = issue.created_by === req.user.id;

      if (!isGroupier && !isCreator) return res.status(403).json({ error: 'Forbidden' });

      if (!jiraService.isConfigured()) {
        return res.status(500).json({ error: 'Jira not configured' });
      }      if (issue.jira_key) {
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
            return res.status(500).json({ error: 'Jira authentication failed. Please check credentials.' });
          } else if (jiraError.response.status === 403) {
            return res.status(500).json({ error: 'Insufficient Jira permissions.' });
          } else if (jiraError.response.status === 400) {
            return res.status(500).json({ error: 'Invalid Jira request. Please check project configuration.' });
          }
        }
        return res.status(500).json({ error: 'Failed to create Jira issue. Please try again later.' });
      }
    } catch (error) {
      console.error('Error in Jira integration:', error);
      res.status(500).json({ error: 'Internal server error while creating Jira issue' });
    }
  });

  // Delete issue (creator or Groupier)
  router.delete('/api/issues/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const issue = await prisma.issue.findUnique({ where: { id } });
      if (!issue) return res.status(404).json({ error: 'Issue not found' });

      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: issue.room_id, user_id: req.user.id } } });
      const isGroupier = Boolean(membership && membership.is_groupier);
      const isCreator = issue.created_by === req.user.id;
      if (!isGroupier && !isCreator) return res.status(403).json({ error: 'Forbidden' });

      await issueService.deleteIssue(id);

      io.to(issue.room_id).emit('issue:delete', { id });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting issue:', error);
      res.status(500).json({ error: 'Failed to delete issue' });
    }
  });
}

module.exports = registerIssueRoutes;
