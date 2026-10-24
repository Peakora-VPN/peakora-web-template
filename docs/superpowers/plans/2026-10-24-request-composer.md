# Request Composer Implementation Plan

**Goal:** Add a styled, validated contact flow with no network submission.
**Spec:** `docs/superpowers/specs/2026-10-24-request-composer-design.md`
**Architecture:** Native dialog and constraint validation, existing app module,
static HTML fields and existing CSS tokens. No dependencies or deployment changes.

- [x] Add markup regression checks for required constraints and inert submission.
- [x] Add `wireRequestComposer(doc)` in `src/app.js`, including safe preview,
  editing and clearing on close. Check absent/unsupported dialog guards.
- [x] Add contact opener, dialog, inline errors, review view and responsive CSS.
- [x] Build and run all tests. Assert real form behavior, focus, safe text output,
  no network/navigation, no-JS fallback and CSP using Playwright. Update docs.

## Verification

All 76 Node checks pass (Git Bash first in PATH). `node build.mjs` produces
171,622 bytes, including 23,433-byte index HTML. Real Playwright assertions
cover empty fields, email format, whitespace, exact minimum/maximum lengths,
overlong programmatic values, Unicode names, counter, literal HTML-like text,
review/edit, native modal focus, Escape/reset/focus restoration and no-JS email
fallback. Compose and review fit 360, 390, 768, 1024 and 1920 px. Form interactions
make zero requests under the project's CSP. Console has no errors. Native Tab
navigation may visit browser chrome; focused page controls remain inside the modal.
Read-only review found no blockers. Other browser engines and screen readers
were not independently exercised.

## Follow-up: direct Send request

The user requested a final sending action rather than a review screen. The form
now validates on Send request and opens a short thank-you screen with Close.
Removed the preview/edit state and its CSS. No network delivery or claims of
delivery were added. Removed blur validation: inserting inline errors during
button focus could move the button and swallow the first click on mobile.
Errors validate on submit and update during input correction.

All 77 Node tests pass. Playwright reproduces the old swallowed-click behavior
and verifies the fix: one empty Send click marks all five fields. Valid Send,
completion at 360/768/1440 px, close/reset/reopen and zero network requests pass.
