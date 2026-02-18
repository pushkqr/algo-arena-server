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
router.get("/item/:resultId", controller.getResultItem);
router.get("/:evaluationId", controller.listEvaluationResults);

module.exports = router;
