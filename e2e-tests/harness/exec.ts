import { execa, type Options } from "execa";
import { Transform } from "node:stream";

const verbose =
  process.argv.includes("--verbose") || process.argv.includes("-v");

// A Transform that prefixes each complete line with [label]. Used in verbose
// mode so parallel subprocesses' live output stays attributable.
function linePrefixer(label: string): Transform {
  let leftover = "";
  return new Transform({
    transform(chunk, _enc, cb) {
      leftover += chunk.toString();
      let nl: number;
      while ((nl = leftover.indexOf("\n")) !== -1) {
        this.push(`[${label}] ${leftover.slice(0, nl + 1)}`);
        leftover = leftover.slice(nl + 1);
      }
      cb();
    },
    flush(cb) {
      if (leftover) this.push(`[${label}] ${leftover}\n`);
      cb();
    },
  });
}

// `label` is used for attribution when subprocesses run in parallel:
// under --verbose each streamed line is prefixed with [label]; on a
// non-verbose failure the captured output is bracketed by the label.
// Omit it for sequential callers where the surrounding logf lines
// already imply which subprocess is talking.
export async function run(
  cwd: string,
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
  label?: string,
): Promise<boolean> {
  const subprocess = execa(cmd, args, {
    cwd,
    stdio: "pipe",
    env: env ? { ...process.env, ...env } : process.env,
    reject: false,
  });
  if (verbose && label) {
    subprocess.stdout
      ?.pipe(linePrefixer(label))
      .pipe(process.stdout, { end: false });
    subprocess.stderr
      ?.pipe(linePrefixer(label))
      .pipe(process.stderr, { end: false });
  } else if (verbose) {
    subprocess.stdout?.pipe(process.stdout, { end: false });
    subprocess.stderr?.pipe(process.stderr, { end: false });
  }
  const result = await subprocess;
  if (result.exitCode !== 0 && !verbose) {
    if (label) process.stderr.write(`\n──── output: ${label} ────\n`);
    if (result.stdout) process.stderr.write(String(result.stdout));
    if (result.stderr) process.stderr.write(String(result.stderr));
    if (label) process.stderr.write(`──── end: ${label} ────\n\n`);
  }
  return result.exitCode === 0;
}
