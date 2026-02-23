const express = require("express");
const controller = require("../controllers/leaderboard.controller");
const {
  attachUserContext,
  requireUser,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);
router.use(requireUser);

router.get("/evaluations", controller.listLeaderboardEvaluations);

module.exports = router;
