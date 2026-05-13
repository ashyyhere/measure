import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./exec.ts";
import { log } from "./log.ts";
import type { AppKeys } from "./setup-apps.ts";

const INGEST_URL = "http://localhost:8080";

export function writeFrankEnv(repoRoot: string, keys: AppKeys): void {
  const lines: string[] = [];
  const variants: Array<{ prefix: string; key: string }> = [
    { prefix: "FRANK_MEASURE_ANDROID", key: keys.android },
    { prefix: "FRANK_MEASURE_IOS", key: keys.ios },
  ];
  for (const { prefix, key } of variants) {
    for (const build of ["DEBUG", "RELEASE"] as const) {
      lines.push(`${prefix}_API_KEY_${build}=${key}`);
      lines.push(`${prefix}_API_URL_${build}=${INGEST_URL}`);
    }
  }
  writeFileSync(join(repoRoot, "samples/frank/.env"), lines.join("\n") + "\n");
}

// assembleRelease triggers the Measure Gradle plugin's R8 mapping upload,
// which the dashboard needs to de-obfuscate stack frames.
export async function buildAndInstallAndroid(repoRoot: string): Promise<void> {
  const label = "build: android";
  const build = log.scope(label);
  build.info("assembling Frank Android (release)");
  if (
    !(await run(
      join(repoRoot, "samples/frank"),
      "./gradlew",
      [":android:app:assembleRelease"],
      undefined,
      label,
    ))
  ) {
    throw new Error("gradle :android:app:assembleRelease failed");
  }
  const apk = join(
    repoRoot,
    "samples/frank/android/app/build/outputs/apk/release/app-release.apk",
  );
  build.info(`installing Frank Android via adb: ${apk}`);
  if (!(await run(repoRoot, "adb", ["install", "-r", apk], undefined, label))) {
    throw new Error(`adb install -r ${apk} failed`);
  }
  // Forward device:localhost:8080 → host:localhost:8080 so the SDK and the
  // Gradle plugin share one origin.
  build.info("adb reverse tcp:8080 tcp:8080");
  if (
    !(await run(
      repoRoot,
      "adb",
      ["reverse", "tcp:8080", "tcp:8080"],
      undefined,
      label,
    ))
  ) {
    throw new Error("adb reverse tcp:8080 tcp:8080 failed");
  }
}
