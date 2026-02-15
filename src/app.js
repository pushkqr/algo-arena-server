const cors = require("cors");
const express = require("express");
const strategiesRouter = require("./api/routes/strategies.routes");
const evaluationRouter = require("./api/routes/evaluation.routes");
const resultRouter = require("./api/routes/result.routes");
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
app.use(errorController);
app.use(notFoundController);

module.exports = app;
