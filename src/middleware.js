const { v4: uuidv4 } = require('uuid');
const { getPrisma } = require("./prismaClient");
const { ApiError } = require("./utils/apiResponse");

function requireAuth(req, res, next) {
  if (!req.user) return ApiError.unauthorized(res);
  next();
}



// Middleware: require user to be a groupier for a given roomId
function requireGroupierByRoom() {
  return async function (req, res, next) {
    try {
      const roomId = (req.body && req.body.roomId) || (req.params && req.params.roomId) || (req.query && req.query.roomId) || null;
      if (!roomId) return ApiError.missingField(res, 'roomId');

      const prisma = getPrisma();
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });

      if (!membership || !membership.is_groupier) return ApiError.forbidden(res);

      req.membership = membership;
      next();
    } catch (e) {
      console.error('requireGroupierByRoom error:', e);
      return ApiError.internal(res, 'Internal server error', e.message);
    }
  };
}

// Middleware: require user to be a member of a given roomId
function requireMembership() {
  return async function (req, res, next) {
    try {
      const roomId = (req.body && req.body.roomId) || (req.params && req.params.roomId) || (req.query && req.query.roomId) || null;
      if (!roomId) return ApiError.missingField(res, 'roomId');

      const prisma = getPrisma();
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });

      if (!membership) return ApiError.forbidden(res, 'You must join this room to access its content');

      req.membership = membership;
      next();
    } catch (e) {
      console.error('requireMembership error:', e);
      return ApiError.internal(res, 'Internal server error', e.message);
    }
  };
}

// Middleware: load issue by :id param and attach issue + membership (if exists)
function requireIssueAndMembership() {
  return async function (req, res, next) {
    try {
      const { id } = req.params;
      if (!id) return ApiError.missingField(res, 'id');

      const prisma = getPrisma();
      const issue = await prisma.issue.findUnique({ where: { id }, include: { createdBy: true, room: true } });

      if (!issue) return ApiError.notFound(res, 'Issue');

      req.issue = issue;
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: issue.room_id, user_id: req.user.id } } });
      req.membership = membership || null;
      next();
    } catch (e) {
      console.error('requireIssueAndMembership error:', e);
      return ApiError.internal(res, 'Internal server error', e.message);
    }
  };
}

// Middleware: require user to be either the creator of the issue or a groupier
// Must be used AFTER requireIssueAndMembership
function requireGroupierOrCreator() {
  return function (req, res, next) {
    if (!req.issue) {
      return ApiError.internal(res, 'Middleware configuration error: requireIssueAndMembership must be used before requireGroupierOrCreator');
    }

    const isGroupier = req.membership && req.membership.is_groupier;
    const isCreator = req.issue.created_by === req.user.id;

    if (!isGroupier && !isCreator) {
      return ApiError.insufficientPermissions(res, 'Only issue creator or groupiers can perform this action');
    }

    next();
  };
}

// Middleware: disable caching
function noCache(req, res, next) {
  // console.log('noCache middleware hit for:', req.originalUrl);
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
}

// Test‑only authentication middleware (DB-backed with in-memory fallback)
// IMPORTANT: Only works when NODE_ENV=test, never in production or development
function createTestAuthMiddleware() {
  return async function testAuth(req, res, next) {
    // Activate only in test mode
    if (process.env.NODE_ENV !== 'test') return next();

    // If a user is already attached (e.g., from a previous request), skip
    if (req.user) return next();

    // Identify the user by their subject ID from the session, defaulting to 'test-user' for testing.
    const sub = (req.session && req.session.user && req.session.user.sub) ? req.session.user.sub : 'test-user';

    try {
      const prisma = getPrisma();
      let user = await prisma.user.findUnique({ where: { sub } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            id: uuidv4(),
            sub,
            name: process.env.TEST_USER_NAME || 'Test User',
            email: process.env.TEST_USER_EMAIL || 'test@example.com',
          },
        });
      }

      // Populate req.user and sync session
      req.user = user;
      if (req.session) req.session.user = user;
      next();
    } catch (e) {
      console.error('testAuth error:', e);
      // Fallback to in-memory only if DB fails (though this may cause FK errors later)
      const mockUser = {
        id: uuidv4(),
        sub,
        name: process.env.TEST_USER_NAME || 'Test User',
        email: process.env.TEST_USER_EMAIL || 'test@example.com',
      };
      req.user = mockUser;
      if (req.session) req.session.user = mockUser;
      next();
    }
  };
}

module.exports = {
  requireAuth,
  requireGroupierByRoom,
  requireMembership,
  requireIssueAndMembership,
  requireGroupierOrCreator,
  noCache,
  createTestAuthMiddleware
};
