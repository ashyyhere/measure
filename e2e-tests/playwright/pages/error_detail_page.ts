import { type Locator, type Page } from "@playwright/test";

export class ErrorDetailPage {
  readonly page: Page;
  readonly id: Locator;
  readonly region: Locator;
  readonly plot: Locator;
  readonly distributionPlot: Locator;
  readonly commonPath: Locator;
  readonly mainStacktrace: Locator;
  readonly timestamp: Locator;
  readonly device: Locator;
  readonly appVersion: Locator;
  readonly networkType: Locator;
  readonly sessionTimelineLink: Locator;
  readonly copyAiContext: Locator;

  constructor(page: Page) {
    this.page = page;
    this.id = page.getByTestId("exception-detail-id");
    this.region = this.id.locator("..");
    this.plot = page.getByTestId("exception-detail-plot-data");
    this.distributionPlot = page.getByTestId(
      "exception-distribution-plot-data",
    );
    this.commonPath = page.getByTestId("exception-detail-common-path");
    this.mainStacktrace = page.getByTestId("exception-detail-main-stacktrace");
    this.timestamp = page.getByTestId("exception-detail-timestamp");
    this.device = page.getByTestId("exception-detail-device");
    this.appVersion = page.getByTestId("exception-detail-app-version");
    this.networkType = page.getByTestId("exception-detail-network-type");
    this.sessionTimelineLink = page.getByRole("link", {
      name: "View Session Timeline",
    });
    this.copyAiContext = page.getByRole("button", { name: "Copy AI Context" });
  }

  // Pills carry plain text; scope to the detail region to keep them unambiguous.
  pill(label: string): Locator {
    return this.region.getByText(label, { exact: true });
  }

  async openSessionTimeline(teamId: string) {
    await this.sessionTimelineLink.click();
    await this.page.waitForURL(`**/${teamId}/session_timelines/**`);
  }
}
