function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function validateEnvOptions(envName, envOpts = {}, getSpec) {
  const spec = getSpec(envName);
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
  validateEnvOptions,
};
