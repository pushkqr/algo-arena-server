const validateShape = function (candidate, contract, errorTemplate) {
  const fail = (key) => {
    throw new Error(
      (errorTemplate || `Invalid shape for ${key}`).replace(
        /\$\{method\}/g,
        key,
      ),
    );
  };

  for (const key of Object.keys(contract)) {
    const expected = contract[key];
    const val = candidate ? candidate[key] : undefined;

    if (expected === "function") {
      if (typeof val !== "function") fail(key);
    } else if (expected === "array") {
      if (!Array.isArray(val)) fail(key);
    } else if (expected === "object") {
      if (typeof val !== "object" || val === null || Array.isArray(val))
        fail(key);
    } else {
      if (typeof val !== expected) fail(key);
    }
  }
  return true;
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

module.exports = { validateShape, HTTP_STATUS };
