// The default expect timeout (set in playwright.config.ts) covers cheap UI
// assertions and single-XHR-after-navigation waits. The two constants below
// cover the slower backend pipelines that polling assertions sit on top of.
//
// INGEST_TIMEOUT is for "the event row has appeared in the list endpoint" —
// the upload + write-to-Postgres path.
//
// PLOT_TIMEOUT is for "the plot aggregation job has completed" — a slower
// downstream stage that lags the list endpoint.

export const INGEST_TIMEOUT = 60_000;
export const PLOT_TIMEOUT = 15_000;
