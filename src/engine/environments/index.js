const { createFactory } = require("./Environment");

const envModules = {
  AuctionHouse: require("./AuctionHouse"),
};

const envOptionSpecs = {
  AuctionHouse: {
    envName: "AuctionHouse",
    description:
      "Auction environment with configurable pricing and budget dynamics.",
    params: [
      {
        key: "rounds",
        type: "integer",
        default: 1,
        min: 1,
      },
      {
        key: "auctionType",
        type: "string",
        default: "second",
        enum: ["first", "second"],
      },
      {
        key: "reserve",
        type: "number",
        default: 0,
        min: 0,
      },
      {
        key: "defaultBudget",
        type: "number",
        default: null,
        nullable: true,
        notes: "null means unbounded budget (Infinity).",
      },
      {
        key: "minItemValue",
        type: "number",
        default: 10,
        min: 0,
      },
      {
        key: "maxItemValue",
        type: "number",
        default: 100,
        minExclusiveRef: "minItemValue",
      },
      {
        key: "driftStep",
        type: "number",
        default: 2,
        min: 0,
      },
      {
        key: "budgetDecay",
        type: "number",
        default: 0,
        min: 0,
      },
      {
        key: "maxConsecutiveWins",
        type: "integer",
        default: 3,
        min: 1,
      },
    ],
  },
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

function getEnvOptionSpec(name) {
  if (!name) return null;
  return envOptionSpecs[name] || null;
}

function listEnvOptionSpecs() {
  return Object.values(envOptionSpecs);
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateEnvOptions(envName, envOpts = {}) {
  const spec = getEnvOptionSpec(envName);
  if (!spec) {
    return {
      valid: false,
      errors: [`Unsupported environment '${envName}'`],
    };
  }

  if (!envOpts || typeof envOpts !== "object" || Array.isArray(envOpts)) {
    return {
      valid: false,
      errors: ["envOpts must be an object"],
    };
  }

  const params = Array.isArray(spec.params) ? spec.params : [];
  const paramByKey = new Map(params.map((param) => [param.key, param]));
  const allowedKeys = new Set(params.map((param) => param.key));
  const errors = [];

  for (const key of Object.keys(envOpts)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unknown envOpts key '${key}' for environment '${envName}'`);
    }
  }

  for (const param of params) {
    const key = param.key;
    const value = envOpts[key];
    if (value === undefined) continue;

    if (value === null) {
      if (!param.nullable) {
        errors.push(`envOpts.${key} cannot be null`);
      }
      continue;
    }

    if (param.type === "integer") {
      if (!Number.isInteger(Number(value))) {
        errors.push(`envOpts.${key} must be an integer`);
        continue;
      }
    } else if (param.type === "number") {
      if (!isFiniteNumber(value)) {
        errors.push(`envOpts.${key} must be a finite number`);
        continue;
      }
    } else if (param.type === "string") {
      if (typeof value !== "string") {
        errors.push(`envOpts.${key} must be a string`);
        continue;
      }
    } else if (param.type === "boolean") {
      if (typeof value !== "boolean") {
        errors.push(`envOpts.${key} must be a boolean`);
        continue;
      }
    }

    if (Array.isArray(param.enum) && !param.enum.includes(value)) {
      errors.push(`envOpts.${key} must be one of: ${param.enum.join(", ")}`);
    }

    if (param.min !== undefined && isFiniteNumber(value)) {
      if (Number(value) < Number(param.min)) {
        errors.push(`envOpts.${key} must be >= ${param.min}`);
      }
    }

    if (param.max !== undefined && isFiniteNumber(value)) {
      if (Number(value) > Number(param.max)) {
        errors.push(`envOpts.${key} must be <= ${param.max}`);
      }
    }

    if (param.minExclusiveRef) {
      const refKey = param.minExclusiveRef;
      const refParam = paramByKey.get(refKey);
      const refValue =
        envOpts[refKey] !== undefined
          ? envOpts[refKey]
          : refParam
            ? refParam.default
            : undefined;

      if (isFiniteNumber(value) && isFiniteNumber(refValue)) {
        if (Number(value) <= Number(refValue)) {
          errors.push(`envOpts.${key} must be > envOpts.${refKey}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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
