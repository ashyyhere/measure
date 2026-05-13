import { chromium, type Page } from "@playwright/test";
import type pg from "pg";

export type AppKeys = { android: string; ios: string };
export type AppIds = { android: string; ios: string };

export async function createAppsViaDashboard(
  teamId: string,
  siteBase: string,
  storageStatePath: string,
  opts: { showBrowser: boolean },
): Promise<AppKeys> {
  const browser = await chromium.launch({ headless: !opts.showBrowser });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();

  try {
    const keys: Record<string, string> = {};
    for (const name of ["frank-android", "frank-ios"] as const) {
      await page.goto(`${siteBase}/${teamId}/apps`);
      // Empty team renders the Onboarding wizard; the standalone CreateApp
      // dialog trigger only appears once at least one app exists.
      const onboardingInput = page.getByTestId("onboarding-app-name-input");
      const apiKeyInput = page.getByTestId("api-key-input");
      const flow = await Promise.race([
        onboardingInput
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(() => "onboarding" as const),
        apiKeyInput
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(() => "settings" as const),
      ]);
      if (flow === "onboarding") {
        await createAppViaOnboarding(page, name);
        // Onboarding advances to the integrate step after success; revisit
        // /apps to read the api key from the settings UI.
        await page.goto(`${siteBase}/${teamId}/apps`);
      } else {
        await createAppViaDialog(page, name);
      }
      keys[name] = await waitForApiKey(page);
    }
    return { android: keys["frank-android"], ios: keys["frank-ios"] };
  } finally {
    await browser.close();
  }
}

async function createAppViaOnboarding(page: Page, name: string): Promise<void> {
  const input = page.getByTestId("onboarding-app-name-input");
  await input.fill(name);
  await page.getByTestId("onboarding-create-app-button").click();
  await input.waitFor({ state: "detached", timeout: 15_000 });
}

async function createAppViaDialog(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Create App", exact: true }).click();
  const input = page.getByPlaceholder("Enter app name");
  await input.fill(name);
  // The trigger button and the submit button share the text "Create App",
  // so submit by pressing Enter on the form input instead.
  await input.press("Enter");
  // Wait for the dialog to close before reading the api key. The
  // page behind it still shows the previously selected app's key.
  await input.waitFor({ state: "detached", timeout: 15_000 });
}

async function waitForApiKey(page: Page): Promise<string> {
  return page.getByTestId("api-key-input").inputValue({ timeout: 15_000 });
}

export async function fetchAppIds(
  pool: pg.Pool,
  teamId: string,
): Promise<AppIds> {
  const res = await pool.query<{ id: string; app_name: string }>(
    "select id, app_name from apps where team_id = $1",
    [teamId],
  );
  const byName = new Map(res.rows.map((r) => [r.app_name, r.id]));
  const android = byName.get("frank-android");
  const ios = byName.get("frank-ios");
  if (!android || !ios) {
    throw new Error(
      `fetchAppIds: expected both frank-android and frank-ios in team ${teamId}, got ${JSON.stringify(res.rows)}`,
    );
  }
  return { android, ios };
}
