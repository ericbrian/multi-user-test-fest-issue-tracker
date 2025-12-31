jest.mock('redis', () => {
  const store = new Map();
  return {
    createClient: () => ({
      connect: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(async (key) => {
        return store.has(key) ? store.get(key) : null;
      }),
      setEx: jest.fn(async (key, _ttl, value) => {
        store.set(key, value);
      }),
      set: jest.fn(async (key, value) => {
        store.set(key, value);
      }),
      del: jest.fn(async (key) => {
        store.delete(key);
      }),
    }),
  };
});

const { createMemoryCache, createRedisCache } = require('../../src/cache');

describe('Cache', () => {
  test('memory cache: set/get/del', async () => {
    const cache = createMemoryCache({ defaultTtlSeconds: 60 });
    await cache.set('a', { ok: true });
    expect(await cache.get('a')).toEqual({ ok: true });
    await cache.del('a');
    expect(await cache.get('a')).toBeNull();
  });

  test('memory cache: wrap caches results', async () => {
    const cache = createMemoryCache({ defaultTtlSeconds: 60 });
    const fn = jest.fn(async () => 123);
    expect(await cache.wrap('k', 60, fn)).toBe(123);
    expect(await cache.wrap('k', 60, fn)).toBe(123);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('redis cache: set/get/del (mocked)', async () => {
    const cache = createRedisCache({ url: 'redis://localhost:6379', defaultTtlSeconds: 60, keyPrefix: 't:' });
    await cache.set('x', { hello: 'world' }, 60);
    expect(await cache.get('x')).toEqual({ hello: 'world' });
    await cache.del('x');
    expect(await cache.get('x')).toBeNull();
  });
});
