const express = require("express");
const controller = require("../controllers/evaluation.controller");
const {
  attachUserContext,
  requireUser,
  requireServiceUser,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);
router.use(requireUser);
router.use(requireServiceUser);

router.get("/env-options", controller.getEnvironmentOptions);
router.post("/env-options", controller.getEnvironmentOptions);
router.post("/", controller.startEvaluation);
router.get("/", controller.listEvaluations);
router.get("/:evaluationId", controller.getEvaluation);

module.exports = router;
