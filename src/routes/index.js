const path = require('path');
const registerAuthRoutes = require('./auth');
const registerRoomRoutes = require('./rooms');
const registerIssueRoutes = require('./issues');

function registerRoutes(app, deps) {
  /**
   * @openapi
   * /health:
   *   get:
   *     tags:
   *       - System
   *     summary: Health check endpoint
   *     description: Returns the health status of the application. Used by container orchestration systems for liveness/readiness probes.
   *     responses:
   *       200:
   *         description: Application is healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: ok
   */
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Register sub-modules
  registerAuthRoutes(app, deps);
  registerRoomRoutes(app, deps);
  registerIssueRoutes(app, deps);

  // HTML entry
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  });

  // Room-specific URLs
  app.get('/fest/:roomId', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
  });

  // Global error handling middleware
  app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);

    // Handle Multer file upload errors
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        details: 'Maximum file size is 5MB per file'
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        details: 'Maximum 5 files per upload'
      });
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file field',
        details: 'Please use the correct file upload field name'
      });
    }

    // Handle custom multer fileFilter errors
    if (error.message && (
      error.message.includes('Invalid file type') ||
      error.message.includes('Invalid file extension')
    )) {
      return res.status(400).json({
        error: 'Invalid file',
        details: error.message
      });
    }

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
