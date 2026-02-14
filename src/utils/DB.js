const mongoose = require("mongoose");

const DEFAULT_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/algo-arena";

let currentConnection = null;

async function connect(uri = DEFAULT_URI, opts = {}) {
  console.log(uri);
  if (currentConnection && currentConnection.readyState === 1) {
    return currentConnection;
  }

  currentConnection = await mongoose.connect(uri, {
    ...opts,
    serverSelectionTimeoutMS: 5000,
  });

  return currentConnection;
}

async function disconnect() {
  if (!currentConnection) return;
  await mongoose.disconnect();
  currentConnection = null;
}

function getConnection() {
  if (!mongoose.connection) {
    throw new Error("mongoose connection has not been established yet");
  }
  return mongoose.connection;
}

module.exports = {
  connect,
  disconnect,
  getConnection,
  mongoose,
};
