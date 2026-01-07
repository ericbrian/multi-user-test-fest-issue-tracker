# Application-Level AWS Migration Implementation Plan

This document outlines the specific **code changes** required to migrate the Test Fest Issue Tracker to an AWS environment (EKS + RDS + S3).

## 1. Storage Abstraction & S3 Integration

Currently, the app stores images on the local filesystem. To support ephemeral containers (EKS pods), we must move to S3.

### 1.1 Create `src/services/storageService.js`

Create an abstract base or a factory that returns either a `DiskStorageService` or an `S3StorageService`.

- **DiskStorageService**: Wrap current `fs` logic.
- **S3StorageService**: Use `@aws-sdk/client-s3` to upload/delete files.

### 1.2 Implement S3 Streaming Route

Since the S3 bucket will be private (internal app), we should stream the files through the Node service rather than exposing a public URL.

- **Endpoint**: `GET /uploads/:filename`
- **Logic**: If `UPLOADS_BACKEND=s3`, fetch the object from S3 and pipe it to the response.

### 1.3 Refactor `IssueService`

Update `IssueService` to use the `StorageService` interface instead of direct `fs` calls for deleting issues/cleaning up files.

---

## 2. Configuration & Environment Validation

Update `src/config.js` to support AWS-specific settings.

### 2.1 New Environment Variables

- `UPLOADS_BACKEND`: Enum (`local` | `s3`).
- `S3_BUCKET`: Name of the S3 bucket.
- `S3_REGION`: AWS region (e.g., `us-east-1`).
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`: Optional (IRSA is preferred on EKS).
- `REDIS_URL`: For Socket.IO shared adapter.
- `TRUST_PROXY`: `true` | `1` for ALB compatibility.

### 2.2 Flexible Redirect URI

Currently, `ENTRA_REDIRECT_URI` has a hardcoded Heroku default. Update the validator to require this in production or derive it more intelligently.

---

## 3. Real-time Scaling (Socket.IO + Redis)

To allow the app to scale beyond 1 replica in the future:

- **Install**: `npm install socket.io-redis redis`
- **Update `server.js`**:

  ```javascript
  if (process.env.REDIS_URL) {
    const redisAdapter = require("socket.io-redis");
    io.adapter(redisAdapter(process.env.REDIS_URL));
  }
  ```

---

## 4. Production Hardening

### 4.1 ALB Trust Proxy

Ensure Express correctly identifies the client IP through the AWS Load Balancer.

```javascript
app.set("trust proxy", config.TRUST_PROXY || 1);
```

### 4.2 Database Connectivity Health Check

Update `src/routes/index.js` or `server.js` to include a DB ping in the `/health` check.

```javascript
app.get("/health", async (req, res) => {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", database: "disconnected" });
  }
});
```

---

## 5. Implementation Roadmap

### Phase 1: Storage & Config (The "Big One")

- [ ] Install AWS SDK: `npm install @aws-sdk/client-s3`
- [ ] Create `StorageService` abstraction.
- [ ] Update `IssueService` to use `StorageService`.
- [ ] Update `src/config.js` with S3/Redis schemas.

### Phase 2: Production Readiness

- [ ] Implement S3 streaming in `server.js` / routes.
- [ ] Add Redis adapter for Socket.IO.
- [ ] Configure `trust proxy`.

### Phase 3: Verification

- [ ] Run unit tests with S3 mocked.
- [ ] Verify local storage still works (backward compatibility).
- [ ] Verify health check pings DB correctly.
