import { join } from "node:path";
import { run } from "./exec.ts";
import { log } from "./log.ts";

// xcodebuild output layout has been stable across Xcode 14/15/16: the SDK
// suffix is derived from -destination, and Debug from -configuration.
const APP_BUILD_PATH =
  "build/Build/Products/Debug-iphonesimulator/FrankensteinApp.app";

export async function buildAndInstallIOS(repoRoot: string): Promise<void> {
  const label = "build: ios";
  const build = log.scope(label);
  build.info("building and installing Frank iOS");
  const iosDir = join(repoRoot, "samples/frank/ios");
  // Single-arch dSYM: the symboloader registers only one UUID per dSYM,
  // so a fat (arm64 + x86_64) build leaves the simulator's arch
  // unsymbolicated on the dashboard.
  const hostArch = process.arch === "arm64" ? "arm64" : "x86_64";
  if (
    !(await run(
      iosDir,
      "xcodebuild",
      [
        "-workspace",
        "FrankensteinApp.xcworkspace",
        "-scheme",
        "FrankensteinApp",
        "-configuration",
        "Debug",
        "-destination",
        "generic/platform=iOS Simulator",
        "-derivedDataPath",
        "build",
        "CODE_SIGNING_ALLOWED=NO",
        `ARCHS=${hostArch}`,
        "ONLY_ACTIVE_ARCH=YES",
        "clean",
        "build",
      ],
      undefined,
      label,
    ))
  ) {
    throw new Error("xcodebuild failed");
  }
  const appPath = join(iosDir, APP_BUILD_PATH);
  if (
    !(await run(
      repoRoot,
      "xcrun",
      ["simctl", "install", "booted", appPath],
      undefined,
      label,
    ))
  ) {
    throw new Error(`xcrun simctl install booted ${appPath} failed`);
  }
}
