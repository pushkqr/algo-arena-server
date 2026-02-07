const StrategyContract = require('./Strategy');
const SiLog = require("../../utils/SiLog");

const StrategyValidator = {
    validateShape(candidate) {
        for (const method of Object.keys(StrategyContract)) {
            if (typeof candidate[method] !== 'function') {
                throw new Error(`Strategy is missing ${method}()`);
            }
        }
        return true;
    },
    validateStrategy(name, module) {
        try {
            const validShape = this.validateShape(module)
            return {name, module};
        } catch (error) {
            SiLog.Error(error);
        }
    
    },
    validateObservation(obs){
        const observationShape = {
            'rounds': 'number',
            'yourBid': 'number',
            'winningBid': 'number',
            'payoff': 'number',
            'won': 'boolean'
        }

        for (const method of Object.keys(observationShape)) {
            if (!observation[method] ||  typeof obs[method] !== observationShape[method]) {
                throw new Error(`Observation is missing ${method}()`);
            }
        }
        return true;
    },
    validateConfig(config){
        const configShape = {
            'rounds': 'number',
            'markup': 'number',
            'window': 'number',
            'seed': 'string',
            'poolId': 'string',
            'evaluationId': 'string',
            'agentMetadata': 'object'
        }
        
        for (const method of Object.keys(configShape)) {
            if (!config[method] ||  typeof config[method] !== configShape[method]) {
                throw new Error(`Config is missing ${method}()`);
            }
        }
        return true;
    }
};

module.exports = StrategyValidator;