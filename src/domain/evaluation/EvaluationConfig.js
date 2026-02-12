const EvaluationContract = {
  evaluationId: "string",
  seed: "string",
  rounds: "number",
  poolSize: "number",
  episodesPerPool: "number",
  agents: "array",
  shuffle: "boolean",
  envName: "string",
};

const PoolContract = {
  evaluationId: "string",
  seed: "string",
  poolSize: "number",
  agents: "array",
};

module.exports = { EvaluationContract, PoolContract };
