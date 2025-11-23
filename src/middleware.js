const { v4: uuidv4 } = require("uuid");
const { getPrisma } = require("./prismaClient");
const { ApiError } = require("./utils/apiResponse");

function requireAuth(req, res, next) {
  if (!req.user) return ApiError.unauthorized(res);
  next();
}

function createDevAutoAuthMiddleware({
  DISABLE_SSO,
  DEV_USER_EMAIL,
  DEV_USER_NAME,
}) {
  return async function devAutoAuth(req, res, next) {
    if (!DISABLE_SSO) return next();
    if (req.user) return next();
    try {
      const sub = "dev-user";
      const prisma = getPrisma();
      let user = await prisma.user.findUnique({ where: { sub } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            id: uuidv4(),
            sub,
            name: DEV_USER_NAME,
            email: DEV_USER_EMAIL,
          },
        });
      }
      req.user = user;
    } catch (e) {
      console.error("Dev auto-auth error:", e);
    }
    next();
  };
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

// Middleware: load issue by :id param and attach issue + membership (if exists)
function requireIssueAndMembership() {
  return async function (req, res, next) {
    try {
      const { id } = req.params;
      if (!id) return ApiError.missingField(res, 'id');

      const prisma = getPrisma();
      const issue = await prisma.issue.findUnique({ where: { id }, include: { createdBy: true } });

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

module.exports = {
  requireAuth,
  createDevAutoAuthMiddleware,
  requireGroupierByRoom,
  requireIssueAndMembership,
  requireGroupierOrCreator
};
