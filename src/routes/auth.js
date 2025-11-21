const express = require('express');
const { authLimiter } = require('../rateLimiter');

function registerAuthRoutes(router, deps) {
  const {
    DISABLE_SSO,
    passport,
    TAGS,
    JIRA_BASE_URL,
  } = deps;

  // Auth routes (with rate limiting)
  router.get('/auth/login', authLimiter, async (req, res, next) => {
    if (DISABLE_SSO) return res.redirect('/');
    if (!passport || !passport._strategies || !passport._strategies['oidc']) return res.status(500).send('OIDC not configured');
    passport.authenticate('oidc')(req, res, next);
  });

  router.get('/auth/callback', authLimiter, (req, res, next) => {
    passport.authenticate('oidc', {
      successRedirect: '/',
      failureRedirect: '/?login=failed',
    })(req, res, next);
  });

  router.post('/auth/logout', authLimiter, (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(200).json({ ok: true });
      });
    });
  });

  router.get('/me', (req, res) => {
    res.json({
      user: req.user || null,
      tags: TAGS,
      jiraBaseUrl: JIRA_BASE_URL ? JIRA_BASE_URL.replace(/\/$/, '') : null,
    });
  });
}

module.exports = registerAuthRoutes;
