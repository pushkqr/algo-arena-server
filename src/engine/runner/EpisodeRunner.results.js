function buildAgentResults(runnerAgents, observations = {}, info = {}) {
  const finalObservations = observations || {};
  const finalInfo = info || {};

  return runnerAgents.map((agent) => {
    const spent =
      finalInfo &&
      finalInfo.spent &&
      Number.isFinite(Number(finalInfo.spent[agent.id]))
        ? Number(finalInfo.spent[agent.id])
        : finalObservations[agent.id] &&
            Number.isFinite(Number(finalObservations[agent.id].mySpend))
          ? Number(finalObservations[agent.id].mySpend)
          : 0;

    const wins =
      finalInfo &&
      finalInfo.wins &&
      Number.isFinite(Number(finalInfo.wins[agent.id]))
        ? Number(finalInfo.wins[agent.id])
        : finalObservations[agent.id] &&
            Number.isFinite(Number(finalObservations[agent.id].myWins))
          ? Number(finalObservations[agent.id].myWins)
          : 0;

    const startingBudget = Number.isFinite(Number(agent._startingBudget))
      ? Number(agent._startingBudget)
      : null;

    const obsRemaining =
      finalObservations[agent.id] &&
      Number.isFinite(Number(finalObservations[agent.id].remainingBudget))
        ? Number(finalObservations[agent.id].remainingBudget)
        : null;

    const infoBudget =
      finalInfo &&
      finalInfo.budgets &&
      Number.isFinite(Number(finalInfo.budgets[agent.id]))
        ? Number(finalInfo.budgets[agent.id])
        : null;

    const inventoryValue =
      finalInfo &&
      finalInfo.inventoryValue &&
      Number.isFinite(Number(finalInfo.inventoryValue[agent.id]))
        ? Number(finalInfo.inventoryValue[agent.id])
        : 0;

    const remainingBudget =
      infoBudget !== null
        ? infoBudget
        : obsRemaining !== null
          ? obsRemaining
          : startingBudget !== null && Number.isFinite(startingBudget)
            ? Math.max(0, startingBudget - spent)
            : null;

    const finalWealth =
      remainingBudget !== null
        ? remainingBudget + inventoryValue
        : startingBudget !== null && Number.isFinite(startingBudget)
          ? startingBudget + (agent._return || 0) - spent
          : null;

    return {
      id: agent.id,
      ownerId: agent.ownerId || null,
      return: typeof agent._return === "number" ? agent._return : 0,
      failed: Boolean(agent._failed),
      loadError: agent._loadError || null,
      resetError: agent._resetError || null,
      actError: agent._actError || null,
      startingBudget,
      spent,
      remainingBudget,
      wins,
      inventoryValue,
      finalWealth,
    };
  });
}

module.exports = {
  buildAgentResults,
};
