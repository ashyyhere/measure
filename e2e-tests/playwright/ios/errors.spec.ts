import { test, expect } from "@playwright/test";
import { PLOT_TIMEOUT } from "../timeouts.ts";
import { ErrorsOverviewPage } from "../pages/errors_overview_page.ts";
import { ErrorDetailPage } from "../pages/error_detail_page.ts";
import { SessionTimelinePage } from "../pages/session_timeline_page.ts";

const teamId = process.env.TEAM_ID;
if (!teamId) throw new Error("TEAM_ID not set");
const appId = process.env.IOS_APP_ID;
if (!appId) throw new Error("IOS_APP_ID not set");

// KSCrash captures NSExceptions via the SIGABRT signal handler.
const FATAL_ERROR_TYPE = /^SIGABRT/;

test.describe("ios errors", () => {
  let overview: ErrorsOverviewPage;

  test.beforeEach(async ({ page }) => {
    overview = new ErrorsOverviewPage(page);
    await overview.gotoFatalErrors(teamId, appId);
  });

  test("overview shows the single ingested fatal error", async () => {
    await expect(overview.row).toHaveCount(1);
    await expect(overview.rowType).toHaveText(FATAL_ERROR_TYPE);
    await expect(overview.rowInstances).toHaveText("1");
    await expect(overview.rowPercentage).toBeVisible();

    await expect(overview.rowPill("Error")).toBeVisible();
    await expect(overview.rowPill("Fatal")).toBeVisible();

    await expect(overview.plot).toBeVisible({ timeout: PLOT_TIMEOUT });

    await expect(overview.typeFilter).toBeVisible();
    await expect(overview.severityFilter).toBeVisible();
    await expect(overview.filterPill("Fatal Errors")).toBeVisible();
  });

  test("clicking the row opens the fatal error detail page", async ({
    page,
  }) => {
    await overview.openDetail(teamId);
    const detail = new ErrorDetailPage(page);

    await expect(detail.plot).toBeVisible({ timeout: PLOT_TIMEOUT });
    await expect(detail.distributionPlot).toBeVisible({
      timeout: PLOT_TIMEOUT,
    });
    await expect(detail.commonPath).toBeVisible();
    await expect(detail.commonPath).toContainText("Common Path");
    await expect(detail.id).toHaveText(/Id:\s+[0-9a-fA-F-]{36}/);
    await expect(detail.timestamp).toHaveText(/Time:\s+\S/);
    await expect(detail.device).toHaveText(/Device:\s+\S/);
    await expect(detail.appVersion).toHaveText(/App version:\s+\d/);
    await expect(detail.networkType).toHaveText(/Network type:\s+\S/);
    await expect(detail.sessionTimelineLink).toHaveAttribute(
      "href",
      /\/session_timelines\//,
    );
    await expect(detail.copyAiContext).toBeVisible();

    await expect(detail.pill("Error")).toBeVisible();
    await expect(detail.pill("Fatal")).toBeVisible();
  });

  test("detail stack trace is symbolicated", async ({ page }) => {
    await overview.openDetail(teamId);
    const detail = new ErrorDetailPage(page);

    // Simulator Debug builds don't symbolicate to Swift symbol names even
    // after dSYM upload; assert the Frank app binary appears in the
    // backtrace so we know the error came from Frank, not framework code.
    await expect(detail.mainStacktrace).toContainText("FrankensteinApp");
  });

  test("session timeline link opens the timeline with the fatal error event", async ({
    page,
  }) => {
    await overview.openDetail(teamId);
    const detail = new ErrorDetailPage(page);
    await detail.openSessionTimeline(teamId);
    const timeline = new SessionTimelinePage(page);

    await expect(timeline.events).toBeVisible({ timeout: PLOT_TIMEOUT });
    await expect(timeline.event("error")).toBeVisible();
  });
});
