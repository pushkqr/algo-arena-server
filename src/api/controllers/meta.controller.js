const Environments = require("../../engine/environments");

const META_VERSION = "2026-03-03";
const TTL_SECONDS = 300;
const NAME_REGEX = /^[A-Za-z][A-Za-z0-9_-]*$/;

const ENV_LABELS = {
  AuctionHouse: "Auction House",
  TicTacToe: "Tic Tac Toe",
};

function toTitleCaseWords(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveLabel(name) {
  if (ENV_LABELS[name]) {
    return ENV_LABELS[name];
  }

  const spaced = String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();

  return toTitleCaseWords(spaced);
}

function buildEnvironmentItem(name) {
  const spec = Environments.getEnvOptionSpec(name);
  return {
    name,
    label: deriveLabel(name),
    enabled: true,
    supports: {
      strategies: true,
      leaderboard: true,
      evaluations: true,
      sandboxRun: true,
    },
    description:
      spec && typeof spec.description === "string" ? spec.description : "",
  };
}

function buildResponse(environments) {
  return {
    environments,
    version: META_VERSION,
    ttlSeconds: TTL_SECONDS,
  };
}

function listEnvironmentMeta(req, res) {
  const rawName =
    req.query && typeof req.query.name === "string"
      ? req.query.name.trim()
      : "";

  if (rawName && !NAME_REGEX.test(rawName)) {
    return res.status(400).json({
      error: "invalid name",
      details: "name must match ^[A-Za-z][A-Za-z0-9_-]*$",
    });
  }

  const envNames = Environments.listEnvs();

  if (rawName) {
    if (!envNames.includes(rawName)) {
      return res.status(404).json({
        error: "environment not found",
        name: rawName,
      });
    }

    res.set("Cache-Control", `public, max-age=${TTL_SECONDS}`);
    return res.json(buildResponse([buildEnvironmentItem(rawName)]));
  }

  const environments = envNames.map((name) => buildEnvironmentItem(name));
  res.set("Cache-Control", `public, max-age=${TTL_SECONDS}`);
  return res.json(buildResponse(environments));
}

module.exports = {
  listEnvironmentMeta,
};
