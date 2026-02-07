const vm = require('vm');
const StrategyValidator = require('./StrategyValidator');
const SiLog = require('../../utils/SiLog');

const StrategyLoader = {
  loadStrategy(submission) {
    const { name, code } = submission;
    const context = {
      module: { exports: {} },
      exports: {},
      console: {
        log: () => {},
        warn: () => {},
        error: () => {},
      },
    };
    vm.createContext(context);

    try {
      vm.runInContext(code, context, { filename: `${name}.js` });
    } catch (err) {
      SiLog.Error(`Strategy loader failed for ${name}: ${err.message}`);
    }

    const strategyModule = context.module.exports || context.exports;
    return StrategyValidator.validateStrategy(name, strategyModule);
  },
};

module.exports = StrategyLoader;