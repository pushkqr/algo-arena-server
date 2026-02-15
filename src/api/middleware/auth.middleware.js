const firebaseAdmin = require("../firebaseAdmin");

function resolveFallbackUser(req) {
  const headerId = req.headers["x-user-id"];
  const queryId = req.query.userId;
  const bodyId = req.body && req.body.userId;
  return headerId || bodyId || queryId || null;
}

async function attachUserContext(req, res, next) {
  req.userId = resolveFallbackUser(req);
  const authorization =
    req.headers.authorization || req.headers.Authorization || "";
  if (authorization.startsWith("Bearer ")) {
    const token = authorization.split(" ")[1];
    try {
      console.log(token);
      const decoded = await firebaseAdmin.auth().verifyIdToken(token);
      req.userId = decoded.uid;
      req.firebaseUser = decoded;
    } catch (err) {
      return res.status(401).json({ error: "invalid Firebase token" });
    }
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: "user authentication required" });
  }
  next();
}

module.exports = { attachUserContext, requireUser };
