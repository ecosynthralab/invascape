// One-time move of records saved under the old per-team storage keys to plain keys.
(function () {
  const BASE_KEYS = ['ecoplotscribeLog', 'habitatScorerLog', 'floraPredictors'];
  const teamId = (localStorage.getItem('invascapeTeamId') || 'default').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase();
  BASE_KEYS.forEach((key) => {
    const legacyKey = `${key}_${teamId}`;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy !== null && localStorage.getItem(key) === null) localStorage.setItem(key, legacy);
  });
})();
