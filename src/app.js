const cors = require("cors");
const express = require("express");
const strategiesRouter = require("./api/routes/strategies.routes");
const evaluationRouter = require("./api/routes/evaluation.routes");
const resultRouter = require("./api/routes/result.routes");
const leaderboardRouter = require("./api/routes/leaderboard.routes");
const usersRouter = require("./api/routes/users.routes");
const metaRouter = require("./api/routes/meta.routes");
const {
  errorController,
  notFoundController,
} = require("./api/controllers/error.controller");

require("dotenv").config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/strategies", strategiesRouter);
app.use("/api/evaluations", evaluationRouter);
app.use("/api/results", resultRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/users", usersRouter);
app.use("/api/meta", metaRouter);
app.use(errorController);
app.use(notFoundController);

module.exports = app;
