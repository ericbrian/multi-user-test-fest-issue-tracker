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
