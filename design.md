# Design — DashboardOS

A locked visual system for DashboardOS. Every UI sprint reads this file before
changing presentation. Existing routes, authorization, data flows, and product
language remain authoritative; this file governs design and interaction only.

## Genre

Modern-minimal analytics workbench. The interface should read like a precise
instrument panel: calm, technical, data-first, and tenant-aware.

## Macrostructure family

- Marketing pages: product-led split composition with real interface evidence.
- App pages: Workbench — navigation rail, dominant task surface, contextual detail.
- Reports and exports: Long Document — strong document hierarchy and quiet rules.

## Theme

Cobalt, adapted to DashboardOS and the bundled Geist family. Cobalt is the only
interaction accent and occupies no more than five percent of a viewport. Green,
amber, cyan, and red are reserved for semantic status. App UI does not use
gradients, glass effects, glow shadows, or rainbow navigation.

## Typography

- Display: Geist Sans, weight 650–700, normal style.
- Body: Geist Sans, weight 400–500.
- Mono/data: Geist Mono, weight 450–600.
- Display tracking: `-0.025em`.
- Data values use tabular numerals.
- Root body size remains 16px; density comes from component spacing.

## Spacing

Use the named four-point scale in `src/app/globals.css`. App surfaces should be
dense but breathable; avoid padding used only to make a component feel important.

## Motion

- `--ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Colour/opacity transitions: 140–180ms.
- Panel entrance: opacity plus transform only.
- Never animate width, height, top, left, margin, or padding.
- Reduced motion removes transforms and decorative animation.

## Microinteractions stance

- Focus is immediate and always visible.
- Success is silent when the result is already visible.
- Tooltips are delayed for hover and immediate for keyboard focus.
- Controls cover default, hover, focus, active, disabled, loading, error, and success.

## CTA voice

- Primary: solid cobalt, six-pixel radius, destination-specific label.
- Secondary: quiet bordered control.
- Destructive: red only at the final destructive action.
- No gradient, glow, or pill-shaped application CTAs.

## Per-page allowances

- Marketing may use one restrained real product visual, never redrawn browser chrome.
- App pages use no decorative enrichment; function carries the page.
- Reports use typography, rules, charts, and whitespace only.

## What pages MUST share

- DashboardOS wordmark treatment and cobalt interaction accent.
- Geist Sans and Geist Mono typography.
- Six-pixel control radius and eight-pixel major-surface radius.
- Hairline containment, quiet elevation, and single-line affordances.

## What pages MAY differ on

- Workbench density according to the task.
- Contextual detail may use an inspector, drawer, or inline disclosure.
- Chart palettes may expand only when data semantics require more series colours.

## Prohibited patterns

- Three equal icon-above-title feature cards.
- Cards nested only for decoration.
- Centred empty state with a gradient icon tile as the default solution.
- Uppercase eyebrow labels on every section.
- `transition-all`, animated layout dimensions, and hover-only actions.
- Literal colours added outside token blocks.
