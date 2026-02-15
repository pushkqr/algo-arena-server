const { HTTP_STATUS } = require("../../utils/utils");

const errorController = function (err, req, res, next) {
  console.error(err.stack);
  res.status(err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    error: err.message || "Internal Server Error",
  });
};

const notFoundController = function (req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({ error: "Route not found" });
};

module.exports = {
  errorController,
  notFoundController,
};
