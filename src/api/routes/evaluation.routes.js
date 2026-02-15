const express = require("express");
const controller = require("../controllers/evaluation.controller");
const {
  attachUserContext,
  requireUser,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);
router.use(requireUser);

router.post("/", controller.startEvaluation);
router.get("/", controller.listEvaluations);
router.get("/:evaluationId", controller.getEvaluation);

module.exports = router;
