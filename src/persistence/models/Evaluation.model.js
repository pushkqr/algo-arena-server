const mongoose = require("mongoose");

const EvaluationSchema = new mongoose.Schema(
  {
    evaluationId: { type: String, required: true, unique: true },
    seed: { type: String, default: "" },
    rounds: { type: Number, default: 0 },
    poolSize: { type: Number, default: 0 },
    poolCount: { type: Number, default: 0 },
    episodesPerPool: { type: Number, default: 0 },
    envName: { type: String, default: "" },
    envOpts: { type: Object, default: {} },
    agents: { type: Array, default: [] },
    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "queued",
    },
    startedAt: { type: Date },
    completedAt: { type: Date },
    metrics: { type: Object, default: {} },
    ranking: { type: Array, default: [] },
    error: { type: String, default: "" },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Evaluation", EvaluationSchema);
