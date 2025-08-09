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

    // Rooms
    app.get('/api/rooms', requireAuth, async (req, res) => {
        const prisma = getPrisma();
        const rooms = await prisma.room.findMany({
            orderBy: { created_at: 'desc' },
            include: { _count: { select: { members: true } } },
        });
        const result = rooms.map((r) => ({ ...r, member_count: String(r._count?.members || 0) }));
        res.json(result);
    });

    app.post('/api/rooms', requireAuth, async (req, res) => {
        const name = (req.body.name || '').trim() || `Room ${new Date().toLocaleString()}`;
        const roomId = uuidv4();
        const userId = req.user.id;
        await pool.query('INSERT INTO rooms (id, name, created_by) VALUES ($1, $2, $3)', [roomId, name, userId]);
        const GROUPIER_EMAILS = (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || true; // creator is groupier
        await pool.query('INSERT INTO room_members (room_id, user_id, is_groupier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [roomId, userId, isGroupier]);
        res.json({ id: roomId, name, created_by: userId });
    });

    app.post('/api/rooms/:roomId/join', requireAuth, async (req, res) => {
        const { roomId } = req.params;
        const GROUPIER_EMAILS = (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || false;
        await pool.query('INSERT INTO room_members (room_id, user_id, is_groupier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [roomId, req.user.id, isGroupier]);
        res.json({ ok: true, isGroupier });
    });

    app.get('/api/rooms/:roomId/issues', requireAuth, async (req, res) => {
        const { roomId } = req.params;
        const { rows } = await pool.query(
            `SELECT i.*, u.name AS created_by_name, u.email AS created_by_email
       FROM issues i
       LEFT JOIN users u ON u.id = i.created_by
       WHERE i.room_id = $1
       ORDER BY i.script_id ASC NULLS LAST, i.created_at ASC`,
            [roomId]
        );
        res.json(rows);
    });

    // Issues create with uploads
    app.post('/api/rooms/:roomId/issues', requireAuth, upload.array('images', 5), async (req, res) => {
        const { roomId } = req.params;
        const { scriptId, description } = req.body;
        if (!scriptId || !/^\d+$/.test(String(scriptId))) {
            return res.status(400).json({ error: 'Script ID is required and must be numeric' });
        }
        if (!description || String(description).trim().length === 0) {
            return res.status(400).json({ error: 'Issue Description is required' });
        }
        const scriptNum = parseInt(String(scriptId), 10);
        // Ensure script exists to satisfy FK
        const { rowCount: scriptExists } = await pool.query('SELECT 1 FROM test_script WHERE script_id = $1', [scriptNum]);
        if (scriptExists === 0) {
            return res.status(400).json({ error: 'Script not found' });
        }
        const isIssue = req.body.is_issue === 'on' || req.body.is_issue === 'true' || req.body.is_issue === true;
        const isAnnoyance = req.body.is_annoyance === 'on' || req.body.is_annoyance === 'true' || req.body.is_annoyance === true;
        const isExistingUpper = req.body.is_existing_upper_env === 'on' || req.body.is_existing_upper_env === 'true' || req.body.is_existing_upper_env === true;
        const isNotSureHowToTest = req.body.is_not_sure_how_to_test === 'on' || req.body.is_not_sure_how_to_test === 'true' || req.body.is_not_sure_how_to_test === true;
        const files = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
        const id = uuidv4();
        const createdBy = req.user.id;
        await pool.query(
            `INSERT INTO issues (id, room_id, created_by, script_id, description, images, is_issue, is_annoyance, is_existing_upper_env, is_not_sure_how_to_test)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
            [id, roomId, createdBy, scriptNum, description || '', JSON.stringify(files), isIssue, isAnnoyance, isExistingUpper, isNotSureHowToTest]
        );
        const { rows: enrichedRows } = await pool.query(
            `SELECT i.*, u.name AS created_by_name, u.email AS created_by_email
         FROM issues i
         LEFT JOIN users u ON u.id = i.created_by
         WHERE i.id = $1`,
            [id]
        );
        const issue = enrichedRows[0];
        io.to(roomId).emit('issue:new', issue);
        res.json(issue);
    });

    // Update issue status (Groupier only)
    app.post('/api/issues/:id/status', requireAuth, async (req, res) => {
        const { id } = req.params;
        const { status: requestedStatus, roomId } = req.body;
        const normalizedStatus = requestedStatus === 'clear-status' ? 'open' : requestedStatus;
        if (normalizedStatus !== 'open' && !TAGS.includes(normalizedStatus)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Check groupier
        const { rows: membership } = await pool.query('SELECT is_groupier FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (membership.length === 0 || !membership[0].is_groupier) return res.status(403).json({ error: 'Forbidden' });

        await pool.query('UPDATE issues SET status = $1 WHERE id = $2', [normalizedStatus, id]);
        const { rows } = await pool.query(
            `SELECT i.*, u.name AS created_by_name, u.email AS created_by_email
         FROM issues i
         LEFT JOIN users u ON u.id = i.created_by
         WHERE i.id = $1`,
            [id]
        );
        const issue = rows[0];
        io.to(roomId).emit('issue:update', issue);
        res.json(issue);
    });

    // Send to Jira (Groupier only)
    app.post('/api/issues/:id/jira', requireAuth, async (req, res) => {
        const { id } = req.params;
        const { roomId } = req.body;
        const { rows: membership } = await pool.query('SELECT is_groupier FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
        if (membership.length === 0 || !membership[0].is_groupier) return res.status(403).json({ error: 'Forbidden' });

        if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
            return res.status(500).json({ error: 'Jira not configured' });
        }

        const { rows: issuesRows } = await pool.query('SELECT * FROM issues WHERE id = $1', [id]);
        const issue = issuesRows[0];
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        if (issue.jira_key) {
            return res.json({ jira_key: issue.jira_key });
        }

        const summary = `Script ${issue.script_id || ''} - ${issue.description?.slice(0, 80) || 'Issue'}`.slice(0, 255);
        const description = `Description:\n${issue.description || ''}\n\nFlags: issue=${issue.is_issue}, annoyance=${issue.is_annoyance}, existing_upper_env=${issue.is_existing_upper_env}, not_sure_how_to_test=${issue.is_not_sure_how_to_test}`;

        // Fetch room name for Jira labels
        const { rows: roomRows } = await pool.query('SELECT name FROM rooms WHERE id = $1', [issue.room_id]);
        const roomName = (roomRows[0] && roomRows[0].name) || '';
        const roomLabel = (roomName || '')
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9\-]+/g, '')
            .replace(/--+/g, '-')
            .replace(/^-+|-+$/g, '') || 'test-fest-room';

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
        const resp = await axios.post(url, payload, {
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });
        const jiraKey = resp.data && resp.data.key;
        await pool.query('UPDATE issues SET jira_key = $1 WHERE id = $2', [jiraKey, id]);
        const { rows: enrichedRows2 } = await pool.query(
            `SELECT i.*, u.name AS created_by_name, u.email AS created_by_email
         FROM issues i
         LEFT JOIN users u ON u.id = i.created_by
         WHERE i.id = $1`,
            [id]
        );
        const updated = enrichedRows2[0];
        io.to(roomId).emit('issue:update', updated);
        res.json({ jira_key: jiraKey });
    });

    // Delete issue (creator or Groupier)
    app.delete('/api/issues/:id', requireAuth, async (req, res) => {
        const { id } = req.params;
        // Fetch issue
        const { rows: issuesRows } = await pool.query('SELECT * FROM issues WHERE id = $1', [id]);
        const issue = issuesRows[0];
        if (!issue) return res.status(404).json({ error: 'Issue not found' });

        // Determine membership and permission
        const { rows: membership } = await pool.query(
            'SELECT is_groupier FROM room_members WHERE room_id = $1 AND user_id = $2',
            [issue.room_id, req.user.id]
        );
        const isGroupier = membership.length > 0 && membership[0].is_groupier;
        const isCreator = issue.created_by === req.user.id;
        if (!isGroupier && !isCreator) return res.status(403).json({ error: 'Forbidden' });

        // Best-effort: remove uploaded images from disk
        try {
            const images = Array.isArray(issue.images) ? issue.images : [];
            images.forEach((p) => {
                if (typeof p === 'string' && p.startsWith('/uploads/')) {
                    const abs = path.join(uploadsDir, path.basename(p));
                    fs.unlink(abs, () => { });
                }
            });
        } catch (_) { }

        await pool.query('DELETE FROM issues WHERE id = $1', [id]);
        io.to(issue.room_id).emit('issue:delete', { id });
        res.json({ ok: true });
    });
}

module.exports = { registerRoutes };


