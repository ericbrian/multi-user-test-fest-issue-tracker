const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getPrisma } = require('./prismaClient');

function registerRoutes(app, deps) {
  const {
    pool,
    io,
    upload,
    uploadsDir,
    TAGS,
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPE,
    DISABLE_SSO,
    passport,
  } = deps;

  const { requireAuth } = require('./middleware');

  // Health endpoint for container orchestration
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Auth routes
  app.get('/auth/login', async (req, res, next) => {
    if (DISABLE_SSO) return res.redirect('/');
    if (!passport || !passport._strategies || !passport._strategies['oidc']) return res.status(500).send('OIDC not configured');
    passport.authenticate('oidc')(req, res, next);
  });

  app.get('/auth/callback', (req, res, next) => {
    passport.authenticate('oidc', {
      successRedirect: '/',
      failureRedirect: '/?login=failed',
    })(req, res, next);
  });

  app.post('/auth/logout', (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(200).json({ ok: true });
      });
    });
  });

  app.get('/me', (req, res) => {
    res.json({
      user: req.user || null,
      tags: TAGS,
      jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/$/, '') : null,
    });
  });

  // HTML entry
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Room-specific URLs
  app.get('/fest/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Script Library
  app.get('/api/script-library', requireAuth, async (req, res) => {
    try {
      const prisma = getPrisma();
      const scripts = await prisma.scriptLibrary.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { lines: true } }
        }
      });
      const result = scripts.map((s) => ({
        ...s,
        line_count: s._count?.lines || 0
      }));
      res.json(result);
    } catch (error) {
      console.error('Error fetching script library:', error);
      res.status(500).json({ error: 'Failed to fetch script library' });
    }
  });

  // Rooms
  app.get('/api/rooms', requireAuth, async (req, res) => {
    try {
      const prisma = getPrisma();
      const rooms = await prisma.room.findMany({
        orderBy: { created_at: 'desc' },
        include: { _count: { select: { members: true } } },
      });
      const result = rooms.map((r) => ({ ...r, member_count: String(r._count?.members || 0) }));
      res.json(result);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ error: 'Failed to fetch rooms' });
    }
  });

  app.post('/api/rooms', requireAuth, async (req, res) => {
    try {
      const prisma = getPrisma();
      const name = (req.body.name || '').trim() || `Room ${new Date().toLocaleString()}`;
      const description = req.body.description || null;
      const selectedScriptId = req.body.scriptId || null;

      const roomId = uuidv4();
      const userId = req.user.id;

      // Create the room
      await prisma.room.create({ data: { id: roomId, name, created_by: userId } });

      // Create test script based on selection
      const testScriptId = uuidv4();
      if (selectedScriptId) {
        // User selected a script from the library
        const libraryScript = await prisma.scriptLibrary.findUnique({
          where: { id: selectedScriptId },
          include: { lines: { orderBy: { line_number: 'asc' } } }
        });

        if (libraryScript) {
          // Create test script with library script name and description
          await prisma.testScript.create({
            data: {
              id: testScriptId,
              room_id: roomId,
              script_id: 1,
              name: libraryScript.name,
              description: libraryScript.description,
            }
          });

          // Copy lines from library script to test script
          for (const libraryLine of libraryScript.lines) {
            await prisma.testScriptLine.create({
              data: {
                id: uuidv4(),
                test_script_id: testScriptId,
                test_script_line_id: libraryLine.line_number,
                name: libraryLine.name,
                description: libraryLine.description,
                notes: libraryLine.notes,
              }
            });
          }
        } else {
          // Fallback: create empty script if library script not found
          await prisma.testScript.create({
            data: {
              id: testScriptId,
              room_id: roomId,
              script_id: 1,
              name: name,
              description: description,
            }
          });
        }
      } else {
        // No script selected, create empty test script
        await prisma.testScript.create({
          data: {
            id: testScriptId,
            room_id: roomId,
            script_id: 1,
            name: name,
            description: description,
          }
        });
      }

      const GROUPIER_EMAILS = (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || true; // creator is groupier
      // creator joins as member
      await prisma.roomMember.create({ data: { room_id: roomId, user_id: userId, is_groupier: isGroupier } }).catch(() => { });

      res.json({ id: roomId, name, created_by: userId });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  app.post('/api/rooms/:roomId/join', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();

      // Check if this user created the room
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      const isRoomCreator = room && room.created_by === req.user.id;

      const GROUPIER_EMAILS = (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || isRoomCreator;

      await prisma.roomMember.upsert({
        where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } },
        update: { is_groupier: isGroupier },
        create: { room_id: roomId, user_id: req.user.id, is_groupier: isGroupier },
      });
      res.json({ ok: true, isGroupier });
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).json({ error: 'Failed to join room' });
    }
  });

  app.get('/api/rooms/:roomId/issues', requireAuth, async (req, res) => {
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

  // Issues create with uploads
  app.post('/api/rooms/:roomId/issues', requireAuth, upload.array('images', 5), async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();
      const { scriptId, description } = req.body;

      if (!scriptId || !/^\d+$/.test(String(scriptId))) {
        return res.status(400).json({ error: 'Script ID is required and must be numeric' });
      }
      if (!description || String(description).trim().length === 0) {
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
  app.post('/api/issues/:id/status', requireAuth, async (req, res) => {
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
  app.post('/api/issues/:id/jira', requireAuth, async (req, res) => {
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
  app.delete('/api/issues/:id', requireAuth, async (req, res) => {
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

  // Test Script Lines
  app.get('/api/rooms/:roomId/test-script-lines', requireAuth, async (req, res) => {
    try {
      const { roomId } = req.params;
      const prisma = getPrisma();
      const userId = req.user.id;

      const testScriptLines = await prisma.testScriptLine.findMany({
        where: {
          testScript: {
            room_id: roomId
          }
        },
        include: {
          testScript: true,
          progress: {
            where: {
              user_id: userId
            }
          }
        },
        orderBy: [
          { testScript: { script_id: 'asc' } },
          { test_script_line_id: 'asc' }
        ]
      });

      const result = testScriptLines.map(line => ({
        ...line,
        is_checked: line.progress.length > 0 ? line.progress[0].is_checked : false,
        checked_at: line.progress.length > 0 ? line.progress[0].checked_at : null,
        progress_notes: line.progress.length > 0 ? line.progress[0].notes : null
      }));

      res.json(result);
    } catch (error) {
      console.error('Error fetching test script lines:', error);
      res.status(500).json({ error: 'Failed to fetch test script lines' });
    }
  });

  app.post('/api/test-script-lines/:lineId/progress', requireAuth, async (req, res) => {
    try {
      const { lineId } = req.params;
      const { is_checked, notes } = req.body;
      const prisma = getPrisma();
      const userId = req.user.id;

      const progressData = {
        is_checked: Boolean(is_checked),
        checked_at: is_checked ? new Date() : null,
        notes: notes || null,
        updated_at: new Date()
      };

      const existingProgress = await prisma.testScriptLineProgress.findUnique({
        where: {
          user_id_test_script_line_id: {
            user_id: userId,
            test_script_line_id: lineId
          }
        }
      });

      let progress;
      if (existingProgress) {
        progress = await prisma.testScriptLineProgress.update({
          where: {
            user_id_test_script_line_id: {
              user_id: userId,
              test_script_line_id: lineId
            }
          },
          data: progressData
        });
      } else {
        progress = await prisma.testScriptLineProgress.create({
          data: {
            id: uuidv4(),
            user_id: userId,
            test_script_line_id: lineId,
            ...progressData
          }
        });
      }

      // Fetch the test script line to get the room_id for socket notification
      const testScriptLine = await prisma.testScriptLine.findUnique({
        where: { id: lineId },
        include: { testScript: true }
      });

      if (testScriptLine) {
        io.to(testScriptLine.testScript.room_id).emit('testScriptLine:progress', {
          lineId,
          userId,
          is_checked: progress.is_checked,
          checked_at: progress.checked_at,
          notes: progress.notes
        });
      }

      res.json(progress);
    } catch (error) {
      console.error('Error updating test script line progress:', error);
      res.status(500).json({ error: 'Failed to update progress' });
    }
  });

  // Global error handling middleware
  app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);

    // Don't leak internal error details to clients in production
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        details: error.message,
        stack: error.stack
      });
    }
  });
}

module.exports = { registerRoutes };
