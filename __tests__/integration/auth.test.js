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
});
