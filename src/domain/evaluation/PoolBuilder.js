const { validateShape } = require("../../utils/utils");
const { PoolContract } = require("./EvaluationConfig");
const { create: createRng } = require("../../engine/rng/SeededRNG");

const PoolBuilder = {
  chunk(array, size) {
    const out = [];
    for (let i = 0; i < array.length; i += size)
      out.push(array.slice(i, i + size));
    return out;
  },

  replicateAgents(agents, totalSlots) {
    const rep = Math.ceil(totalSlots / agents.length);
    const out = [];
    for (let r = 0; r < rep; r++) out.push(...agents.map((a) => ({ ...a })));
    return out.slice(0, totalSlots);
  },

  shuffle(arr, seedStr) {
    const rng = createRng(String(seedStr));
    return rng.shuffleInPlace(arr);
  },

  rngFor(seedStr) {
    return createRng(String(seedStr));
  },

  deriveSeed(evaluationId, seed, suffix) {
    return createRng(`${evaluationId}:${seed}`).derive(String(suffix)).seed;
  },

  buildPools(config) {
    validateShape(config, PoolContract);

    if (!Array.isArray(config.agents) || config.agents.length === 0) {
      throw new Error("config.agents must be a non-empty array");
    }

    const poolSize = Number(config.poolSize);
    if (!Number.isInteger(poolSize) || poolSize <= 0) {
      throw new Error("config.poolSize invalid.");
    }

    const poolCount = config.poolCount
      ? Number(config.poolCount)
      : Math.ceil(config.agents.length / poolSize);
    const totalSlots = poolCount * poolSize;

    const evaluationId = String(config.evaluationId);
    const seedStr = String(config.seed);

    let flat = this.replicateAgents(config.agents, totalSlots);

    if (config.shuffle !== false) {
      this.shuffle(flat, `${evaluationId}:${seedStr}:shuffle`);
    }

    const groups = this.chunk(flat, poolSize);

    const pools = groups.map((agentsChunk, idx) => {
      const poolSeed = this.deriveSeed(evaluationId, seedStr, `pool:${idx}`);
      return {
        poolId: `${evaluationId}:pool:${idx}`,
        agents: agentsChunk,
        seed: poolSeed,
      };
    });

    return pools;
  },
};

module.exports = PoolBuilder;
