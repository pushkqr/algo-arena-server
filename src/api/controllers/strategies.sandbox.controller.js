const Environments = require("../../engine/environments");
const {
  buildRunId,
  validateSandboxBody,
  resolveSandboxConfig,
  verifyStrategySource,
} = require("./strategies.sandbox.validation");
const { runSandboxEpisodeWithLimits } = require("./strategies.sandbox.runner");

async function runSandboxStrategy(req, res) {
  const startedAtMs = Date.now();
  const runId = buildRunId();

  try {
    validateSandboxBody(req.body || {});
    const config = resolveSandboxConfig(req.body || {}, runId);

    const envFactory = Environments.getFactory(config.envName);
    if (!envFactory) {
      return res.status(400).json({
        ok: false,
        error: "INVALID_REQUEST",
        message: "Unsupported envName",
        details: {
          envName: config.envName,
          availableEnvironments: Environments.listEnvs(),
        },
      });
    }

    const verification = verifyStrategySource(runId, config.source);
    if (!verification.ok) {
      return res.status(422).json({
        ok: false,
        error: "VERIFICATION_FAILED",
        message: "Strategy verification failed",
        verification: {
          ok: false,
          errors: verification.errors,
          warnings: verification.warnings,
        },
      });
    }

    const episodeResults = [];
    const combinedTrace = [];

    try {
      for (
        let episodeIndex = 0;
        episodeIndex < config.episodes;
        episodeIndex += 1
      ) {
        const episodeSeed = `${config.seed}:episode:${episodeIndex}`;
        const episodeResult = await runSandboxEpisodeWithLimits({
          strategy: verification.module,
          envFactory,
          envName: config.envName,
          seed: episodeSeed,
          maxSteps: config.maxSteps,
          traceMode: config.traceMode,
          episodeIndex,
        });

        episodeResults.push(episodeResult);
        if (config.traceMode !== "none" && Array.isArray(episodeResult.trace)) {
          for (const traceEntry of episodeResult.trace) {
            combinedTrace.push({
              episodeIndex,
              ...traceEntry,
            });
          }
        }
      }
    } catch (err) {
      if (err && err.code === "RUN_TIMEOUT") {
        return res.status(504).json({
          ok: false,
          error: "RUN_TIMEOUT",
          message: "Sandbox run exceeded time limit",
          runId,
        });
      }
      if (err && err.code === "RUN_MEMORY_LIMIT") {
        return res.status(500).json({
          ok: false,
          error: "RUN_FAILED",
          message: "Sandbox run exceeded memory limit",
          runId,
        });
      }
      throw err;
    }

    const response = {
      ok: true,
      runId,
      envName: config.envName,
      verification: {
        ok: true,
        errors: [],
        warnings: verification.warnings,
      },
      config: {
        seed: config.seed,
        episodes: config.episodes,
        maxSteps: config.maxSteps,
        traceMode: config.traceMode,
      },
      summary: {
        status: "completed",
        durationMs: Date.now() - startedAtMs,
        episodesCompleted: episodeResults.length,
        episodesFailed: 0,
      },
      episodes: episodeResults.map((episodeResult) => ({
        episodeIndex: episodeResult.episodeIndex,
        status: episodeResult.status,
        steps: episodeResult.steps,
        metrics: episodeResult.metrics,
        lastAction: episodeResult.lastAction,
      })),
    };

    if (config.traceMode !== "none") {
      response.trace = combinedTrace;
    }

    return res.status(200).json(response);
  } catch (err) {
    if (err && err.api) {
      return res.status(err.status || 400).json(err.api);
    }

    console.error("sandbox run failed", err);
    return res.status(500).json({
      ok: false,
      error: "RUN_FAILED",
      message: "Unhandled strategy runtime error",
      runId,
    });
  }
}

module.exports = {
  runSandboxStrategy,
};
