const { createFactory } = require("./Environment");
const { getEnvOptionSpec, listEnvOptionSpecs } = require("./envOptionSpecs");
const {
  validateEnvOptions: validateEnvOptionsWithSpec,
} = require("./envOptionValidator");

const envModules = {
  AuctionHouse: require("./AuctionHouse"),
  TicTacToe: require("./TicTacToe"),
};

function normalizeFactory(mod) {
  if (typeof mod === "function") {
    if (mod.prototype && typeof mod.prototype.step === "function") {
      return createFactory(mod);
    }
    return mod;
  }
  if (mod && typeof mod.factory === "function") return mod.factory;
  throw new Error(
    "Unsupported environment module export; expected factory or class",
  );
}

const registry = {};
for (const [name, mod] of Object.entries(envModules)) {
  try {
    registry[name] = normalizeFactory(mod);
  } catch (err) {
    registry[name] = () => {
      throw err;
    };
  }
}

function getFactory(name) {
  if (!name) return null;
  return registry[name] || null;
}

function listEnvs() {
  return Object.keys(registry);
}

function register(name, factory) {
  registry[name] = normalizeFactory(factory);
}

function validateEnvOptions(envName, envOpts = {}) {
  return validateEnvOptionsWithSpec(envName, envOpts, getEnvOptionSpec);
}

module.exports = {
  getFactory,
  listEnvs,
  register,
  getEnvOptionSpec,
  listEnvOptionSpecs,
  validateEnvOptions,
  _registry: registry,
};
