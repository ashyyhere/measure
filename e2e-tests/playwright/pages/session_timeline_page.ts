import { type Locator, type Page } from "@playwright/test";

export class SessionTimelinePage {
  readonly page: Page;
  readonly events: Locator;

  constructor(page: Page) {
    this.page = page;
    this.events = page.getByTestId("session-timeline-events");
  }

  event(type: string): Locator {
    return this.events.locator(`[data-event-type="${type}"]`).first();
  }
}
