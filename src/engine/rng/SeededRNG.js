const crypto = require("crypto");
const seedrandom = require("seedrandom");

function create(seed = "") {
  const baseSeed = String(seed);

  function makePrng(seedStr) {
    return seedrandom(String(seedStr));
  }

  const prng = makePrng(baseSeed);

  return {
    random() {
      return prng();
    },

    float() {
      return prng();
    },

    int(min, max) {
      min = Math.floor(min);
      max = Math.floor(max);
      if (max < min) [min, max] = [max, min];
      return Math.floor(prng() * (max - min + 1)) + min;
    },

    choice(array) {
      if (!Array.isArray(array) || array.length === 0) return undefined;
      return array[Math.floor(prng() * array.length)];
    },

    shuffle(array) {
      const out = Array.isArray(array) ? array.slice() : [];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },

    shuffleInPlace(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
      }
      return array;
    },

    sample(array, k = 1) {
      const s = this.shuffle(array);
      return k === 1 ? s[0] : s.slice(0, k);
    },

    derive(suffix) {
      const derivedSeed = crypto
        .createHash("sha256")
        .update(baseSeed + ":" + String(suffix))
        .digest("hex");
      return create(derivedSeed);
    },

    seed: baseSeed,
  };
}

module.exports = { create };
