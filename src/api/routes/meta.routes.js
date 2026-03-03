const express = require("express");
const controller = require("../controllers/meta.controller");

const router = express.Router();

router.get("/environment", controller.listEnvironmentMeta);

module.exports = router;
