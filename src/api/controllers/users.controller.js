const firebaseAdmin = require("../firebaseAdmin");

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

function getUsernamesCollectionName() {
  const value = String(process.env.FIRESTORE_USERNAMES_COLLECTION || "").trim();
  return value || "usernames";
}

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

function getFirestore() {
  return firebaseAdmin.firestore();
}

function usernamesCollection(db) {
  return db.collection(getUsernamesCollectionName());
}

function isUsernameTakenByAnotherUid(doc, uid) {
  if (!doc || !doc.exists) {
    return false;
  }
  const data = doc.data() || {};
  return data.uid && data.uid !== uid;
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

    const db = getFirestore();
    const docRef = usernamesCollection(db).doc(normalized);
    const snap = await docRef.get();
    const takenByAnother = isUsernameTakenByAnotherUid(snap, req.userId);

    return res.json({
      username,
      normalized,
      available: !takenByAnother,
      ownedByRequester: !!snap.exists && !takenByAnother,
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
    const { username, normalized } = normalizeUsername(req.body?.username);
    const validationError = validateUsername(username, normalized);
    if (validationError) {
      return res.status(400).json({
        error: validationError,
        username,
        normalized,
      });
    }

    const db = getFirestore();
    const coll = usernamesCollection(db);
    const targetRef = coll.doc(normalized);

    let usernameTaken = false;

    await db.runTransaction(async (tx) => {
      const [targetSnap, ownedSnap] = await Promise.all([
        tx.get(targetRef),
        tx.get(coll.where("uid", "==", req.userId)),
      ]);

      if (isUsernameTakenByAnotherUid(targetSnap, req.userId)) {
        usernameTaken = true;
        return;
      }

      for (const doc of ownedSnap.docs || []) {
        if (doc.id !== normalized) {
          tx.delete(doc.ref);
        }
      }

      tx.set(
        targetRef,
        {
          uid: req.userId,
          username,
          updatedAt: new Date(),
        },
        { merge: true },
      );
    });

    if (usernameTaken) {
      return res.status(409).json({
        error: "username_taken",
        username,
        normalized,
      });
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
