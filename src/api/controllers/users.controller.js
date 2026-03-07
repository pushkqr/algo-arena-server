const firebaseAdmin = require("../firebaseAdmin");
const DB = require("../../utils/DB");
const UsernameModel = require("../../persistence/models/Username.model");

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const DEFAULT_RESERVED_USERNAMES = [
  "admin",
  "root",
  "support",
  "system",
  "owner",
  "moderator",
  "staff",
  "api",
  "null",
  "undefined",
  "me",
];

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getReservedUsernames() {
  return new Set([
    ...DEFAULT_RESERVED_USERNAMES,
    ...parseCsvEnv(process.env.USERNAME_RESERVED_WORDS),
  ]);
}

function normalizeUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";
  const normalized = username.toLowerCase();
  return { username, normalized };
}

function validateUsername(username, normalized) {
  if (!username) {
    return "username is required";
  }

  if (!USERNAME_REGEX.test(normalized)) {
    return "username must match ^[a-z0-9_]{3,20}$";
  }

  if (getReservedUsernames().has(normalized)) {
    return "username is reserved";
  }

  return null;
}

function isDuplicateKeyError(err) {
  return !!(err && err.code === 11000);
}

function isUsernameTakenByAnotherUid(doc, uid) {
  if (!doc) {
    return false;
  }
  return doc.ownerId && doc.ownerId !== uid;
}

async function checkUsernameAvailability(req, res) {
  try {
    const { username, normalized } = normalizeUsername(req.query.username);
    const validationError = validateUsername(username, normalized);
    if (validationError) {
      return res.status(400).json({
        error: validationError,
        username,
        normalized,
      });
    }

    await DB.connect();
    const usernameDoc = await UsernameModel.findById(normalized)
      .select("_id ownerId")
      .lean();
    const takenByAnother = isUsernameTakenByAnotherUid(usernameDoc, req.userId);

    return res.json({
      username,
      normalized,
      available: !takenByAnother,
      ownedByRequester: !!usernameDoc && !takenByAnother,
    });
  } catch (err) {
    console.error("failed to check username availability", err);
    return res.status(500).json({
      error: "unable to check username availability",
      details: err?.message,
    });
  }
}

async function updateMyUsername(req, res) {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: "user authentication required" });
    }

    const { username, normalized } = normalizeUsername(req.body?.username);
    const validationError = validateUsername(username, normalized);
    if (validationError) {
      return res.status(400).json({
        error: validationError,
        username,
        normalized,
      });
    }

    await DB.connect();

    const ownedDoc = await UsernameModel.findOne({ ownerId: req.userId })
      .select("_id")
      .lean();
    if (ownedDoc && ownedDoc._id !== normalized) {
      await UsernameModel.deleteOne({ _id: ownedDoc._id, ownerId: req.userId });
    }

    try {
      await UsernameModel.findOneAndUpdate(
        { _id: normalized, ownerId: req.userId },
        {
          $set: {
            ownerId: req.userId,
            username,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (writeErr) {
      if (isDuplicateKeyError(writeErr)) {
        return res.status(409).json({
          error: "username_taken",
          username,
          normalized,
        });
      }
      throw writeErr;
    }

    let authProfileUpdated = true;
    try {
      await firebaseAdmin.auth().updateUser(req.userId, {
        displayName: username,
      });
    } catch (syncErr) {
      authProfileUpdated = false;
      console.error("failed to sync Firebase displayName", syncErr);
    }

    return res.json({
      username,
      normalized,
      ownerId: req.userId,
      authProfileUpdated,
    });
  } catch (err) {
    console.error("failed to update username", err);
    return res.status(500).json({
      error: "unable to update username",
      details: err?.message,
    });
  }
}

module.exports = {
  checkUsernameAvailability,
  updateMyUsername,
};
