import { expect, test } from "@playwright/test";
import { INGEST_TIMEOUT, PLOT_TIMEOUT } from "../timeouts.ts";

const teamId = process.env.TEAM_ID;
if (!teamId) throw new Error("TEAM_ID not set");
const appId = process.env.IOS_APP_ID;
if (!appId) throw new Error("IOS_APP_ID not set");

const IOS_BUG_REPORT_DESCRIPTION = "e2e-ios-bug-report";

test.describe("ios bug reports", () => {
  test("overview lists the ios bug report", async ({ page }) => {
    await page.goto(`/${teamId}/bug_reports?a=${appId}`);

    // Plot aggregation lags the list endpoint; assert the row first.
    const row = page
      .getByTestId("bug-report-row")
      .filter({ hasText: IOS_BUG_REPORT_DESCRIPTION });
    await expect(row).toHaveCount(1, { timeout: INGEST_TIMEOUT });

    await expect(page.getByTestId("bug-reports-plot-data")).toBeVisible({
      timeout: PLOT_TIMEOUT,
    });
  });

  test("clicking the row opens the bug report detail page", async ({
    page,
  }) => {
    await page.goto(`/${teamId}/bug_reports?a=${appId}`);

    const row = page
      .getByTestId("bug-report-row")
      .filter({ hasText: IOS_BUG_REPORT_DESCRIPTION });
    await row.click();
    await page.waitForURL(`**/${teamId}/bug_reports/**`);

    await expect(page.getByTestId("bug-report-detail-description")).toHaveText(
      IOS_BUG_REPORT_DESCRIPTION,
    );

    // Counting <img> elements would race the Image onError that strips broken
    // ones; require two with non-zero naturalWidth so the test only passes
    // when the bytes really rendered.
    const screenshots = page.getByRole("img", { name: /^Screenshot \d+$/ });
    await expect
      .poll(
        async () =>
          screenshots.evaluateAll(
            (imgs) =>
              imgs.filter((img) => (img as HTMLImageElement).naturalWidth > 0)
                .length,
          ),
        { timeout: INGEST_TIMEOUT },
      )
      .toBe(2);

    await expect
      .soft(page.getByRole("link", { name: "View Session Timeline" }))
      .toHaveAttribute("href", /\/session_timelines\//);
  });

  test("status toggle changes the badge and reverts cleanly", async ({
    page,
  }) => {
    await page.goto(`/${teamId}/bug_reports?a=${appId}`);

    const row = page
      .getByTestId("bug-report-row")
      .filter({ hasText: IOS_BUG_REPORT_DESCRIPTION });
    await row.click();
    await page.waitForURL(`**/${teamId}/bug_reports/**`);

    const status = page.getByTestId("bug-report-detail-status");
    await expect(status).toHaveText(/^(Open|Closed)$/);
    const initial = (await status.textContent())?.trim();
    const flipped = initial === "Open" ? "Closed" : "Open";

    const toggle = page.getByRole("button", {
      name: /(Close|Re-Open) Bug Report/,
    });
    await toggle.click();
    await expect(status).toHaveText(flipped);

    await toggle.click();
    await expect(status).toHaveText(initial!);
  });

  test("session timeline link opens the timeline with the bug report event", async ({
    page,
  }) => {
    await page.goto(`/${teamId}/bug_reports?a=${appId}`);

    const row = page
      .getByTestId("bug-report-row")
      .filter({ hasText: IOS_BUG_REPORT_DESCRIPTION });
    await row.click();
    await page.waitForURL(`**/${teamId}/bug_reports/**`);

    await page.getByRole("link", { name: "View Session Timeline" }).click();
    await page.waitForURL(`**/${teamId}/session_timelines/**`);

    const events = page.getByTestId("session-timeline-events");
    await expect(events).toBeVisible({ timeout: PLOT_TIMEOUT });
    await expect(
      events.locator('[data-event-type="bug_report"]').first(),
    ).toBeVisible();
  });
});
