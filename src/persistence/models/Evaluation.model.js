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
    userId: { type: String, index: true },
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

EvaluationSchema.index({
  envName: 1,
  status: 1,
  completedAt: -1,
  createdAt: -1,
});

module.exports = mongoose.model("Evaluation", EvaluationSchema);
