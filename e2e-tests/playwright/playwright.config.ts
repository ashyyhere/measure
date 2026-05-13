import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const showBrowser = process.env.SHOW_BROWSER === "1";
// Slow each action when watching a headed run; override the pace with SLOWMO ms.
const slowMo = showBrowser ? Number(process.env.SLOWMO ?? 1000) : 0;

export default defineConfig({
  testDir: ".",
  // Off: tests within a file share one fixture record. Across files we
  // still parallelize.
  fullyParallel: false,
  reporter: "list",
  // Default covers cheap UI assertions and the detail-page single-XHR wait.
  // Slower backend stages (ingest, plot aggregation) use named constants
  // from ./timeouts.ts at the specific assertions that need them.
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.SITE_BASE ?? "http://localhost:3000",
    // Resolve relative to the config so the path survives whichever CWD
    // Playwright is invoked from.
    storageState: resolve(here, ".storage-state.json"),
    headless: !showBrowser,
    launchOptions: { slowMo },
    trace: "retain-on-failure",
  },
});
