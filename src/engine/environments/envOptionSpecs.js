const envOptionSpecs = {
  AuctionHouse: {
    envName: "AuctionHouse",
    description:
      "Auction environment with configurable pricing and budget dynamics.",
    params: [
      {
        key: "rounds",
        type: "integer",
        default: 1,
        min: 1,
      },
      {
        key: "auctionType",
        type: "string",
        default: "second",
        enum: ["first", "second"],
      },
      {
        key: "reserve",
        type: "number",
        default: 0,
        min: 0,
      },
      {
        key: "defaultBudget",
        type: "number",
        default: null,
        nullable: true,
        notes: "null means unbounded budget (Infinity).",
      },
      {
        key: "minItemValue",
        type: "number",
        default: 10,
        min: 0,
      },
      {
        key: "maxItemValue",
        type: "number",
        default: 100,
        minExclusiveRef: "minItemValue",
      },
      {
        key: "driftStep",
        type: "number",
        default: 2,
        min: 0,
      },
      {
        key: "budgetDecay",
        type: "number",
        default: 0,
        min: 0,
      },
      {
        key: "maxConsecutiveWins",
        type: "integer",
        default: 3,
        min: 1,
      },
    ],
  },
};

function getEnvOptionSpec(name) {
  if (!name) return null;
  return envOptionSpecs[name] || null;
}

function listEnvOptionSpecs() {
  return Object.values(envOptionSpecs);
}

module.exports = {
  envOptionSpecs,
  getEnvOptionSpec,
  listEnvOptionSpecs,
};
