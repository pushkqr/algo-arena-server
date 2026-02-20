const firebaseAdmin = require("../firebaseAdmin");

function isFallbackAuthEnabled() {
  const value = String(process.env.AUTH_ALLOW_FALLBACK_USER || "").trim();
  return value === "1" || value.toLowerCase() === "true";
}

function resolveFallbackUser(req) {
  const headerId = req.headers["x-user-id"];
  const queryId = req.query.userId;
  const bodyId = req.body && req.body.userId;
  return headerId || bodyId || queryId || null;
}

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isServiceUser(req) {
  const decoded = req.firebaseUser || {};

  if (decoded.service === true || decoded.isService === true) {
    return true;
  }

  const allowedIds = parseCsvEnv(
    process.env.SERVICE_USER_IDS || process.env.SERVICE_USER_ID,
  );
  if (allowedIds.length && req.userId && allowedIds.includes(req.userId)) {
    return true;
  }

  const allowedEmails = parseCsvEnv(process.env.SERVICE_USER_EMAILS);
  const email =
    decoded && typeof decoded.email === "string" ? decoded.email : "";
  if (allowedEmails.length && email && allowedEmails.includes(email)) {
    return true;
  }

  return false;
}

async function attachUserContext(req, res, next) {
  req.userId = null;
  const authorization =
    req.headers.authorization || req.headers.Authorization || "";
  if (authorization.startsWith("Bearer ")) {
    const token = authorization.split(" ")[1];
    try {
      const decoded = await firebaseAdmin.auth().verifyIdToken(token);
      req.userId = decoded.uid;
      req.firebaseUser = decoded;
    } catch (err) {
      return res.status(401).json({ error: "invalid Firebase token" });
    }
  } else if (isFallbackAuthEnabled()) {
    req.userId = resolveFallbackUser(req);
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: "user authentication required" });
  }
  next();
}

function requireServiceUser(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: "user authentication required" });
  }
  if (!isServiceUser(req)) {
    return res.status(403).json({ error: "service user required" });
  }
  next();
}

module.exports = { attachUserContext, requireUser, requireServiceUser };
