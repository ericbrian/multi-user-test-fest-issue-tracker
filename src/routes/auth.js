const express = require('express');
const { authLimiter } = require('../rateLimiter');

function registerAuthRoutes(router, deps) {
  const {
    passport,
    TAGS,
    JIRA_BASE_URL,
    ENTRA_REDIRECT_URI,
  } = deps;

  /**
   * @openapi
   * /auth/login:
   *   get:
   *     tags:
   *       - Authentication
   *     summary: Initiate SSO login
   *     description: Redirects to Microsoft Entra ID (Azure AD) for OIDC authentication.
   *     responses:
   *       302:
   *         description: Redirect to OIDC provider
   *       500:
   *         description: OIDC not configured
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   */
  router.get('/auth/login', authLimiter, (req, res, next) => {
    // Test mode: immediately redirect with a dummy session
    if (process.env.NODE_ENV === 'test') {
      // Set a dummy user in session (middleware will create test user later)
      req.session.user = { sub: 'test-user' };
      return res.redirect('/');
    }

    // Normal OIDC flow
    passport.authenticate('oidc', {
      scope: 'openid profile email offline_access',
      redirect_uri: ENTRA_REDIRECT_URI,
    })(req, res, next);
  });

  /**
   * @openapi
   * /auth/callback:
   *   get:
   *     tags:
   *       - Authentication
   *     summary: OIDC callback endpoint
   *     description: Handles the callback from Microsoft Entra ID after authentication. Creates or updates user session.
   *     parameters:
   *       - in: query
   *         name: code
   *         schema:
   *           type: string
   *         description: Authorization code from OIDC provider
   *       - in: query
   *         name: state
   *         schema:
   *           type: string
   *         description: State parameter for CSRF protection
   *     responses:
   *       302:
   *         description: Redirect to home page on success or login page on failure
   */
  router.get('/auth/callback', authLimiter, (req, res, next) => {
    passport.authenticate('oidc', {
      successRedirect: '/',
      failureRedirect: '/?login=failed',
      redirect_uri: ENTRA_REDIRECT_URI,
    })(req, res, next);
  });

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     tags:
   *       - Authentication
   *     summary: Logout current user
   *     description: Destroys the user session and clears authentication cookies.
   *     security:
   *       - cookieAuth: []
   *     responses:
   *       200:
   *         description: Successfully logged out
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   *                   example: true
   */
  router.post('/auth/logout', authLimiter, (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(200).json({ ok: true });
      });
    });
  });

  /**
   * @openapi
   * /me:
   *   get:
   *     tags:
   *       - Authentication
   *     summary: Get current user info
   *     description: Returns the currently authenticated user information along with system configuration (tags and Jira base URL).
   *     responses:
   *       200:
   *         description: Current user information and system config
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 user:
   *                   oneOf:
   *                     - $ref: '#/components/schemas/User'
   *                     - type: 'null'
   *                   description: User object if authenticated, null otherwise
   *                 tags:
   *                   type: array
   *                   items:
   *                     type: string
   *                   description: Available status tags for issues
   *                 jiraBaseUrl:
   *                   type: string
   *                   nullable: true
   *                   description: Base URL for Jira instance
   */
  router.get('/me', (req, res) => {
    res.json({
      user: req.user || null,
      tags: TAGS,
      jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/$/, '') : null,
    });
  });
}

module.exports = registerAuthRoutes;
