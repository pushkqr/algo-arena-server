const seedrandom = require("seedrandom");

function makeSeededRng(seed) {
  const prng = seedrandom(String(seed || ""));
  return () => prng();
}

class BaseEnvironment {
  constructor(seed, opts = {}) {
    this.seed = String(seed || "");
    this.opts = opts;
    this.rng = makeSeededRng(this.seed);
  }
  async reset() {
    throw new Error("reset() must be implemented by subclass");
  }
  async step(actions) {
    throw new Error("step(actions) must be implemented by subclass");
  }
}

function validateEnv(env) {
  if (
    !env ||
    typeof env.reset !== "function" ||
    typeof env.step !== "function"
  ) {
    throw new Error("Environment must implement reset() and step(actions)");
  }
}

function createFactory(EnvClass) {
  return (seed, opts = {}) => new EnvClass(seed, opts);
}

module.exports = {
  makeSeededRng,
  BaseEnvironment,
  validateEnv,
  createFactory,
};
