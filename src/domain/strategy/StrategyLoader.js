const vm = require("vm");
const StrategyValidator = require("./StrategyValidator");
const SiLog = require("../../utils/SiLog");

function normalizeStrategyCode(code = "") {
  let normalized = String(code || "")
    .replace(/^\uFEFF/, "")
    .trim();

  if (/^\s*import\s+/m.test(normalized)) {
    return {
      code: normalized,
      error:
        "Unsupported syntax: import statements are not supported in strategy source. Use inline code with export default or module.exports.",
    };
  }

  if (/export\s+default/.test(normalized)) {
    normalized = normalized.replace(
      /export\s+default\s+/g,
      "module.exports = ",
    );
  }

  if (/^\s*export\s+(?!default)/m.test(normalized)) {
    return {
      code: normalized,
      error:
        "Unsupported syntax: named exports are not supported in strategy source. Use a single default export.",
    };
  }

  return { code: normalized, error: null };
}

function resolveStrategyModule(context) {
  const moduleExports =
    context && context.module ? context.module.exports : null;
  const exportsObject = context ? context.exports : null;

  if (moduleExports && typeof moduleExports === "object") {
    if (moduleExports.__esModule && moduleExports.default) {
      return moduleExports.default;
    }
    if (Object.keys(moduleExports).length > 0) {
      return moduleExports;
    }
  } else if (moduleExports) {
    return moduleExports;
  }

  if (exportsObject && typeof exportsObject === "object") {
    if (exportsObject.default) return exportsObject.default;
    if (Object.keys(exportsObject).length > 0) return exportsObject;
  }

  return moduleExports || exportsObject;
}

const StrategyLoader = {
  loadStrategy(submission) {
    const { name, code } = submission;
    const context = {
      module: { exports: {} },
      exports: {},
      console: { log: () => {}, warn: () => {}, error: () => {} },
    };
    vm.createContext(context);

    const { code: normalizedCode, error: normalizeError } =
      normalizeStrategyCode(code);
    if (normalizeError) {
      return { name, error: new Error(normalizeError) };
    }

    try {
      vm.runInContext(normalizedCode, context, { filename: `${name}.js` });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const esmHint =
        /Cannot use import statement|Unexpected token 'export'|Unexpected token 'import'/.test(
          message,
        )
          ? " ESM syntax is only partially supported. Use `export default {...}` or CommonJS `module.exports = {...}` without `import` statements."
          : "";
      return {
        name,
        error: new Error(`Syntax/runtime error: ${message}.${esmHint}`),
      };
    }

    const strategyModule = resolveStrategyModule(context);

    try {
      const validated = StrategyValidator.validateStrategy(
        name,
        strategyModule,
      );
      return { name, module: validated.module || validated };
    } catch (err) {
      return { name, error: err };
    }
  },
};

module.exports = StrategyLoader;
