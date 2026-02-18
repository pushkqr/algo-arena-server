const express = require("express");
const controller = require("../controllers/result.controller");
const {
  attachUserContext,
  requireUser,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);
router.use(requireUser);

router.get("/", controller.listUserResults);
router.get(
  "/evaluations/:evaluationId/results",
  controller.listEvaluationResults,
);
router.get("/:resultId", controller.getResult);

module.exports = router;
