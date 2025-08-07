const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const session = require('express-session');
const pg = require('pg');
const pgSession = require('connect-pg-simple')(session);
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const axios = require('axios');
const { Issuer, Strategy } = require('openid-client');
require('dotenv').config();

// Environment
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_me_session_secret';
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = ((process.env.DB_SCHEMA || 'testfest').replace(/[^a-zA-Z0-9_]/g, '')) || 'testfest';
const DISABLE_SSO = process.env.DISABLE_SSO === 'true';
const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL || 'dev@example.com';
const DEV_USER_NAME = process.env.DEV_USER_NAME || 'Dev User';
const ENTRA_ISSUER = process.env.ENTRA_ISSUER; // e.g. https://login.microsoftonline.com/<tenant-id>/v2.0
const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID;
const ENTRA_CLIENT_SECRET = process.env.ENTRA_CLIENT_SECRET;
const ENTRA_REDIRECT_URI = process.env.ENTRA_REDIRECT_URI || 'http://localhost:3000/auth/callback';
const GROUPIER_EMAILS = (process.env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
const TAGS = (process.env.TAGS || 'duplicate,as-designed,low-priority').split(',').map((s) => s.trim());

// Jira config
const JIRA_BASE_URL = process.env.JIRA_BASE_URL; // e.g. https://your-domain.atlassian.net
const JIRA_EMAIL = process.env.JIRA_EMAIL; // account email
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN; // API token
const JIRA_PROJECT_KEY = process.env.JIRA_PROJECT_KEY; // e.g. TEST
const JIRA_ISSUE_TYPE = process.env.JIRA_ISSUE_TYPE || 'Bug';

// Basic checks
if (!DATABASE_URL) {
    console.error('DATABASE_URL is required in .env');
    process.exit(1);
}

// DB setup
const { Pool } = pg;
const pool = new Pool({ connectionString: DATABASE_URL });

// Ensure all new connections default to testfest schema
pool.on('connect', (client) => {
    client.query(`SET search_path TO ${SCHEMA}, public`);
});

async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
        await client.query(`SET search_path TO ${SCHEMA}, public`);
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        sub TEXT UNIQUE NOT NULL,
        name TEXT,
        email TEXT
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS room_members (
        room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        is_groupier BOOLEAN DEFAULT false,
        PRIMARY KEY (room_id, user_id)
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id UUID PRIMARY KEY,
        room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        script_id TEXT,
        description TEXT,
        images JSONB DEFAULT '[]'::jsonb,
        is_issue BOOLEAN DEFAULT false,
        is_annoyance BOOLEAN DEFAULT false,
        is_existing_upper_env BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'open',
        jira_key TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration error:', e);
        throw e;
    } finally {
        client.release();
    }
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const ext = path.extname(file.originalname);
        cb(null, `${unique}${ext}`);
    },
});
const upload = multer({ storage });

// Express app
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: { origin: false },
});

app.use(morgan('dev'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use('/static', express.static(path.join(__dirname, 'public')));

// Health endpoint for container orchestration
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Sessions
app.set('trust proxy', 1);
app.use(
    session({
        store: new pgSession({
            pool,
            tableName: 'session',
            createTableIfMissing: true,
        }),
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 1000 * 60 * 60 * 8,
        },
    })
);

// Passport OIDC with Entra ID
let oidcClient;
async function setupOIDC() {
    if (DISABLE_SSO) {
        console.warn('SSO disabled by DISABLE_SSO=true; using dev auto-auth.');
        return;
    }
    if (!ENTRA_ISSUER || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET) {
        console.warn('Entra ID OIDC not fully configured. Set ENTRA_ISSUER, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET.');
        return;
    }
    const issuer = await Issuer.discover(ENTRA_ISSUER);
    oidcClient = new issuer.Client({
        client_id: ENTRA_CLIENT_ID,
        client_secret: ENTRA_CLIENT_SECRET,
        redirect_uris: [ENTRA_REDIRECT_URI],
        response_types: ['code'],
    });

    passport.use(
        'oidc',
        new Strategy({
            client: oidcClient,
            passReqToCallback: true,
            usePKCE: false,
        }, async (req, tokenset, userinfo, done) => {
            try {
                const sub = userinfo.sub || tokenset.claims().sub;
                const name = userinfo.name || userinfo.preferred_username || '';
                const email = userinfo.email || userinfo.upn || '';
                const client = await pool.connect();
                try {
                    const existing = await client.query('SELECT * FROM users WHERE sub = $1', [sub]);
                    let user;
                    if (existing.rowCount === 0) {
                        user = {
                            id: uuidv4(),
                            sub,
                            name,
                            email,
                        };
                        await client.query(
                            'INSERT INTO users (id, sub, name, email) VALUES ($1, $2, $3, $4)',
                            [user.id, user.sub, user.name, user.email]
                        );
                    } else {
                        user = existing.rows[0];
                    }
                    done(null, user);
                } finally {
                    client.release();
                }
            } catch (e) {
                done(e);
            }
        })
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });
    passport.deserializeUser(async (id, done) => {
        const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        done(null, rows[0] || null);
    });
}

app.use(passport.initialize());
app.use(passport.session());

// In dev mode with SSO disabled, automatically attach a dev user to the request
app.use(async (req, res, next) => {
    if (!DISABLE_SSO) return next();
    if (req.user) return next();
    try {
        const sub = 'dev-user';
        const { rows } = await pool.query('SELECT * FROM users WHERE sub = $1', [sub]);
        let user = rows[0];
        if (!user) {
            const id = uuidv4();
            await pool.query('INSERT INTO users (id, sub, name, email) VALUES ($1, $2, $3, $4)', [id, sub, DEV_USER_NAME, DEV_USER_EMAIL]);
            user = { id, sub, name: DEV_USER_NAME, email: DEV_USER_EMAIL };
        }
        req.user = user;
    } catch (e) {
        console.error('Dev auto-auth error:', e);
    }
    next();
});

// Auth routes
app.get('/auth/login', async (req, res, next) => {
    if (DISABLE_SSO) return res.redirect('/');
    if (!oidcClient) return res.status(500).send('OIDC not configured');
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
    res.json({ user: req.user || null, tags: TAGS });
});

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// HTML entry
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rooms
app.get('/api/rooms', requireAuth, async (req, res) => {
    const { rows } = await pool.query(
        `SELECT r.*, (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
     FROM rooms r ORDER BY r.created_at DESC`
    );
    res.json(rows);
});

app.post('/api/rooms', requireAuth, async (req, res) => {
    const name = (req.body.name || '').trim() || `Room ${new Date().toLocaleString()}`;
    const roomId = uuidv4();
    const userId = req.user.id;
    await pool.query('INSERT INTO rooms (id, name, created_by) VALUES ($1, $2, $3)', [roomId, name, userId]);
    // Determine if user is groupier (creator or email in GROUPIER_EMAILS)
    const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || true; // creator is groupier
    await pool.query('INSERT INTO room_members (room_id, user_id, is_groupier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [roomId, userId, isGroupier]);
    res.json({ id: roomId, name, created_by: userId });
});

app.post('/api/rooms/:roomId/join', requireAuth, async (req, res) => {
    const { roomId } = req.params;
    const isGroupier = GROUPIER_EMAILS.includes((req.user.email || '').toLowerCase()) || false;
    await pool.query('INSERT INTO room_members (room_id, user_id, is_groupier) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [roomId, req.user.id, isGroupier]);
    res.json({ ok: true });
});

app.get('/api/rooms/:roomId/issues', requireAuth, async (req, res) => {
    const { roomId } = req.params;
    const { rows } = await pool.query('SELECT * FROM issues WHERE room_id = $1 ORDER BY created_at DESC', [roomId]);
    res.json(rows);
});

// Issues create with uploads
app.post('/api/rooms/:roomId/issues', requireAuth, upload.array('images', 5), async (req, res) => {
    const { roomId } = req.params;
    const { scriptId, description } = req.body;
    const isIssue = req.body.is_issue === 'on' || req.body.is_issue === 'true' || req.body.is_issue === true;
    const isAnnoyance = req.body.is_annoyance === 'on' || req.body.is_annoyance === 'true' || req.body.is_annoyance === true;
    const isExistingUpper = req.body.is_existing_upper_env === 'on' || req.body.is_existing_upper_env === 'true' || req.body.is_existing_upper_env === true;
    const files = (req.files || []).map((f) => `/uploads/${path.basename(f.path)}`);
    const id = uuidv4();
    const createdBy = req.user.id;
    const { rows } = await pool.query(
        `INSERT INTO issues (id, room_id, created_by, script_id, description, images, is_issue, is_annoyance, is_existing_upper_env)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     RETURNING *`,
        [id, roomId, createdBy, scriptId || '', description || '', JSON.stringify(files), isIssue, isAnnoyance, isExistingUpper]
    );
    const issue = rows[0];
    io.to(roomId).emit('issue:new', issue);
    res.json(issue);
});

// Update issue status (Groupier only)
app.post('/api/issues/:id/status', requireAuth, async (req, res) => {
    const { id } = req.params;
    const { status, roomId } = req.body;
    if (!TAGS.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // Check groupier
    const { rows: membership } = await pool.query('SELECT is_groupier FROM room_members WHERE room_id = $1 AND user_id = $2', [roomId, req.user.id]);
    if (membership.length === 0 || !membership[0].is_groupier) return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query('UPDATE issues SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
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
    const description = `Description:\n${issue.description || ''}\n\nFlags: issue=${issue.is_issue}, annoyance=${issue.is_annoyance}, existing_upper_env=${issue.is_existing_upper_env}`;

    const payload = {
        fields: {
            project: { key: JIRA_PROJECT_KEY },
            summary,
            description,
            issuetype: { name: JIRA_ISSUE_TYPE },
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
    const updated = { ...issue, jira_key: jiraKey };
    io.to(roomId).emit('issue:update', updated);
    res.json({ jira_key: jiraKey });
});

// Socket.io logic
io.on('connection', (socket) => {
    socket.on('room:join', (roomId) => {
        socket.join(roomId);
    });
    socket.on('disconnect', () => { });
});

// Start server
(async () => {
    await runMigrations();
    try {
        await setupOIDC();
    } catch (e) {
        console.error('OIDC setup error:', e);
    }
    server.listen(PORT, () => {
        console.log(`Test Fest Tracker running on http://localhost:${PORT}`);
    });
})();


