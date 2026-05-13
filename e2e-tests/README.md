# E2E Tests

End-to-end tests for Measure. A Node harness creates a fresh user and
team in the local self-host stack, drives the Frank sample app with
[Maestro](https://maestro.mobile.dev) to produce real events, then checks
the dashboard with [Playwright](https://playwright.dev).

## Setup

One-time. Install on the host:

- Node.js + npm
- Docker (for the self-host stack)
- `adb` (Android path)
- Xcode + `xcodebuild` (iOS path)
- [Maestro](https://docs.maestro.dev/get-started/quickstart)

Install Node deps and the Playwright browser:

```
cd e2e-tests
npm install
npx playwright install chromium
```

`self-host/.env` must contain these values (the runner has them
hardcoded in `harness/runner.ts`):

```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
SESSION_ACCESS_SECRET=super-secret-for-jwt-token-with-at-least-32-characters
SESSION_REFRESH_SECRET=super-secret-for-jwt-token-with-at-least-32-characters
```

Frank App's `MeasureConfig` must have `enableFullCollectionMode = true`.

## Run

Bring up the stack in a separate terminal:

```
cd self-host
docker compose up
```

Boot a device for whichever platform you want to run:

- Android: start an emulator (or plug in a device); verify with `adb devices`.
- iOS: open Simulator.app and boot one; verify with `xcrun simctl list devices booted`.

On a fresh Android emulator, disable Gboard's stylus-handwriting first-use
sheet. It pops up the first time an `EditText` is focused and swallows
the bug-report `inputText` step. Run once per emulator:

```
adb shell settings put secure stylus_handwriting_enabled 0
adb shell settings put secure stylus_handwriting_default_value 0
```

The iOS bug-report flow is not supported on iOS 26. Its photo picker runs
out-of-process there, so its elements are absent from Maestro's accessibility
tree and the gallery-attachment step cannot be driven by selectors. Run the
iOS path on an earlier iOS version until the upstream fix lands:
https://github.com/mobile-dev-inc/maestro/pull/3183

Then from `e2e-tests/`:

```
npm start                     # android + iOS
npm start -- --android        # android only
npm start -- --ios            # iOS only
npm start -- --verbose        # or -v; stream output from app builds and maestro
npm start -- --show-browser   # show Chrome during dashboard steps
npm start -- --help           # or -h
```

## Add a new test

A test is a pair, named after the event type:

- `maestro/{android,ios}/<name>.yaml` drives Frank to produce the event.
- `playwright/{android,ios}/<name>.spec.ts` asserts the dashboard shows it.

Pointers:

- Copy a sibling as the template. Simplest references: `maestro/android/crash.yaml`, `playwright/android/crashes.spec.ts`.
- Register the Maestro flow in `maestro/{android,ios}/all.yaml` via `runFlow:`. Playwright specs are auto-discovered.
- In flows, use `${APP_ID}`. If the SDK only flushes on next launch (crashes), end the flow with a relaunch and no `clearState`.
- In specs, read `TEAM_ID` and `ANDROID_APP_ID` / `IOS_APP_ID` from `process.env`, use `getByTestId(...)`, and use `INGEST_TIMEOUT` / `PLOT_TIMEOUT` from `playwright/timeouts.ts`.
- If a dashboard element has no `data-testid`, add one.
- If Frank has no UI to trigger the event, add a screen or button under `samples/frank/{android,ios}/` first.
- Iterate with `npm start -- --android --verbose --show-browser`.
