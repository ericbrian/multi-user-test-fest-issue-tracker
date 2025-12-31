const client = require('prom-client');

function getRouteLabel(req) {
  // Prefer route template to avoid high-cardinality labels.
  if (req.route && req.route.path) {
    const base = req.baseUrl || '';
    return `${base}${req.route.path}` || req.path || 'unknown';
  }
  return req.path || 'unknown';
}

function createMetrics(options = {}) {
  const {
    appName = 'test_fest_tracker',
    collectDefaultMetrics = true,
    defaultMetricsPrefix = '',
    buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  } = options;

  const registry = new client.Registry();
  registry.setDefaultLabels({ app: appName });
  client.collectDefaultMetrics({ register: registry, prefix: defaultMetricsPrefix, ...(collectDefaultMetrics ? {} : { timeout: 0 }) });

  const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets,
    registers: [registry],
  });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  function metricsMiddleware(req, res, next) {
    // Avoid self-scrape and noisy labels.
    if (req.path === '/metrics') return next();

    const endTimer = httpRequestDurationSeconds.startTimer();
    res.on('finish', () => {
      const labels = {
        method: (req.method || 'GET').toUpperCase(),
        route: getRouteLabel(req),
        status_code: String(res.statusCode || 0),
      };

      httpRequestsTotal.inc(labels);
      endTimer(labels);
    });
    next();
  }

  async function metricsHandler(req, res) {
    res.set('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  }

  return {
    client,
    registry,
    metricsMiddleware,
    metricsHandler,
  };
}

module.exports = {
  createMetrics,
};
