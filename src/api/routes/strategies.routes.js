const express = require("express");
const controller = require("../controllers/strategies.controller");
const {
  attachUserContext,
  requireUser,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);
router.use(requireUser);

router.get("/", controller.listStrategies);
router.get("/:strategyId", controller.getStrategy);
router.post("/", controller.createStrategy);
router.patch("/:strategyId", controller.updateStrategy);
router.delete("/:strategyId", controller.deleteStrategy);

module.exports = router;
