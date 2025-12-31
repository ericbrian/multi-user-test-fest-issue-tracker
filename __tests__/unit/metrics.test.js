const express = require('express');
const request = require('supertest');
const { createMetrics } = require('../../src/metrics');

describe('Metrics', () => {
  test('GET /metrics returns Prometheus metrics', async () => {
    const app = express();
    const metrics = createMetrics({ appName: 'test_fest_tracker_test' });
    app.use(metrics.metricsMiddleware);
    app.get('/metrics', metrics.metricsHandler);

    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('http_request_duration_seconds');
  });

  test('GET /metrics requires bearer token when configured', async () => {
    const originalToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = 'secret-token';

    const app = express();
    const metrics = createMetrics({ appName: 'test_fest_tracker_test' });
    app.use(metrics.metricsMiddleware);

    app.get(
      '/metrics',
      (req, res, next) => {
        const token = process.env.METRICS_TOKEN;
        const auth = String(req.headers.authorization || '');
        if (auth === `Bearer ${token}`) return next();
        return res.status(401).json({ error: 'Unauthorized' });
      },
      metrics.metricsHandler
    );

    const res1 = await request(app).get('/metrics');
    expect(res1.status).toBe(401);

    const res2 = await request(app).get('/metrics').set('Authorization', 'Bearer secret-token');
    expect(res2.status).toBe(200);

    if (originalToken === undefined) {
      delete process.env.METRICS_TOKEN;
    } else {
      process.env.METRICS_TOKEN = originalToken;
    }
  });
});
