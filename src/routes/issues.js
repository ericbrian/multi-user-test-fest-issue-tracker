const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const xss = require('xss');
const { getPrisma } = require('../prismaClient');
const { requireAuth } = require('../middleware');
const { issueCreationLimiter, uploadLimiter } = require('../rateLimiter');

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

  router.get('/api/rooms/:roomId/issues', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();
      const list = await prisma.issue.findMany({
        where: { room_id: roomId },
        include: { createdBy: { select: { name: true, email: true } } },
        orderBy: [{ script_id: 'asc' }, { created_at: 'asc' }],
      });
      const rows = list.map((i) => {
        const { createdBy, ...rest } = i;
        return {
          ...rest,
          created_by_name: createdBy?.name || null,
          created_by_email: createdBy?.email || null,
        };
      });
      res.json(rows);
    } catch (error) {
      console.error('Error fetching issues:', error);
      res.status(500).json({ error: 'Failed to fetch issues' });
    }
  });

  // Issues create with uploads (with rate limiting)
  router.post('/api/rooms/:roomId/issues', requireAuth, issueCreationLimiter, uploadLimiter, upload.array('images', 5), async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();
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
      // Optional: Check if test script exists, but don't require it
      const script = await prisma.testScript.findFirst({
        where: {
          room_id: roomId,
          script_id: scriptNum
        }
      });
      // We'll allow issues to be created even if the specific script doesn't exist
      // This gives users flexibility to organize their issues with different script IDs

      const isIssue = req.body.is_issue === 'on' || req.body.is_issue === 'true' || req.body.is_issue === true;
      const isAnnoyance = req.body.is_annoyance === 'on' || req.body.is_annoyance === 'true' || req.body.is_annoyance === true;
      const isExistingUpper = req.body.is_existing_upper_env === 'on' || req.body.is_existing_upper_env === 'true' || req.body.is_existing_upper_env === true;
      const isNotSureHowToTest = req.body.is_not_sure_how_to_test === 'on' || req.body.is_not_sure_how_to_test === 'true' || req.body.is_not_sure_how_to_test === true;
      const files = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
      const id = uuidv4();
      const createdBy = req.user.id;

      await prisma.issue.create({
        data: {
          id,
          room_id: roomId,
          created_by: createdBy,
          script_id: scriptNum,
          description: description || '',
          images: files,
          is_issue: isIssue,
          is_annoyance: isAnnoyance,
          is_existing_upper_env: isExistingUpper,
          is_not_sure_how_to_test: isNotSureHowToTest,
        },
      });

      const issue = await prisma.issue.findUnique({
        where: { id },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      const issueOut = {
        ...issue,
        created_by_name: issue?.createdBy?.name || null,
        created_by_email: issue?.createdBy?.email || null,
      };
      delete issueOut.createdBy;
      io.to(roomId).emit('issue:new', issueOut);
      res.json(issueOut);
    } catch (error) {
      console.error('Error creating issue:', error);

      // Clean up any uploaded files if database operation failed
      try {
        if (req.files && req.files.length > 0) {
          req.files.forEach(file => {
            fs.unlink(file.path, (unlinkErr) => {
              if (unlinkErr) console.error('Error cleaning up uploaded file:', unlinkErr);
            });
          });
        }
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
      const normalizedStatus = requestedStatus === 'clear-status' ? 'open' : requestedStatus;

      if (normalizedStatus !== 'open' && !TAGS.includes(normalizedStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const prisma = getPrisma();
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });
      if (!membership || !membership.is_groupier) return res.status(403).json({ error: 'Forbidden' });

      await prisma.issue.update({ where: { id }, data: { status: normalizedStatus } });
      const issue = await prisma.issue.findUnique({
        where: { id },
        include: { createdBy: { select: { name: true, email: true } } },
      });

      if (!issue) {
        return res.status(404).json({ error: 'Issue not found' });
      }

      const out = { ...issue, created_by_name: issue?.createdBy?.name || null, created_by_email: issue?.createdBy?.email || null };
      delete out.createdBy;
      io.to(roomId).emit('issue:update', out);
      res.json(out);
    } catch (error) {
      console.error('Error updating issue status:', error);
      res.status(500).json({ error: 'Failed to update issue status' });
    }
  });

  // Send to Jira (Groupier only)
  router.post('/api/issues/:id/jira', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const { roomId } = req.body;
      const prisma = getPrisma();
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });
      if (!membership || !membership.is_groupier) return res.status(403).json({ error: 'Forbidden' });

      if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
        return res.status(500).json({ error: 'Jira not configured' });
      }

      const issue = await prisma.issue.findUnique({ where: { id } });
      if (!issue) return res.status(404).json({ error: 'Issue not found' });

      if (issue.jira_key) {
        return res.json({ jira_key: issue.jira_key });
      }

      const summary = `Script ${issue.script_id || ''} - ${issue.description?.slice(0, 80) || 'Issue'}`.slice(0, 255);
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

      // Fetch room name for Jira labels
      const room = await prisma.room.findUnique({ where: { id: issue.room_id } });
      const roomName = room?.name || '';
      const roomLabel = `testfest-${(roomName || '')
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+|-+$/g, '') || 'room'}`;

      const payload = {
        fields: {
          project: { key: JIRA_PROJECT_KEY },
          summary,
          description,
          issuetype: { name: JIRA_ISSUE_TYPE },
          labels: [roomLabel],
        },
      };

      const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
      const url = `${JIRA_BASE_URL.replace(/\/$/, '')}/rest/api/3/issue`;

      try {
        const resp = await axios.post(url, payload, {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000, // 30 second timeout
        });

        const jiraKey = resp.data && resp.data.key;
        if (!jiraKey) {
          throw new Error('No Jira key returned from API');
        }

        // Upload attachments if any
        if (issue.images && Array.isArray(issue.images) && issue.images.length > 0) {
          const FormData = require('form-data');
          for (const imagePath of issue.images) {
            try {
              const fullPath = path.join(uploadsDir, path.basename(imagePath));
              if (fs.existsSync(fullPath)) {
                const form = new FormData();
                form.append('file', fs.createReadStream(fullPath));

                await axios.post(
                  `${JIRA_BASE_URL.replace(/\/$/, '')}/rest/api/3/issue/${jiraKey}/attachments`,
                  form,
                  {
                    headers: {
                      Authorization: `Basic ${auth}`,
                      'X-Atlassian-Token': 'no-check',
                      ...form.getHeaders()
                    },
                    timeout: 30000
                  }
                );
              }
            } catch (attachError) {
              console.error(`Failed to upload attachment ${imagePath}:`, attachError.message);
            }
          }
        }

        await prisma.issue.update({ where: { id }, data: { jira_key: jiraKey } });
        const updatedIssue = await prisma.issue.findUnique({ where: { id }, include: { createdBy: { select: { name: true, email: true } } } });
        const updated = { ...updatedIssue, created_by_name: updatedIssue?.createdBy?.name || null, created_by_email: updatedIssue?.createdBy?.email || null };
        delete updated.createdBy;
        io.to(roomId).emit('issue:update', updated);
        res.json({ jira_key: jiraKey });
      } catch (jiraError) {
        console.error('Jira API error:', jiraError.message);
        if (jiraError.response) {
          console.error('Jira response status:', jiraError.response.status);
          console.error('Jira response data:', jiraError.response.data);

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
      const prisma = getPrisma();
      const issue = await prisma.issue.findUnique({ where: { id } });
      if (!issue) return res.status(404).json({ error: 'Issue not found' });

      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: issue.room_id, user_id: req.user.id } } });
      const isGroupier = Boolean(membership && membership.is_groupier);
      const isCreator = issue.created_by === req.user.id;
      if (!isGroupier && !isCreator) return res.status(403).json({ error: 'Forbidden' });

      // Best-effort: remove uploaded images from disk
      try {
        const images = Array.isArray(issue.images) ? issue.images : [];
        images.forEach((p) => {
          if (typeof p === 'string' && p.startsWith('/uploads/')) {
            const abs = path.join(uploadsDir, path.basename(p));
            fs.unlink(abs, (unlinkError) => {
              if (unlinkError && unlinkError.code !== 'ENOENT') {
                console.error('Error deleting file:', unlinkError);
              }
            });
          }
        });
      } catch (fileError) {
        console.error('Error cleaning up files:', fileError);
        // Don't fail the entire operation because of file cleanup errors
      }

      await prisma.issue.delete({ where: { id } });
      io.to(issue.room_id).emit('issue:delete', { id });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting issue:', error);
      res.status(500).json({ error: 'Failed to delete issue' });
    }
  });
}

module.exports = registerIssueRoutes;
