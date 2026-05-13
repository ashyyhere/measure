// Tiny stdout logger.
//
//   log.info("running flow")
//   log.ok("done (1.2s)")
//   log.fail("upload failed")
//   log.fatal("postgres unreachable")           // prints + process.exit(1)
//   log.hint("Inspect dashboard:", "npx ...")
//
//   const build = log.scope("build: android")   // prefixes every line [build: android]
//   build.info("assembling")
//   build.ok("installed (28s)")

const COLOR = {
  green: "\x1b[1;32m",
  red: "\x1b[1;31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};

const TICK = `${COLOR.green}✓${COLOR.reset}`;
const CROSS = `${COLOR.red}✗${COLOR.reset}`;

export type Logger = {
  info(msg: string): void;
  ok(msg: string): void;
  fail(msg: string): void;
};

function write(prefix: string, msg: string): void {
  console.log(prefix ? `${prefix} ${msg}` : msg);
}

function makeLogger(label: string | null): Logger {
  const tag = label ? `[${label}]` : "";
  return {
    info: (msg) => write(tag, msg),
    ok: (msg) => write(`${TICK}${tag ? ` ${tag}` : ""}`, msg),
    fail: (msg) => write(`${CROSS}${tag ? ` ${tag}` : ""}`, msg),
  };
}

const root = makeLogger(null);

export const log = {
  ...root,

  scope(label: string): Logger {
    return makeLogger(label);
  },

  fatal(msg: string): never {
    console.error(msg);
    process.exit(1);
  },

  hint(heading: string, command: string): void {
    const rule = COLOR.dim + "─".repeat(72) + COLOR.reset;
    console.log();
    console.log(rule);
    console.log(heading);
    console.log();
    console.log(`  ${command}`);
    console.log(rule);
    console.log();
  },
};

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
}
