import { type Locator, type Page } from "@playwright/test";

export class ErrorsOverviewPage {
  readonly page: Page;
  readonly row: Locator;
  readonly rowType: Locator;
  readonly rowInstances: Locator;
  readonly rowPercentage: Locator;
  readonly plot: Locator;
  readonly typeFilter: Locator;
  readonly severityFilter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.row = page.getByTestId("exception-row");
    this.rowType = page.getByTestId("exception-row-type");
    this.rowInstances = page.getByTestId("exception-row-instances");
    this.rowPercentage = this.row.getByRole("cell", { name: /%$/ });
    this.plot = page.getByTestId("exceptions-plot-data");
    this.typeFilter = page.getByRole("button", { name: "Type" });
    this.severityFilter = page.getByRole("button", { name: "Severity" });
  }

  // Pills carry plain text; scope to the row to avoid colliding with filter pills.
  rowPill(label: string): Locator {
    return this.row.getByText(label, { exact: true });
  }

  filterPill(label: string): Locator {
    return this.page.getByText(label, { exact: true });
  }

  async gotoFatalErrors(teamId: string, appId: string) {
    await this.page.goto(`/${teamId}/errors?a=${appId}&et=error&sv=fatal`);
  }

  async gotoAnrs(teamId: string, appId: string) {
    await this.page.goto(`/${teamId}/errors?a=${appId}&et=anr`);
  }

  async openDetail(teamId: string) {
    await this.row.first().click();
    await this.page.waitForURL(`**/${teamId}/errors/**`);
  }
}
