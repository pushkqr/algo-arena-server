const app = require("./app");
const Logger = require("./utils/SiLog")

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  Logger.Message(`Server running on port ${PORT}`);
});