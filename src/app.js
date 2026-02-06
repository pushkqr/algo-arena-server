const cors = require("cors");
const express = require("express");

require("dotenv").config();
const app = express();

app.use(cors);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));


module.exports = app;