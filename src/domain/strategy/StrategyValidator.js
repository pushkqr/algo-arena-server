const StrategyContract = require("./Strategy");
const { validateShape } = require("../../utils/utils");

const StrategyValidator = {
  validateStrategy(name, module) {
    try {
      validateShape(
        module,
        StrategyContract,
        "Strategy is missing ${method}()",
      );
      return { name, module };
    } catch (error) {
      throw error;
    }
  },
  validateObservation(obs) {
    const observationShape = {
      rounds: "number",
      yourBid: "number",
      winningBid: "number",
      payoff: "number",
      won: "boolean",
    };

    validateShape(
      obs,
      observationShape,
      "Observation is missing or wrong type for '${method}'",
    );
    return true;
  },
  validateConfig(config) {
    const configShape = {
      rounds: "number",
      markup: "number",
      window: "number",
      seed: "string",
      poolId: "string",
      evaluationId: "string",
      agentMetadata: "object",
    };

    validateShape(
      config,
      configShape,
      "Config is missing or wrong type for '${method}'",
    );
    return true;
  },
};

module.exports = StrategyValidator;
