const admin = require("firebase-admin");

function loadServiceAccount() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    return null;
  }

  try {
    return JSON.parse(rawKey);
  } catch (err) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT_KEY JSON", err);
    return null;
  }
}

function ensureInitialized() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const serviceAccount = loadServiceAccount();
  const options = {};

  if (serviceAccount) {
    options.credential = admin.credential.cert(serviceAccount);
  } else {
    options.credential = admin.credential.applicationDefault();
  }

  admin.initializeApp(options);
  return admin;
}

module.exports = ensureInitialized();
