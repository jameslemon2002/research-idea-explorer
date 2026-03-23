export const sampleSeed = {
  focus: {
    domain: "urban studies",
    objects: ["urban heat adaptation"]
  },
  constraints: {
    preferredPuzzles: ["distortion", "boundary_unknown", "leverage_unknown"],
    preferredClaims: ["measure", "identify", "design"],
    evidenceKinds: ["survey", "sensor_data", "administrative_data", "simulation"],
    personaIds: [
      "anomaly_hunter",
      "assumption_breaker",
      "measurement_skeptic",
      "failure_miner",
      "boundary_mapper",
      "analogy_transfer"
    ],
    keywords: ["equity", "heat", "neighborhood", "policy"]
  },
  contrasts: [
    {
      axis: "population",
      comparison: "older adults versus working-age residents"
    },
    {
      axis: "space",
      comparison: "neighborhoods with cooling centers versus those without"
    },
    {
      axis: "measurement",
      comparison: "resident experience versus administrative metrics"
    }
  ],
  scope: {
    population: "urban residents exposed to extreme heat",
    place: "London boroughs",
    time: "recent heatwave seasons",
    scale: "neighborhood"
  },
  stakes: ["equity", "policy design", "measurement validity"]
};
