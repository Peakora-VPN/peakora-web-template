# Public Network Site Implementation Plan

**Goal:** Make the site a fuller public infrastructure overview with useful
interactions and quiet regional context.

**Architecture:** Keep the static HTML/CSS build and pure country resolver.
Extend `src/app.js` with one accessible controller reused by two tab groups.

**Spec:** `docs/superpowers/specs/2026-10-24-public-network-site-design.md`

- [x] Update DOM tests for quiet location and fixed page identity; add tests for
  tab selection, keyboard navigation, independent groups and absent markup.
- [x] Simplify `applyNode`, remove unused headline/title/hostname code and add
  `wireTabs(doc)`. Verify focused tests.
- [x] Rewrite the overview and Network content, replace the identity graphic with
  an interactive request diagram, add infrastructure panels and native disclosures,
  and replace obsolete CSS rather than layering overrides.
- [x] Sync README/repository guidance, build tracked `dist`, run all tests using
  Git Bash in PATH, and verify browser behavior, CSP, no-JS and responsive layouts.

Review emphasis: no prominent hostname or country identity; complete no-JS text;
correct ARIA/focus state; independent groups; no fabricated operational claims.

## Verification

All 74 tests pass with Git Bash first in PATH. `node build.mjs` produces a
158,395-byte `dist`. Browser checks cover all three pages at 360, 390, 768,
1024 and 1920 px, both tab groups, keyboard focus/navigation, native disclosures,
collapsed/expanded timings, reduced motion and CSP. All seven panels remain
readable without JS, with no visible inactive controls or external requests.
Under `pl2.peakora.network`, the title and heading stay fixed, Poland appears in
the regional note, and the hostname is absent from main content. Independent
read-only review found no functional, accessibility, copy or invariant issues.
