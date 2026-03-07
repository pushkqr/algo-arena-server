const mongoose = require("mongoose");

const UsernameSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true },
    username: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

UsernameSchema.index({ ownerId: 1 }, { unique: true });

module.exports = mongoose.model("Username", UsernameSchema);
