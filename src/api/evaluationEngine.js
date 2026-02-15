const { createEngine } = require("../engine/engine");

const engine = createEngine({
  maxConcurrent: Number(process.env.EVAL_MAX_CONCURRENT) || 2,
});

engine.on("error", (evaluationId, err) => {
  console.error("evaluation engine error", evaluationId, err);
});

module.exports = engine;
