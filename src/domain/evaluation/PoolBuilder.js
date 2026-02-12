const crypto = require("crypto");
const seedrandom = require("seedrandom");

const PoolShape = {
  poolId: "string",
  agents: "array",
  seed: "number",
};

const PoolBuilder = {
  hashToInt(str) {
    const buf = crypto.createHash("sha256").update(String(str)).digest();
    return buf.readUInt32BE(0);
  },
  shuffle(arr, rng) {
    const rng = seedrandom(String(seedStr));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
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
  rngFor(key) {
    return seedrandom(String(key));
  },
  deriveSeed(evaluationId, seed, suffix) {},
  buildPools(config) {},
};
