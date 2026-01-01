const express = require("express");
const request = require("supertest");
const multer = require("multer");

// Mocks
jest.mock("../../src/prismaClient");
jest.mock("../../src/services/issueService");
jest.mock("../../src/services/jiraService");
jest.mock("../../src/rateLimiter", () => ({
  issueCreationLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  apiLimiter: (req, res, next) => next(),
}));

const { getPrisma } = require("../../src/prismaClient");
const { IssueService } = require("../../src/services/issueService");
const { JiraService } = require("../../src/services/jiraService");
const { createMemoryCache } = require("../../src/cache");

const mockPrisma = {
  roomMember: { findUnique: jest.fn() },
  room: { findUnique: jest.fn() },
  issue: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

// Use real multer parsing for multipart/form-data requests.
// Memory storage avoids writing to disk during tests.
const uploadMock = multer({ storage: multer.memoryStorage() });

let mockIssueServiceInstance;
let mockJiraServiceInstance;

beforeEach(() => {
  jest.clearAllMocks();

  getPrisma.mockReturnValue(mockPrisma);

  mockIssueServiceInstance = {
    getRoomIssues: jest
      .fn()
      .mockResolvedValue([
        {
          id: "issue-1",
          script_id: 1,
          description: "Test issue",
          created_by: "user-1",
        },
      ]),
    createIssue: jest.fn().mockResolvedValue({
      id: "issue-2",
      script_id: 42,
      description: "New test issue",
      is_issue: true,
      created_by: "user-1",
      files: [],
    }),
    updateStatus: jest
      .fn()
      .mockResolvedValue({ id: "issue-1", status: "closed" }),
    updateJiraKey: jest
      .fn()
      .mockResolvedValue({ id: "issue-1", jira_key: "PROJ-1" }),
    deleteIssue: jest.fn().mockResolvedValue(true),
    cleanupFiles: jest.fn(),
    getRoomLeaderboard: jest.fn().mockResolvedValue([
      { user_id: "user-1", name: "Dev", email: "dev@example.com", count: 3 },
      { user_id: "user-2", name: "QA", email: "qa@example.com", count: 1 },
    ]),
  };
  IssueService.mockImplementation(() => mockIssueServiceInstance);

  mockJiraServiceInstance = {
    isConfigured: jest.fn().mockReturnValue(true),
    createIssue: jest.fn().mockResolvedValue("PROJ-1"),
  };
  JiraService.mockImplementation(() => mockJiraServiceInstance);

  // Default to being a member of any room to satisfy requireMembership middleware
  mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: false });
});

const registerIssueRoutes = require("../../src/routes/issues");

describe("Issues API Integration Tests", () => {
  describe("GET /api/rooms/:roomId/issues", () => {
    test("returns issues for a room", async () => {
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();

      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["duplicate", "as-designed"],
        JIRA_BASE_URL: null,
        JIRA_EMAIL: null,
        JIRA_API_TOKEN: null,
        JIRA_PROJECT_KEY: null,
        JIRA_ISSUE_TYPE: null,
      });

      app.use(router);

      const res = await request(app).get("/api/rooms/room-1/issues");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBe("issue-1");
      expect(mockIssueServiceInstance.getRoomIssues).toHaveBeenCalledWith(
        "room-1"
      );
    });

    test("returns 500 on service error", async () => {
      mockIssueServiceInstance.getRoomIssues.mockRejectedValue(
        new Error("Database error")
      );

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).get("/api/rooms/room-1/issues");
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("error", "Failed to fetch issues");
    });

    test("invalidates cached issues after creating an issue", async () => {
      // Arrange: enable caching via in-memory cache
      const cache = createMemoryCache({ defaultTtlSeconds: 3600 });
      jest.spyOn(cache, "del");

      // First GET returns one issue; second GET should return a different issue if cache was invalidated.
      mockIssueServiceInstance.getRoomIssues
        .mockResolvedValueOnce([
          {
            id: "issue-1",
            script_id: 1,
            description: "Cached issue",
            created_by: "user-1",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "issue-99",
            script_id: 2,
            description: "Fresh issue",
            created_by: "user-1",
          },
        ]);

      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["duplicate"],
        cache,
      });
      app.use(router);

      // Act 1: Prime the cache
      const first = await request(app).get("/api/rooms/room-1/issues");
      expect(first.status).toBe(200);
      expect(first.body.map((i) => i.id)).toEqual(["issue-1"]);

      // Act 2: Create an issue (should invalidate room issues + leaderboard caches)
      const created = await request(app)
        .post("/api/rooms/room-1/issues")
        .field("scriptId", "42")
        .field("description", "Test issue description")
        .field("is_issue", "true");
      expect(created.status).toBe(200);

      expect(cache.del).toHaveBeenCalledWith("room:room-1:issues");
      expect(cache.del).toHaveBeenCalledWith("room:room-1:leaderboard");

      // Act 3: GET again should bypass the old cached value
      const second = await request(app).get("/api/rooms/room-1/issues");
      expect(second.status).toBe(200);
      expect(second.body.map((i) => i.id)).toEqual(["issue-99"]);

      // getRoomIssues should have been called twice (cache miss after invalidation)
      expect(mockIssueServiceInstance.getRoomIssues).toHaveBeenCalledTimes(2);
    });
  });

  describe("GET /api/rooms/:roomId/leaderboard", () => {
    test("returns leaderboard entries for a room", async () => {
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });
      app.use(router);

      const res = await request(app).get("/api/rooms/room-1/leaderboard");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0]).toHaveProperty("count");
      expect(mockIssueServiceInstance.getRoomLeaderboard).toHaveBeenCalledWith(
        "room-1"
      );
    });
  });

  describe("POST /api/rooms/:roomId/issues", () => {
    test("creates issue with valid data", async () => {
      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["duplicate"],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/rooms/room-1/issues")
        .field("scriptId", "42")
        .field("description", "Test issue description")
        .field("is_issue", "true");

      if (res.status !== 200)
        console.log("DEBUG ERROR:", JSON.stringify(res.body, null, 2));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "issue-2");
      expect(mockIssueServiceInstance.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: "room-1",
          userId: "user-1",
          scriptId: 42,
          description: "Test issue description",
          isIssue: true,
        })
      );
    });

    test("returns 400 for missing scriptId", async () => {
      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/rooms/room-1/issues")
        .field("description", "Test issue");

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty(
        "error",
        "Script ID is required and must be numeric"
      );
    });

    test("returns 400 for invalid scriptId", async () => {
      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/rooms/room-1/issues")
        .field("scriptId", "not-a-number")
        .field("description", "Test issue");

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty(
        "error",
        "Script ID is required and must be numeric"
      );
    });

    test("returns 400 for missing description", async () => {
      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/rooms/room-1/issues")
        .field("scriptId", "42");

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty(
        "error",
        "Missing required field: description"
      );
    });
  });

  describe("POST /api/issues/:id/status", () => {
    test("updates status for groupier", async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open", "in-progress", "closed"],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/status")
        .send({ status: "closed", roomId: "room-1" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", "issue-1");
      expect(res.body).toHaveProperty("status", "closed");
    });

    test("returns 403 for non-groupier", async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({
        is_groupier: false,
      });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open", "closed"],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/status")
        .send({ status: "closed", roomId: "room-1" });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        "error",
        "You do not have permission to access this resource"
      );
    });

    test("returns 400 for invalid status", async () => {
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open", "closed"],
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/status")
        .send({ status: "invalid-status", roomId: "room-1" });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Invalid status");
    });
  });

  describe("POST /api/issues/:id/jira", () => {
    test("creates jira issue for groupier", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-1",
        jira_key: null,
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      mockPrisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        name: "Room Name",
      });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open"],
        JIRA_BASE_URL: "https://example.atlassian.net",
        JIRA_EMAIL: "jira@example.com",
        JIRA_API_TOKEN: "token",
        JIRA_PROJECT_KEY: "PROJ",
        JIRA_ISSUE_TYPE: "Bug",
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/jira")
        .send({ roomId: "room-1" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("jira_key", "PROJ-1");
    });

    test("creates jira issue for creator", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-1",
        jira_key: null,
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({
        is_groupier: false,
      });
      mockPrisma.room.findUnique.mockResolvedValue({
        id: "room-1",
        name: "Room Name",
      });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open"],
        JIRA_BASE_URL: "https://example.atlassian.net",
        JIRA_EMAIL: "jira@example.com",
        JIRA_API_TOKEN: "token",
        JIRA_PROJECT_KEY: "PROJ",
        JIRA_ISSUE_TYPE: "Bug",
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/jira")
        .send({ roomId: "room-1" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("jira_key", "PROJ-1");
    });

    test("returns 403 for non-creator non-groupier", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-2", // Different user
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({
        is_groupier: false,
      });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open"],
        JIRA_BASE_URL: "https://example.atlassian.net",
        JIRA_EMAIL: "jira@example.com",
        JIRA_API_TOKEN: "token",
        JIRA_PROJECT_KEY: "PROJ",
        JIRA_ISSUE_TYPE: "Bug",
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/jira")
        .send({ roomId: "room-1" });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        "error",
        "Only issue creator or groupiers can perform this action"
      );
    });

    test("returns 404 for non-existent issue", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue(null);

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open"],
        JIRA_BASE_URL: "https://example.atlassian.net",
        JIRA_EMAIL: "jira@example.com",
        JIRA_API_TOKEN: "token",
        JIRA_PROJECT_KEY: "PROJ",
        JIRA_ISSUE_TYPE: "Bug",
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/jira")
        .send({ roomId: "room-1" });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Issue not found");
    });

    test("returns 500 when Jira not configured", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-1",
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });
      mockJiraServiceInstance.isConfigured.mockReturnValue(false);

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open"],
        JIRA_BASE_URL: null,
        JIRA_EMAIL: null,
        JIRA_API_TOKEN: null,
        JIRA_PROJECT_KEY: null,
        JIRA_ISSUE_TYPE: null,
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/jira")
        .send({ roomId: "room-1" });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty(
        "error",
        "Jira integration is not configured"
      );
    });

    test("returns existing jira_key if already linked", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-1",
        jira_key: "EXISTING-123",
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: ["open"],
        JIRA_BASE_URL: "https://example.atlassian.net",
        JIRA_EMAIL: "jira@example.com",
        JIRA_API_TOKEN: "token",
        JIRA_PROJECT_KEY: "PROJ",
        JIRA_ISSUE_TYPE: "Bug",
      });

      app.use(router);

      const res = await request(app)
        .post("/api/issues/issue-1/jira")
        .send({ roomId: "room-1" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("jira_key", "EXISTING-123");
      expect(mockJiraServiceInstance.createIssue).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /api/issues/:id", () => {
    test("deletes issue for creator", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-1",
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({
        is_groupier: false,
      });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete("/api/issues/issue-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(mockIssueServiceInstance.deleteIssue).toHaveBeenCalledWith(
        "issue-1"
      );
    });

    test("deletes issue for groupier", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-2", // Different user
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({ is_groupier: true });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete("/api/issues/issue-1");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
    });

    test("returns 403 for non-creator non-groupier", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue({
        id: "issue-1",
        room_id: "room-1",
        created_by: "user-2",
      });
      mockPrisma.roomMember.findUnique.mockResolvedValue({
        is_groupier: false,
      });

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete("/api/issues/issue-1");

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty(
        "error",
        "Only issue creator or groupiers can perform this action"
      );
    });

    test("returns 404 for non-existent issue", async () => {
      mockPrisma.issue.findUnique.mockResolvedValue(null);

      const registerIssueRoutes = require("../../src/routes/issues");
      const app = express();
      app.use(express.json());

      app.use((req, res, next) => {
        req.user = { id: "user-1", email: "dev@example.com", name: "Dev" };
        next();
      });

      const router = express.Router();
      registerIssueRoutes(router, {
        io: { to: () => ({ emit: jest.fn() }) },
        upload: uploadMock,
        uploadsDir: "/tmp/uploads",
        TAGS: [],
      });

      app.use(router);

      const res = await request(app).delete("/api/issues/issue-1");

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty("error", "Issue not found");
    });
  });
});
