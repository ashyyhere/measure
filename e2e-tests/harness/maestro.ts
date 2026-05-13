import { run } from "./exec.ts";
import { formatDuration, log } from "./log.ts";

// Runs one labeled Maestro flow and times it. Progress lines are prefixed
// with `[label]` (matching the build and web helpers); the same label is
// forwarded to `run()` so verbose subprocess output is prefixed the same way.
export async function runFlow(
  label: string,
  cwd: string,
  args: string[],
): Promise<boolean> {
  const flow = log.scope(label);
  flow.info("running flow");
  const t0 = Date.now();
  const ok = await run(cwd, "maestro", args, undefined, label);
  const dur = formatDuration(Date.now() - t0);
  if (ok) flow.ok(`flow completed (${dur})`);
  else flow.fail(`flow failed (${dur})`);
  return ok;
}
