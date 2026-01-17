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
const helmet = require('helmet');
const csurf = require('csurf');
const { Issuer, Strategy } = require('openid-client');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/swagger');
const { registerRoutes } = require('./src/routes');
const { getPrisma } = require('./src/prismaClient');
const { validateConfig } = require('./src/config');
const { createMetrics } = require('./src/metrics');
const { createCacheFromEnv } = require('./src/cache');

const isProduction = process.env.NODE_ENV === 'production';

// Validate and load configuration
const config = validateConfig();
const {
  PORT,
  SESSION_SECRET,
  DATABASE_URL,
  SCHEMA,
  ENTRA_ISSUER,
  ENTRA_CLIENT_ID,
  ENTRA_CLIENT_SECRET,
  ENTRA_REDIRECT_URI,
  GROUPIER_EMAILS,
  TAGS,
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_PROJECT_KEY,
  JIRA_ISSUE_TYPE,
  BUNNY_API_KEY,
  BUNNY_STORAGE_ZONE_NAME,
  BUNNY_PULL_ZONE,
  BUNNY_REGION,
} = config;

// DB setup
const { Pool } = pg;
// Limit the pool size for session management to avoid exhausting connections
// Prisma has its own connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ...(isProduction
    ? {
        ssl: {
          // Hosted Postgres providers often require TLS; certificate validation can vary.
          // If your provider supports full verification, set DATABASE_SSL_REJECT_UNAUTHORIZED=true
          rejectUnauthorized: String(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() === 'true',
        },
      }
    : {}),
  max: 10, // Limit to 10 connections for session management
  idleTimeoutMillis: 30000,
});

// Handle database connection errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client:', err);
});

// Ensure all new connections default to testfest schema and log connection
pool.on('connect', (client) => {
  console.log('Database connected successfully');
  // Using identifier sanitization - schema name is validated in config.js
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

// File upload validation
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error(`Invalid file type. Only images are allowed (JPEG, PNG, GIF, WebP, AVIF). Received: ${file.mimetype}`));
    }

    // Additional check on file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error(`Invalid file extension. Only ${allowedExtensions.join(', ')} are allowed. Received: ${ext}`));
    }

    cb(null, true);
  }
});

// Express app
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server, {
  cors: { origin: false },
});

// Caching (opt-in): set CACHE_ENABLED=true to enable short-lived caching for read-heavy endpoints.
const cache = createCacheFromEnv({ isProduction });

// Frontend static serving
// - Development: serve from ./public
// - Production: if ./dist exists (built via `npm run build:ui`), serve from ./dist
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');
const useBuiltUi = isProduction && fs.existsSync(path.join(distDir, 'index.html'));
const uiDir = useBuiltUi ? distDir : publicDir;
const uiIndexPath = path.join(uiDir, 'index.html');

// Rate limiting
const { apiLimiter } = require('./src/rateLimiter');

// Security headers with Content Security Policy
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    // Allow Socket.IO which is served from /socket.io/
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'", // Required for inline styles in HTML (minimal usage)
  ],
  imgSrc: [
    "'self'",
    "data:",
    "blob:",
    "https://*.b-cdn.net", // Allow BunnyCDN images
  ],
  connectSrc: [
    "'self'",
    "ws:",
    "wss:",
  ],
  fontSrc: ["'self'", "data:"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
};
if (isProduction) {
  cspDirectives.upgradeInsecureRequests = [];
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: cspDirectives,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));
app.disable('x-powered-by');
app.use(morgan('dev'));

// Monitoring / Observability: Prometheus metrics
const metrics = createMetrics({ appName: 'test_fest_tracker' });
app.use(metrics.metricsMiddleware);
app.get('/metrics', (req, res, next) => {
  // Optional protection: set METRICS_TOKEN to require a bearer token.
  const token = process.env.METRICS_TOKEN;
  if (!token) return next();

  const auth = String(req.headers.authorization || '');
  if (auth === `Bearer ${token}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}, metrics.metricsHandler);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
// Serve static files at root (Vite build expects /assets/*) and keep /static/* as an alias.
app.use(express.static(uiDir, { index: false }));
app.use('/static', express.static(uiDir, { index: false }));

// Apply rate limiting to API routes
// Apply rate limiting to API routes - moved to below middleware import
app.use('/api/', apiLimiter);

// Routes are now in src/routes.js

// Sessions
app.set('trust proxy', 1);
app.use(
  session({
    // Tests should not require native sqlite bindings.
    // Use the built-in MemoryStore for NODE_ENV=test.
    store: process.env.NODE_ENV === 'test'
      ? new session.MemoryStore()
      : new pgSession({
          pool,
          tableName: 'session',
          createTableIfMissing: true,
        }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Passport OIDC with Entra ID
let oidcClient;
async function setupOIDC() {
  // Skip OIDC setup in test mode
  if (process.env.NODE_ENV === 'test') {
    console.warn('⚠️  TEST MODE: Skipping OIDC setup (NODE_ENV=test)');
    return;
  }

  if (!ENTRA_ISSUER || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET) {
    console.error('Entra ID OIDC not fully configured. Set ENTRA_ISSUER, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET.');
    throw new Error('SSO configuration is required');
  }
  const issuer = await Issuer.discover(ENTRA_ISSUER);
  oidcClient = new issuer.Client({
    client_id: ENTRA_CLIENT_ID,
    client_secret: ENTRA_CLIENT_SECRET,
    redirect_uris: ENTRA_REDIRECT_URI ? [ENTRA_REDIRECT_URI] : [],
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

// CSRF Protection
app.use(csurf());
app.use((req, res, next) => {
  const token = req.csrfToken();
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProduction,
  });
  res.locals.csrfToken = token;
  next();
});

// Test mode authentication (NODE_ENV=test only)
if (process.env.NODE_ENV === 'test') {
  const { createTestAuthMiddleware } = require('./src/middleware');
  app.use(createTestAuthMiddleware());
  console.warn('⚠️  TEST MODE: Using test authentication (NODE_ENV=test)');
}

// Apply no-cache middleware
const { noCache } = require('./src/middleware');

// Apply rate limiting and no-cache to API routes
// Split into separate calls to avoid potential issues and ensure correct order
// app.use('/api/', apiLimiter);
app.use('/api/', noCache);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Test Fest Tracker API Docs',
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true,
  },
}));

// Auth routes moved to src/routes.js

// Register routes
registerRoutes(app, {
  io,
  upload,
  uploadsDir,
  TAGS,
  JIRA_BASE_URL,
  JIRA_EMAIL,
  JIRA_API_TOKEN,
  JIRA_PROJECT_KEY,
  JIRA_ISSUE_TYPE,
  passport,
  GROUPIER_EMAILS,
  uiIndexPath,
  cache,
  ENTRA_REDIRECT_URI,
  BUNNY_API_KEY,
  BUNNY_STORAGE_ZONE_NAME,
  BUNNY_PULL_ZONE,
  BUNNY_REGION,
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  // Log detiled error information
  const fs = require('fs');
  const path = require('path');
  try {
    const logData = {
      timestamp: new Date().toISOString(),
      message: err.message,
      stack: err.stack,
      code: err.code,
      path: req.path,
      method: req.method,
      hasFiles: !!req.files,
      filesCount: req.files ? req.files.length : 0,
      body: req.body
    };
    fs.writeFileSync(path.join(__dirname, 'last_server_error.json'), JSON.stringify(logData, null, 2));
  } catch(e) { /* ignore write failure */ }

  console.error('Unhandled Error:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    path: req.path,
    method: req.method,
    body: req.body, // Be careful with sensitive data, but helpful for debugging
    files: req.files ? req.files.map(f => ({ originalname: f.originalname, path: f.path, size: f.size })) : undefined
  });

  // Delegate to default handler or send generic 500
  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: isProduction ? 'An unexpected error occurred' : err.message
  });
});

// Socket.io logic
io.on('connection', (socket) => {
  socket.on('room:join', async (payload) => {
    // Handle both string (legacy) and object payload
    const roomId = typeof payload === 'object' ? payload.roomId : payload;
    const user = typeof payload === 'object' ? payload.user : null;

    socket.join(roomId);

    if (user) {
      socket.data.user = user;

      // Broadcast to others that a user joined
      socket.to(roomId).emit('room:user_joined', user);

      // Fetch all sockets in the room to get current user list
      const sockets = await io.in(roomId).fetchSockets();
      // key by user.id to avoid duplicates if user has multiple tabs open
      const uniqueUsers = new Map();

      sockets.forEach(s => {
        if (s.data.user) {
          uniqueUsers.set(s.data.user.id, s.data.user);
        }
      });

      const users = Array.from(uniqueUsers.values());
      socket.emit('room:users', users);
    }
  });

  socket.on('disconnecting', () => {
    if (socket.data.user) {
      // socket.rooms is a Set containing the socket ID and joined rooms
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.to(room).emit('room:user_left', socket.data.user.id);
        }
      }
    }
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
