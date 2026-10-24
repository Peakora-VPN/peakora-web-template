# Node identity and connection readout

The template should feel like a complete edge endpoint page while remaining a
single static artifact for every host. The concrete naming example is
`pl2.peakora.network`: it must resolve to Poland without per-node configuration.

## Approach

Extend the existing browser-only resolver and instrument layout. A registry of
hosts would disclose the fleet; IP geolocation would require external requests.
Neither fits the repository constraints. Country names continue to come from
`Intl.DisplayNames`, with no embedded country or node registry.

Recognize standalone country codes, numbered codes, hyphenated node numbers,
service prefixes, optional three-letter site designations, and nested subdomains.
Ignore the domain suffix; reject conflicting country designations, malformed
hostnames and non-country regions. A hostname designation does not verify a
physical location. Unrecognized hosts retain the neutral Edge node identity.

## Interface

Keep the existing dark palette and local fonts. Use Space Grotesk for headings,
Inter for prose and JetBrains Mono for readings. The palette is #070b16,
#0b1224, #eaf0ff, #93a0c2, #6a8bff and #37e0c9. Blue identifies structure and
links; turquoise is reserved for actual session measurements.

The overview pairs a country heading with a node identity panel, then presents
the connection phases and measured totals. The node panel shows the current
hostname and whether its country is specified. No geographic map or invented
status indicators. Keep the rail layout on supporting sections; stack the
identity and timing content on mobile. Update Network copy to describe what
the browser can observe without claims about nearest hosts or upstreams.

## Constraints and verification

No dependencies, external requests, storage, inline scripts or style attributes.
Preserve CSP, no-JS content, keyboard focus, reduced motion and the 250 KB build
budget. Test resolver formats and rejection cases, DOM readouts and missing API
fallbacks. Run `node build.mjs`, `node --test` and a browser layout check.
