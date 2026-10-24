# Node Identity Implementation Plan

**Goal:** Recognize numbered and structured node hostnames and enrich the static
endpoint page with useful identity and connection information.

**Architecture:** Retain the pure resolver in `src/lib.js`, DOM bindings in
`src/app.js` and the shared HTML/CSS build. No new runtime modules or dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-node-identity-design.md`

## Tasks

- [x] Add resolver tests for `pl2`, separated numbers, service prefixes, site
  designations, nested labels, malformed input, ambiguous codes and suffixes.
  Run the tests, extend `countryFromHostname` without changing its return type,
  then rerun them.
- [x] Add DOM tests for the node panel, hostname copying, connection summary and
  unavailable data. Extend existing `applyNode`, `applyConnection` and
  `wireCopyButtons`; verify tests.
- [x] Update `src/pages/index.html`, `src/pages/network.html` and `src/styles.css`:
  identity panel, responsive connection instrument and truthful supporting copy.
  Reuse the layout, fonts, tokens and contact placeholder.
- [x] Document accepted formats and limitations in README and repository guidance.
  Build, run `node --test`, inspect desktop/mobile and no-JS behavior in a browser.

## Review focus

Conflicting country codes must remain neutral. Country-code top-level domains
must not become node locations. Missing Intl or Navigation Timing must preserve
the page. Long hostnames and country names must wrap on small screens. Browser
checks must cover the actual CSP and show no external requests.

## Verification

`node build.mjs` and all 70 tests pass (Git Bash first in PATH on Windows).
Browser checks cover all three pages at 360, 390, 768, 1024 and 1920 px, long
country names, ambiguous hostnames, no-JS content, clipboard, reduced motion,
keyboard focus and the deployed CSP. No external asset requests or console errors.
