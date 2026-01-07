/**
 * Unit tests for StorageService (S3 backend)
 */

jest.mock('fs', () => ({
  createReadStream: jest.fn(() => ({ mocked: true })),
  unlink: jest.fn((p, cb) => cb && cb(null)),
}));

const uploadConstructorCalls = [];

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation((opts) => {
    uploadConstructorCalls.push(opts);
    return {
      done: jest.fn().mockResolvedValue(undefined),
    };
  }),
}));

// Avoid AWS SDK doing anything surprising in unit tests.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  DeleteObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

describe('S3StorageService', () => {
  let S3StorageService;
  let crypto;

  beforeEach(() => {
    jest.resetModules();
    uploadConstructorCalls.length = 0;

    // Re-require after resetModules so module-level imports (crypto) are fresh.
    ({ S3StorageService } = require('../../src/services/storageService'));
    crypto = require('crypto');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('generates UUID-based filenames (no originalname leakage)', async () => {
    jest.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111');

    const svc = new S3StorageService({
      bucket: 'test-bucket',
      region: 'us-east-1',
    });

    const file = {
      originalname: 'my family photo.PNG',
      path: '/tmp/upload-1',
      mimetype: 'image/png',
    };

    const storedPath = await svc.uploadFile(file, { roomId: 'room-123' });

    expect(storedPath).toBe('/uploads/room-123/11111111-1111-1111-1111-111111111111.png');
    expect(storedPath).not.toContain('my family photo');

    expect(uploadConstructorCalls).toHaveLength(1);
    expect(uploadConstructorCalls[0].params.Bucket).toBe('test-bucket');
    expect(uploadConstructorCalls[0].params.Key).toBe('uploads/room-123/11111111-1111-1111-1111-111111111111.png');
    expect(uploadConstructorCalls[0].params.ContentType).toBe('image/png');
  });

  test('two uploads do not collide even with same originalname', async () => {
    jest
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
      .mockReturnValueOnce('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

    const svc = new S3StorageService({
      bucket: 'test-bucket',
      region: 'us-east-1',
    });

    const file1 = { originalname: 'image.jpg', path: '/tmp/upload-1', mimetype: 'image/jpeg' };
    const file2 = { originalname: 'image.jpg', path: '/tmp/upload-2', mimetype: 'image/jpeg' };

    const p1 = await svc.uploadFile(file1, { roomId: 'room-xyz' });
    const p2 = await svc.uploadFile(file2, { roomId: 'room-xyz' });

    expect(p1).toBe('/uploads/room-xyz/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg');
    expect(p2).toBe('/uploads/room-xyz/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg');
    expect(p1).not.toBe(p2);

    expect(uploadConstructorCalls).toHaveLength(2);
    expect(uploadConstructorCalls[0].params.Key).toBe('uploads/room-xyz/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg');
    expect(uploadConstructorCalls[1].params.Key).toBe('uploads/room-xyz/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg');
  });
});
