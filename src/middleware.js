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

module.exports = { requireAuth, createDevAutoAuthMiddleware };
