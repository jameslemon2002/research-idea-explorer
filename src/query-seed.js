export function buildQuerySeed(query, literatureResult, options = {}) {
  return {
    focus: {
      domain: options.domain || "live-search",
      objects: [query]
    },
    constraints: {
      preferredPuzzles: options.preferredPuzzles || [
        "conflict",
        "distortion",
        "mechanism_unknown",
        "boundary_unknown"
      ],
      preferredClaims: options.preferredClaims || ["measure", "explain", "identify", "design"],
      evidenceKinds: options.evidenceKinds || ["survey", "administrative_data", "text_corpus", "simulation"],
      personaIds:
        options.personaIds || [
          "anomaly_hunter",
          "assumption_breaker",
          "measurement_skeptic",
          "failure_miner",
          "boundary_mapper",
          "analogy_transfer"
        ],
      keywords: options.keywords || query.split(/\s+/).filter(Boolean)
    },
    contrasts:
      options.contrasts || [
        {
          axis: "population",
          comparison: "core subgroups with unequal exposure"
        },
        {
          axis: "institution",
          comparison: "settings with and without formal intervention"
        },
        {
          axis: "measurement",
          comparison: "reported experience versus official metrics"
        }
      ],
    scope: {
      population: options.population || "relevant study populations",
      place: options.place || "contexts surfaced by retrieved literature",
      time: options.time || "recent literature window",
      scale: options.scale || "mixed"
    },
    stakes: options.stakes || ["novelty", "feasibility", "literature awareness"],
    history: options.history || [],
    literature: {
      providers: literatureResult?.providers || [],
      paperCount: literatureResult?.papers?.length || 0
    }
  };
}
