function createNoopCache() {
  return {
    enabled: false,
    async get() { return null; },
    async set() { },
    async del() { },
    async wrap(_key, _ttlSeconds, fn) {
      return fn();
    },
  };
}

function createMemoryCache(options = {}) {
  const {
    defaultTtlSeconds = 10,
    maxEntries = 1000,
  } = options;

  const store = new Map();

  function pruneIfNeeded() {
    if (store.size <= maxEntries) return;
    // Simple FIFO eviction based on insertion order.
    const keys = store.keys();
    const toDelete = Math.max(1, Math.floor(maxEntries * 0.1));
    for (let i = 0; i < toDelete; i++) {
      const k = keys.next().value;
      if (k === undefined) break;
      store.delete(k);
    }
  }

  async function get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs !== null && Date.now() > entry.expiresAtMs) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  async function set(key, value, ttlSeconds = defaultTtlSeconds) {
    const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : defaultTtlSeconds;
    const expiresAtMs = ttl > 0 ? Date.now() + ttl * 1000 : null;
    store.set(key, { value, expiresAtMs });
    pruneIfNeeded();
  }

  async function del(key) {
    store.delete(key);
  }

  async function wrap(key, ttlSeconds, fn) {
    const cached = await get(key);
    if (cached !== null && cached !== undefined) return cached;
    const value = await fn();
    await set(key, value, ttlSeconds);
    return value;
  }

  return { enabled: true, get, set, del, wrap };
}

function createRedisCache(options = {}) {
  const {
    url,
    defaultTtlSeconds = 10,
    keyPrefix = 'cache:',
  } = options;

  if (!url) return createNoopCache();

  // Lazy-load to avoid requiring redis unless used.
  // If the dependency is not installed, fall back to noop.
  let createClient;
  try {
    // eslint-disable-next-line global-require
    ({ createClient } = require('redis'));
  } catch (e) {
    return createNoopCache();
  }

  const client = createClient({ url });
  let connected = false;
  let connecting = null;

  async function ensureConnected() {
    if (connected) return;
    if (!connecting) {
      connecting = client.connect()
        .then(() => {
          connected = true;
        })
        .catch((e) => {
          // Leave cache effectively disabled if Redis is unavailable.
          connecting = null;
          throw e;
        });
    }
    await connecting;
  }

  function k(key) {
    return `${keyPrefix}${key}`;
  }

  async function get(key) {
    try {
      await ensureConnected();
      const raw = await client.get(k(key));
      if (raw === null || raw === undefined) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  async function set(key, value, ttlSeconds = defaultTtlSeconds) {
    try {
      await ensureConnected();
      const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : defaultTtlSeconds;
      const payload = JSON.stringify(value);
      if (ttl > 0) {
        await client.setEx(k(key), ttl, payload);
      } else {
        await client.set(k(key), payload);
      }
    } catch (e) {
      // ignore
    }
  }

  async function del(key) {
    try {
      await ensureConnected();
      await client.del(k(key));
    } catch (e) {
      // ignore
    }
  }

  async function wrap(key, ttlSeconds, fn) {
    const cached = await get(key);
    if (cached !== null && cached !== undefined) return cached;
    const value = await fn();
    await set(key, value, ttlSeconds);
    return value;
  }

  return { enabled: true, get, set, del, wrap };
}

function createCacheFromEnv(options = {}) {
  const { isProduction = false } = options;
  const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL || null;
  const cacheEnabled = String(process.env.CACHE_ENABLED || '').toLowerCase() === 'true';
  const ttlSeconds = Number(process.env.CACHE_TTL_SECONDS || 10);

  if (!cacheEnabled) return createNoopCache();
  if (redisUrl) {
    return createRedisCache({ url: redisUrl, defaultTtlSeconds: ttlSeconds });
  }
  return createMemoryCache({ defaultTtlSeconds: ttlSeconds });
}

module.exports = {
  createNoopCache,
  createMemoryCache,
  createRedisCache,
  createCacheFromEnv,
};
