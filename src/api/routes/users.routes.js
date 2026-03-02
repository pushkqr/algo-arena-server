const express = require("express");
const controller = require("../controllers/users.controller");
const { attachUserContext } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(attachUserContext);

router.get("/username-availability", controller.checkUsernameAvailability);
router.put("/me/username", controller.updateMyUsername);

module.exports = router;
