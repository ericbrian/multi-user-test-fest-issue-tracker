const express = require('express');
const request = require('supertest');

const registerAuthRoutes = require('../../src/routes/auth');

describe('Authentication Endpoints', () => {
  describe('GET /me', () => {
    test('returns user info when authenticated', async () => {
      const app = express();

      app.use((req, res, next) => {
        req.user = { id: 'user-1', email: 'dev@example.com', name: 'Dev' };
        next();
      });

      registerAuthRoutes(app, {
        passport: {
          authenticate: () => (req, res, next) => next(),
        },
        TAGS: ['duplicate', 'as-designed'],
        JIRA_BASE_URL: 'https://example.atlassian.net/',
      });

      const res = await request(app).get('/me');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: { id: 'user-1', email: 'dev@example.com', name: 'Dev' },
        tags: ['duplicate', 'as-designed'],
        jiraBaseUrl: 'https://example.atlassian.net',
      });
    });

    test('returns null user when not authenticated', async () => {
      const app = express();

      registerAuthRoutes(app, {
        passport: {
          authenticate: () => (req, res, next) => next(),
        },
        TAGS: [],
        JIRA_BASE_URL: null,
      });

      const res = await request(app).get('/me');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        user: null,
        tags: [],
        jiraBaseUrl: null,
      });
    });
  });

  describe('Login/Logout', () => {
    test('GET /auth/login returns 302 in test mode', async () => {
      const app = express();
      app.use(require('express-session')({ secret: 's', resave: false, saveUninitialized: false }));
      registerAuthRoutes(app, {
        passport: { authenticate: () => (req, res, next) => next() },
        TAGS: []
      });
      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/');
    });

    test('GET /auth/callback triggers passport authenticate and redirects', async () => {
      const authSpy = jest.fn((req, res, next) => {
        res.redirect('/');
      });
      const app = express();
      registerAuthRoutes(app, {
        passport: { authenticate: () => authSpy },
        TAGS: []
      });
      const res = await request(app).get('/auth/callback');
      expect(authSpy).toHaveBeenCalled();
      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/');
    });

    test('POST /auth/logout clears session and redirects', async () => {
      const logoutMock = jest.fn((cb) => cb());
      const app = express();
      app.use((req, res, next) => {
        req.logout = logoutMock;
        req.session = { destroy: (cb) => cb() };
        next();
      });
      registerAuthRoutes(app, { TAGS: [] });
      const res = await request(app).post('/auth/logout');
      expect(logoutMock).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
