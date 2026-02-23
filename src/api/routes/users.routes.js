const express = require("express");
const controller = require("../controllers/users.controller");
const {
  attachUserContext,
  requireUser,
} = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);
router.use(requireUser);

router.get("/username-availability", controller.checkUsernameAvailability);
router.put("/me/username", controller.updateMyUsername);

module.exports = router;
