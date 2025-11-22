const { v4: uuidv4 } = require("uuid");
const { getPrisma } = require("./prismaClient");

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
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
      if (!roomId) return res.status(400).json({ error: 'roomId is required' });
      const prisma = getPrisma();
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: roomId, user_id: req.user.id } } });
      if (!membership || !membership.is_groupier) return res.status(403).json({ error: 'Forbidden' });
      req.membership = membership;
      next();
    } catch (e) {
      console.error('requireGroupierByRoom error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// Middleware: load issue by :id param and attach issue + membership (if exists)
function requireIssueAndMembership() {
  return async function (req, res, next) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Issue id is required' });
      const prisma = getPrisma();
      const issue = await prisma.issue.findUnique({ where: { id }, include: { createdBy: true } });
      if (!issue) return res.status(404).json({ error: 'Issue not found' });
      req.issue = issue;
      const membership = await prisma.roomMember.findUnique({ where: { room_id_user_id: { room_id: issue.room_id, user_id: req.user.id } } });
      req.membership = membership || null;
      next();
    } catch (e) {
      console.error('requireIssueAndMembership error:', e);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = { requireAuth, createDevAutoAuthMiddleware, requireGroupierByRoom, requireIssueAndMembership };
