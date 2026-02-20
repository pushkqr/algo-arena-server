const EvaluationModel = require("../../persistence/models/Evaluation.model");
const DB = require("../../utils/DB");

async function saveQueuedRecord(record) {
  await DB.connect();
  return EvaluationModel.findOneAndUpdate(
    { evaluationId: record.evaluationId },
    { $set: record },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  );
}

module.exports = {
  saveQueuedRecord,
};
