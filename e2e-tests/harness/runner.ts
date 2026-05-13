import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";
import { run } from "./exec.ts";
import { buildAndInstallAndroid, writeFrankEnv } from "./frank.ts";
import { buildAndInstallIOS } from "./ios.ts";
import { runFlow } from "./maestro.ts";
import { formatDuration, log } from "./log.ts";
import { provision } from "./provision.ts";
import { createAppsViaDashboard, fetchAppIds } from "./setup-apps.ts";

const FRANK_ANDROID_APP_ID = "sh.frankenstein.android";
// Debug config appends .debug to the bundle id.
const FRANK_IOS_APP_ID = "sh.frankenstein.ios.debug";
const INGEST_SETTLE_MS = 20_000;
const SITE_BASE = "http://localhost:3000";

// Match the defaults written by self-host/config.sh (lines 256-257). If you
// regenerated secrets via config.sh's generate_password path, update the
// constants below to match what's in your self-host/.env.
const POSTGRES_DSN =
  "postgresql://postgres:postgres@localhost:5432/measure?search_path=measure";
const SESSION_ACCESS_SECRET =
  "super-secret-for-jwt-token-with-at-least-32-characters";
const SESSION_REFRESH_SECRET =
  "super-secret-for-jwt-token-with-at-least-32-characters";

type Platform = "android" | "ios";

type RunOptions = {
  includeAndroid: boolean;
  includeIos: boolean;
  showBrowser: boolean;
  seedGallery: boolean;
};

type Session = Awaited<ReturnType<typeof provision>>;
type AppKeys = Awaited<ReturnType<typeof createAppsViaDashboard>>;
type AppIds = Awaited<ReturnType<typeof fetchAppIds>>;

async function main() {
  const runStart = Date.now();
  const repoRoot = resolve(process.cwd(), "..");

  const opts = parseArgs(process.argv.slice(2));
  if (!opts) return;

  const pool = new pg.Pool({ connectionString: POSTGRES_DSN });
  await checkStack(pool, opts);

  const session = await provisionSession(pool);
  const storageStatePath = writePlaywrightStorageState(repoRoot, session);
  const { keys, appIds } = await createApps(
    pool,
    session.teamId,
    storageStatePath,
    opts,
  );
  await writeFrankSecrets(repoRoot, keys);

  const platforms: Platform[] = [];
  if (opts.includeAndroid) platforms.push("android");
  if (opts.includeIos) platforms.push("ios");

  // Build/maestro/settle run in parallel per platform; web tests run
  // sequentially because concurrent Playwright suites overload the local
  // dashboard and surface as page.goto timeouts.
  const perPlatformFailures = await Promise.all(
    platforms.map((p) => runPlatformPrep(p, repoRoot, opts)),
  );
  const failures = perPlatformFailures.flat();
  for (const p of platforms) {
    await runPlaywright(p, repoRoot, opts, session.teamId, appIds, failures);
  }

  log.hint(
    "Inspect dashboard in browser:",
    `npx playwright open --load-storage=playwright/.storage-state.json ${SITE_BASE}/${session.teamId}/overview`,
  );

  await pool.end();
  printSummary(failures, runStart);
}

// Build failures throw and abort this pipeline; maestro failures are
// soft-collected so the run still produces a complete summary.
async function runPlatformPrep(
  platform: Platform,
  repoRoot: string,
  opts: RunOptions,
): Promise<string[]> {
  const failures: string[] = [];
  const pipeline = log.scope(platform);
  const build = log.scope(`build: ${platform}`);

  const tBuild = Date.now();
  if (platform === "android") await buildAndInstallAndroid(repoRoot);
  else await buildAndInstallIOS(repoRoot);
  build.ok(`Frank installed (${formatDuration(Date.now() - tBuild)})`);

  if (opts.seedGallery) await seedGallery(platform, repoRoot);

  const appBundleId =
    platform === "android" ? FRANK_ANDROID_APP_ID : FRANK_IOS_APP_ID;
  await runMaestro(platform, appBundleId, repoRoot, failures);

  pipeline.info(`waiting ${INGEST_SETTLE_MS / 1000}s for ingest to settle`);
  await new Promise((r) => setTimeout(r, INGEST_SETTLE_MS));

  return failures;
}

async function provisionSession(pool: pg.Pool): Promise<Session> {
  log.info("provisioning fresh user and team");
  const t = Date.now();
  const session = await provision(pool, {
    accessTokenSecret: SESSION_ACCESS_SECRET,
    refreshTokenSecret: SESSION_REFRESH_SECRET,
  });
  log.ok(
    `provisioned team_id=${session.teamId} (${formatDuration(Date.now() - t)})`,
  );
  return session;
}

function writePlaywrightStorageState(
  repoRoot: string,
  session: Session,
): string {
  const storageStatePath = join(
    repoRoot,
    "e2e-tests/playwright/.storage-state.json",
  );
  const cookieBase = {
    domain: "localhost",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
  writeFileSync(
    storageStatePath,
    JSON.stringify({
      cookies: [
        { name: "access_token", value: session.accessToken, ...cookieBase },
        { name: "refresh_token", value: session.refreshToken, ...cookieBase },
      ],
      origins: [],
    }),
  );
  return storageStatePath;
}

async function createApps(
  pool: pg.Pool,
  teamId: string,
  storageStatePath: string,
  opts: RunOptions,
): Promise<{ keys: AppKeys; appIds: AppIds }> {
  log.info("creating apps via dashboard UI");
  const t = Date.now();
  const keys = await createAppsViaDashboard(
    teamId,
    SITE_BASE,
    storageStatePath,
    {
      showBrowser: opts.showBrowser,
    },
  );
  const appIds = await fetchAppIds(pool, teamId);
  log.ok(
    `apps created: android=${keys.android.slice(0, 14)}…, ios=${keys.ios.slice(0, 14)}… (${formatDuration(Date.now() - t)})`,
  );
  return { keys, appIds };
}

async function writeFrankSecrets(
  repoRoot: string,
  keys: AppKeys,
): Promise<void> {
  log.info("writing samples/frank/.env");
  writeFrankEnv(repoRoot, keys);
  if (!(await run(repoRoot, "samples/frank/setup-secrets.sh", []))) {
    throw new Error("samples/frank/setup-secrets.sh failed");
  }
}

// Pushes a fixture image into the device gallery so the bug-report flow's
// picker can use it. Sidesteps Maestro's flaky addMedia gRPC layer.
async function seedGallery(
  platform: Platform,
  repoRoot: string,
): Promise<void> {
  const label = `seed: ${platform}`;
  const seed = log.scope(label);
  const imagePath = join(repoRoot, "e2e-tests/maestro/assets/test_image.png");
  seed.info("seeding gallery image");
  const t = Date.now();
  if (platform === "android") {
    const devicePath = "/sdcard/Pictures/measure-e2e-test.png";
    if (
      !(await run(
        repoRoot,
        "adb",
        ["push", imagePath, devicePath],
        undefined,
        label,
      ))
    ) {
      throw new Error(`adb push ${imagePath} → ${devicePath} failed`);
    }
    if (
      !(await run(
        repoRoot,
        "adb",
        [
          "shell",
          "am",
          "broadcast",
          "-a",
          "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
          "-d",
          `file://${devicePath}`,
        ],
        undefined,
        label,
      ))
    ) {
      throw new Error("MEDIA_SCANNER_SCAN_FILE broadcast failed");
    }
  } else {
    if (
      !(await run(
        repoRoot,
        "xcrun",
        ["simctl", "addmedia", "booted", imagePath],
        undefined,
        label,
      ))
    ) {
      throw new Error(`xcrun simctl addmedia booted ${imagePath} failed`);
    }
  }
  seed.ok(`gallery seeded (${formatDuration(Date.now() - t)})`);
}

// A missing all.yaml is treated as "no flows for this platform yet" and
// silently skipped; the Playwright stage will then have nothing to assert
// and fail informatively.
async function runMaestro(
  platform: Platform,
  appId: string,
  repoRoot: string,
  failures: string[],
): Promise<void> {
  const flowPath = join(repoRoot, "e2e-tests", "maestro", platform, "all.yaml");
  if (!existsSync(flowPath)) return;
  const label = `maestro: ${platform}`;
  const ok = await runFlow(label, repoRoot, [
    `--platform=${platform}`,
    "test",
    "-e",
    `APP_ID=${appId}`,
    flowPath,
  ]);
  if (!ok) failures.push(label);
}

async function runPlaywright(
  platform: Platform,
  repoRoot: string,
  opts: RunOptions,
  teamId: string,
  appIds: AppIds,
  failures: string[],
): Promise<void> {
  const label = `web: ${platform}`;
  const web = log.scope(label);
  web.info("running Playwright tests");
  const t = Date.now();
  const ok = await run(
    join(repoRoot, "e2e-tests"),
    "npx",
    [
      "playwright",
      "test",
      "--config",
      "playwright/playwright.config.ts",
      `playwright/${platform}`,
    ],
    {
      TEAM_ID: teamId,
      ANDROID_APP_ID: appIds.android,
      IOS_APP_ID: appIds.ios,
      SITE_BASE,
      ...(opts.showBrowser ? { SHOW_BROWSER: "1" } : {}),
    },
    label,
  );
  const dur = formatDuration(Date.now() - t);
  if (ok) web.ok(`web tests passed (${dur})`);
  else {
    web.fail(`web tests failed (${dur})`);
    failures.push(label);
  }
}

// Returns null when --help was requested (caller should exit).
function parseArgs(args: string[]): RunOptions | null {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return null;
  }
  // --verbose is read by exec.ts directly.
  const onlyAndroid = args.includes("--android");
  const onlyIos = args.includes("--ios");
  if (onlyAndroid && onlyIos) {
    throw new Error("--android and --ios are mutually exclusive");
  }
  return {
    includeAndroid: !onlyIos,
    includeIos: !onlyAndroid,
    showBrowser: args.includes("--show-browser"),
    seedGallery: args.includes("--seed-gallery"),
  };
}

function printHelp(): void {
  console.log(`Usage: npm start -- [flags]

Provisions a fresh user and team in the local self-host stack, drives
Frank under Maestro on Android and iOS, then verifies the dashboard
with Playwright. Per-stage progress is tagged [android] / [ios].

Flags:
  --android        run only the Android pipeline (skip iOS)
  --ios            run only the iOS pipeline (skip Android)
  --seed-gallery   push a fixture image into the device gallery before Maestro
                   runs (needed by the bug-report flow's image picker)
  --show-browser   show Chrome during dashboard UI steps (default: headless)
  --verbose, -v    stream subprocess output live (default: captured, dumped on failure)
  --help, -h       show this help and exit

--android and --ios are mutually exclusive. With neither, both run.`);
}

function printSummary(failures: string[], runStart: number): void {
  const total = formatDuration(Date.now() - runStart);
  if (failures.length > 0) {
    log.fail(`${failures.length} flow(s) failed in ${total}:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  log.ok(`all flows passed in ${total}`);
}

async function checkStack(pool: pg.Pool, opts: RunOptions): Promise<void> {
  try {
    const client = await pool.connect();
    client.release();
  } catch {
    log.fatal(
      "Postgres is unreachable on localhost:5432. Is the self-host stack up? Start it with 'cd self-host && docker compose up'.",
    );
  }
  log.ok("postgres reachable on localhost:5432");

  try {
    const res = await fetch(`${SITE_BASE}/`);
    if (res.status >= 500) throw new Error(`status ${res.status}`);
  } catch {
    log.fatal(
      "Dashboard is unreachable on localhost:3000. Is the self-host stack up? Start it with 'cd self-host && docker compose up'.",
    );
  }
  log.ok("dashboard reachable on localhost:3000");

  if (opts.includeAndroid) {
    const result = spawnSync("adb", ["devices"], { encoding: "utf8" });
    const devices = (result.stdout ?? "")
      .split("\n")
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => l.endsWith("\tdevice"));
    if (devices.length === 0) {
      log.fatal(
        "No Android devices found via adb. Boot an emulator or connect a device.",
      );
    }
    log.ok(`found ${devices.length} android device(s) via adb`);
  }

  if (opts.includeIos) {
    const result = spawnSync("xcrun", ["simctl", "list", "devices", "booted"], {
      encoding: "utf8",
    });
    if (!(result.stdout ?? "").includes("Booted")) {
      log.fatal(
        "No booted iOS Simulator found. Open Simulator.app and boot one.",
      );
    }
    log.ok("found a booted ios simulator");
  }
}

main().catch((err) => {
  log.fail(err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
