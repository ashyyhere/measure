import { test, expect } from "@playwright/test";
import { PLOT_TIMEOUT } from "../timeouts.ts";
import { ErrorsOverviewPage } from "../pages/errors_overview_page.ts";
import { ErrorDetailPage } from "../pages/error_detail_page.ts";
import { SessionTimelinePage } from "../pages/session_timeline_page.ts";

const teamId = process.env.TEAM_ID;
if (!teamId) throw new Error("TEAM_ID not set");
const appId = process.env.ANDROID_APP_ID;
if (!appId) throw new Error("ANDROID_APP_ID not set");

// The app reports both a fatal error and an ANR, so each block filters by
// type/severity to isolate its single row.
test.describe("errors overview", () => {
  test.describe("fatal error", () => {
    let overview: ErrorsOverviewPage;

    test.beforeEach(async ({ page }) => {
      overview = new ErrorsOverviewPage(page);
      await overview.gotoFatalErrors(teamId, appId);
    });

    test("overview shows the single ingested fatal error", async () => {
      await expect(overview.row).toHaveCount(1);
      await expect(overview.rowType).toHaveText(
        /^java\.lang\.IllegalAccessException/,
      );
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
      await expect(detail.mainStacktrace).toContainText(
        "java.lang.IllegalAccessException",
      );
    });

    test("detail stack trace contains symbolicated source frame", async ({
      page,
    }) => {
      await overview.openDetail(teamId);
      const detail = new ErrorDetailPage(page);
      await expect(detail.mainStacktrace).toContainText(
        "sh.frankenstein.android.NativeAndroidScreenKt",
      );
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

  test.describe("anrs", () => {
    let overview: ErrorsOverviewPage;

    test.beforeEach(async ({ page }) => {
      overview = new ErrorsOverviewPage(page);
      await overview.gotoAnrs(teamId, appId);
    });

    test("overview shows the single ingested ANR", async () => {
      await expect(overview.row).toHaveCount(1);
      await expect(overview.rowType).toHaveText(
        /^sh\.measure\.android\.anr\.AnrError/,
      );
      await expect(overview.rowInstances).toHaveText("1");
      await expect(overview.rowPercentage).toBeVisible();

      await expect(overview.rowPill("ANR")).toBeVisible();
      await expect(overview.rowPill("Fatal")).toBeVisible();

      await expect(overview.plot).toBeVisible({ timeout: PLOT_TIMEOUT });

      await expect(overview.typeFilter).toBeVisible();
      // Severity is hidden when only ANR is selected.
      await expect(overview.severityFilter).toHaveCount(0);
      await expect(overview.filterPill("ANRs")).toBeVisible();
    });

    test("clicking the row opens the ANR detail page", async ({ page }) => {
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

      await expect(detail.pill("ANR")).toBeVisible();
      await expect(detail.pill("Fatal")).toBeVisible();
      await expect(detail.mainStacktrace).toContainText(
        "sh.measure.android.anr.AnrError",
      );
    });

    test("detail stack trace contains symbolicated Frank source frame", async ({
      page,
    }) => {
      await overview.openDetail(teamId);
      const detail = new ErrorDetailPage(page);
      await expect(detail.mainStacktrace).toContainText(
        "sh.frankenstein.android.NativeAndroidScreenKt",
      );
    });

    test("session timeline link opens the timeline with the ANR event", async ({
      page,
    }) => {
      await overview.openDetail(teamId);
      const detail = new ErrorDetailPage(page);
      await detail.openSessionTimeline(teamId);
      const timeline = new SessionTimelinePage(page);

      await expect(timeline.events).toBeVisible({ timeout: PLOT_TIMEOUT });
      await expect(timeline.event("anr")).toBeVisible();
    });
  });
});
