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
const { Issuer, Strategy } = require('openid-client');
const { registerRoutes } = require('./src/routes');
const { getPrisma } = require('./src/prismaClient');
require('dotenv').config();

// Environment
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_me_session_secret';
const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA = ((process.env.DB_SCHEMA || 'testfest').replace(/[^a-zA-Z0-9_]/g, '')) || 'testfest';

// Validate SESSION_SECRET
if (!SESSION_SECRET || SESSION_SECRET === 'change_me_session_secret') {
  console.error('FATAL: SESSION_SECRET must be set to a secure random value in .env');
  console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))";');
  process.exit(1);
}
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

// Handle database connection errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client:', err);
});

// Whitelist of allowed schema names for security
const ALLOWED_SCHEMAS = ['testfest', 'public'];
if (!ALLOWED_SCHEMAS.includes(SCHEMA)) {
  console.error(`FATAL: Invalid schema name "${SCHEMA}". Allowed schemas: ${ALLOWED_SCHEMAS.join(', ')}`);
  process.exit(1);
}

// Ensure all new connections default to testfest schema and log connection
pool.on('connect', (client) => {
  console.log('Database connected successfully');
  // Using identifier sanitization - schema name is validated against allow list above
  client.query(`SET search_path TO "${SCHEMA}", public`);
});

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

// Routes are now in src/routes.js

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
        const prisma = getPrisma();
        let user = await prisma.user.findUnique({ where: { sub } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              id: uuidv4(),
              sub,
              name,
              email,
            },
          });
        }
        done(null, user);
      } catch (e) {
        done(e);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });
  passport.deserializeUser(async (id, done) => {
    try {
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user || null);
    } catch (e) {
      done(e);
    }
  });
}

app.use(passport.initialize());
app.use(passport.session());

// In dev mode with SSO disabled, automatically attach a dev user to the request
const { createDevAutoAuthMiddleware } = require('./src/middleware');
app.use(createDevAutoAuthMiddleware({ DISABLE_SSO, DEV_USER_EMAIL, DEV_USER_NAME }));

// Auth routes moved to src/routes.js

// Register routes
registerRoutes(app, {
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
});

// Socket.io logic
io.on('connection', (socket) => {
  socket.on('room:join', (roomId) => {
    socket.join(roomId);
  });
  socket.on('disconnect', () => { });
});

// Global process error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Only exit on fatal errors, log others for monitoring
  if (error.code === 'ECONNREFUSED' || error.message.includes('FATAL')) {
    console.error('Fatal error detected, shutting down...');
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  // Log but don't exit - let the application continue for non-fatal rejections
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    console.log('Server closed.');
    try {
      // Close database connections
      await pool.end();
      console.log('Database pool closed.');
      // Disconnect Prisma
      const prisma = getPrisma();
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
    } catch (err) {
      console.error('Error during cleanup:', err);
    } finally {
      process.exit(0);
    }
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    console.log('Server closed.');
    try {
      // Close database connections
      await pool.end();
      console.log('Database pool closed.');
      // Disconnect Prisma
      const prisma = getPrisma();
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
    } catch (err) {
      console.error('Error during cleanup:', err);
    } finally {
      process.exit(0);
    }
  });
});

// Start server
(async () => {
  try {
    await setupOIDC();
  } catch (e) {
    console.error('OIDC setup error:', e);
  }
  
  // Handle server startup errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Please stop the existing process or set a different PORT environment variable.`);
      process.exit(1);
    } else if (err.code === 'EACCES') {
      console.error(`Permission denied to bind to port ${PORT}. Try using a port number above 1024 or run with elevated privileges.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Test Fest Tracker running on http://localhost:${PORT}`);
  });
})();
