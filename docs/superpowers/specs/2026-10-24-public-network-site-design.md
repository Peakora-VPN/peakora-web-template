# Public network overview

The user's revised goal is a fuller, interactive public network website. The
hostname must stop being the subject of the page. This supersedes the prominent
identity panel and country heading from the earlier node-identity design.

## Direction

Lead with Peakora's infrastructure, then explain delivery, routing, operations
and practical network concepts. Use the existing dark palette, local fonts and
logo. The hero pairs an editorial heading with a selectable request lifecycle.
A second interactive explorer covers infrastructure areas; native accordions
cover operational principles and common questions. Give the Network page
substantive reference material rather than explaining the template itself.

Keep the country resolver, but use it only in a small regional note and footer.
Do not display or copy the hostname, or change the page heading/title to a
country. Existing navigation timings move behind an optional disclosure lower
on the overview. No invented clients, availability figures, certifications,
addresses or promises about filter behavior.

## Interaction and fallbacks

Reuse one small tab controller for both explorers, with ARIA tab/panel links,
one keyboard tab stop, arrow navigation, Home and End. All panel content is in
HTML and remains readable without JS; controls appear only after initialization.
No autoplay, extra requests, storage, forms, dependencies or inline styles/scripts.
Native details remain usable without JS. Turquoise remains exclusive to measured
session values; diagrams and selected controls use blue.

Verify actual clicks and keyboard behavior, independent tab groups, no-JS
content, country resolution without title changes, collapsed diagnostics, CSP,
responsive layouts and the existing build size budgets.
