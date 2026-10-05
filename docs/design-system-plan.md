# Design system implementation plan

This document tracks the phase 0 work needed to turn Wordinator's existing visual direction into a reusable frontend system. [design-system.md](design-system.md) remains the source of truth for canonical visual values and component character; this file owns implementation order, deliverables, and completion criteria.

The plan deliberately establishes reusable foundations before feature-heavy pages are built. Domain components remain in the roadmap phase that introduces their behavior.

## Relationship to the premium visual refresh

This plan remains the historical owner for the original Phase 0 design-system foundation. The cross-phase [visual redesign plan](../VISUAL-REDESIGN-PLAN.md) is the successor for the approved Editorial Luxury and Editorial Split refresh. It does not reopen completed DS-01 through DS-06 work; it evolves those foundations through explicit token, primitive, shell, feature-page, and verification batches.

Outstanding DS-07 through DS-10 work is coordinated through the successor plan rather than duplicated here:

- dialog completion and native-confirmation removal map to redesign Batches 3 and 6;
- the complete `/ui` inventory maps to redesign Batch 3;
- keyboard, focus, responsive, and visual verification map to redesign Batches 3, 7, and 8;
- final design-system documentation and Phase 0 closure remain tracked here and in the roadmap.

Redesign Batch 2 completed on 2026-10-04. It supersedes the original DS-03 through DS-05 visual values with the documented Editorial Luxury palette, Newsreader display typography, expanded semantic scales, global paper canvas, and updated Mantine bridge; the completion state of those original foundation tasks remains historical rather than reopened.

Redesign Batch 3 completed on 2026-10-05. It closes the remaining shared-component, overlay, workbench, accessibility, responsive, and production-build gates in DS-07 through DS-10. Domain feature showcases remain a rolling inventory owned by the later page-family redesign batches; they do not reopen the Phase 0 shared foundation.

Redesign Batch 4 completed on 2026-10-05. It migrates every authenticated route to the detached desktop navigation island and inset mobile dock, including route-aware icon treatment, the group switcher, account utilities, shared clearance tokens, and focused Chromium/WebKit shell coverage. This is application-shell adoption of the completed foundation rather than a reopening of DS-01 through DS-10.

Redesign Batch 5 completed on 2026-10-05. It migrates the group journal header, create prompt, feed cards and controls, composition surfaces, post detail, spoiler concealment, discussions, replies, reactions, pinning, and reading wizard onto the shared editorial contracts. It also replaces the feed scroll listener with an observer-driven floating action, applies shared field wrappers to journal writing flows, hardens the edge-to-edge mobile dialog contract, and adds focused Chromium/WebKit ordering and overflow coverage. This remains feature adoption of the completed foundation rather than a new Phase 0 workstream.

Redesign Batch 6 completed on 2026-10-05. It adopts the shared form, composition, surface, state, and adaptive-confirmation contracts across authentication, invitations, membership status, profiles, members, settings, uploads, group lifecycle, and notifications. Native browser confirmation is removed. This remains feature-page adoption of the completed foundation rather than a new Phase 0 workstream.

Redesign Batch 7 completed on 2026-10-05. It stabilizes light-theme motion across production page families, promotes remaining repeated ink washes to semantic tokens, audits easing, animation properties, blur placement, shadows, hairlines, and icon stroke, and adds long-label/authored-content containment checks at `390px`, `768px`, and `1440px`. Deterministic Chromium authentication, `/ui`, and journal screenshots now complement the Chromium/WebKit structural and behavioral suite. This closes the light-theme consistency gate without reopening DS-01 through DS-10.

Redesign Batch 8 completed on 2026-10-05. It adds the centralized warm-charcoal dark mapping, browser-local system/light/dark preference with pre-paint resolution, synchronized Mantine/document/browser-chrome state, a shared accessible Settings control, deterministic dual-theme `/ui` contexts, and component plus Chromium/WebKit release coverage for persistence, system changes, routes, overlays, contrast, forced colors, media, overflow, and visual baselines. It does not reopen the original Phase 0 completion status or create a second component system.

When the two plans appear to overlap, this file owns the original Phase 0 completion status, [design-system.md](design-system.md) owns canonical visual rules, and the visual redesign plan owns refresh sequencing and acceptance criteria.

## Completion criteria

The phase 0 design-system work is complete when:

- CSS custom properties provide the canonical primitive and semantic tokens used by application components.
- Applicable tokens are mapped into the Mantine theme without a second independent source of values.
- Fonts and global styles behave consistently without relying on fonts installed on a user's device.
- The initial reusable component set covers actions, forms, surfaces, feedback, loading, and overlays.
- `/ui` provides a safe, static showcase of every exported reusable component and its important states.
- Components preserve visible focus, keyboard operation, sensible contrast, reduced-motion behavior, and practical touch targets.
- Component tests cover shared interaction and accessibility contracts.
- Playwright verifies the `/ui` route at wide and narrow viewports in Chromium and WebKit.
- The foundation health screen uses the reusable system rather than private copies of shared patterns.

## Working rules

- Use Mantine for accessible primitives and CSS Modules for Wordinator-specific presentation.
- Wrap a Mantine component only when Wordinator adds a meaningful visual or behavioral contract.
- Put all visible showcase and component copy behind i18next keys.
- Keep `/ui` independent of real accounts, API records, credentials, or privileged operations.
- Add a reusable component to `/ui` in the same change that introduces it.
- Demonstrate default, hover/focus where practical, pressed or selected, disabled, loading, and error states where they apply.
- Implement feature states in their owning roadmap phases. Phase 5 audits and hardens them rather than introducing them for the first time.

## DS-01 — Document the component contract

- [x] Expand [design-system.md](design-system.md) with the distinction between primitive and semantic tokens.
- [x] Define the required shared component states: default, hover, focus, pressed or selected, disabled, loading, and error.
- [x] Define baseline keyboard, contrast, reduced-motion, content-overflow, and touch-target expectations.
- [x] Define what belongs in the reusable UI layer and what remains a feature component.
- [x] Establish `/ui` as the canonical visual inventory.

**Done when:** the design-system specification is sufficient to review a new component without inventing its foundational rules during implementation.

## DS-02 — Add routing and the `/ui` route

- [x] Add the documented TanStack Router foundation and generated, type-safe route setup.
- [x] Preserve `/` as the platform foundation/health screen.
- [x] Add `/ui` as a directly addressable route outside normal application navigation.
- [x] Keep `/ui` safe to ship by using static fixtures only.
- [x] Verify direct navigation and Workers Static Assets SPA fallback.

`/ui` should remain available in production so it can support deployment and browser QA. It must not expose application data or administrative operations.

**Done when:** `/ui` renders after direct navigation and refresh in development, preview, and the production build configuration.

## DS-03 — Complete the token architecture

- [x] Retain a primitive palette for paper, ink, coral, mint, yellow, and blue.
- [x] Add semantic tokens for page, surface, foreground, muted foreground, borders, actions, feedback, focus, and overlay roles.
- [x] Add interactive-state tokens for hover, active, disabled, and selected states.
- [x] Tokenize the documented typography sizes, weights, and line heights.
- [x] Tokenize content widths, control heights, breakpoints, and minimum touch targets.
- [x] Add a small layering/z-index scale for navigation, floating actions, overlays, and transient UI.
- [x] Preserve the existing spacing, radius, shadow, and motion scales.
- [x] Remove duplicated raw values from the Mantine theme and component styles where a token exists.

**Done when:** application components can choose semantic roles without selecting raw palette colors or repeating documented measurements.

## DS-04 — Establish typography and global styles

- [x] Confirm licensing and self-host Manrope and DM Mono, or revise the canonical stacks to intentional available fallbacks.
- [x] Add font-face declarations and appropriate loading behavior when fonts are self-hosted.
- [x] Apply the canonical body background, foreground, typography, and text rendering.
- [x] Define selection styling and safe wrapping for authored content and links.
- [x] Extend visible focus treatment across interactive elements, including form controls.
- [x] Preserve centralized reduced-motion behavior.

**Done when:** typography does not depend on local font installation, authored content cannot cause accidental horizontal overflow, and keyboard focus remains visible.

## DS-05 — Complete the Mantine theme bridge

- [x] Map colors, spacing, radii, shadows, breakpoints, font sizes, headings, and control heights into the theme where applicable.
- [x] Configure primary foreground contrast so coral actions use ink rather than low-contrast white text.
- [x] Establish shared defaults and styles for Button, ActionIcon, inputs, Modal, Menu, Popover, Tooltip, Badge, Alert, and Avatar.
- [x] Align overlays, disabled states, and focus presentation with the canonical tokens.
- [x] Keep explicit component props able to override defaults when a feature requires it.

**Done when:** unwrapped Mantine primitives begin from a safe Wordinator baseline and do not visually conflict with the documented component character.

## DS-06 — Build the first reusable component set

- [x] Button variants: primary, secondary, quiet, and danger.
- [x] Icon button.
- [x] Surface/card.
- [x] Page container and reading column.
- [x] Label chip.
- [x] Avatar with fallback initials.
- [x] Status panel/alert.
- [x] Empty state.
- [x] Error state.
- [x] Loading state and skeleton patterns.
- [x] Shared form help and validation-message pattern.

**Done when:** the foundation health screen can be expressed without private implementations of shared card, label, action, status, or layout patterns.

## DS-07 — Build overlay and confirmation patterns

- [x] Standard dialog.
- [x] Adaptive dialog that becomes a full-screen surface at the documented narrow breakpoint.
- [x] Destructive and recoverable confirmation dialog.
- [x] Shared menu, popover, and tooltip treatment.
- [x] Verify Escape behavior, initial focus, focus restoration, scroll locking, and long-content handling.

**Done when:** desktop and mobile overlay behavior is consistent, showcased, and keyboard-tested before feature dialogs and the post composer depend on it.

## DS-08 — Build the `/ui` workbench

The page showcases the actual exported components, not separate visual recreations.

- [x] Foundations: colors and roles, typography, spacing, radii, borders, shadows, motion, and responsive containers.
- [x] Actions: every button and icon-button variant, size, loading state, and disabled state.
- [x] Forms: text, password, textarea, select, checkbox, and radio controls with help, required, validation, and disabled states.
- [x] Feedback: alerts, status panels, loading, empty, error, success, and connectivity-required states.
- [x] Data display: surfaces/cards, chips, avatars, metadata, and timestamps.
- [x] Overlays: dialogs, confirmations, menus, popovers, and tooltips.
- [x] Provide wide and narrow preview contexts.
- [x] Include long labels, long authored content, and other stress cases.
- [ ] Add feature-component sections as later phases introduce them.

Feature-component growth follows the delivery roadmap:

- Phase 1: application shell, group switcher, desktop navigation, mobile navigation, and authentication/status patterns.
- Phase 2: directly linked current-member profiles with fallback initials, profile post list shell, settings patterns, and group rename.
- Phase 3: post cards, post-type labels, composer, drafts, floating create action, and pagination controls.
- Phase 4: concealment panels, discussions, replies, reading wizard, progress, answer sets, reactions, and pin states.
- Phase 5: member directory, former-member presentation, membership administration and lifecycle states, group deletion/restoration, and image upload/crop UI.
- Phase 6: notification rows and final cross-application state hardening.

**Done when:** every exported reusable component appears on `/ui` using i18next-backed copy and representative interaction states.

## DS-09 — Add design-system verification

- [x] Test accessible names and semantic roles with React Testing Library.
- [x] Test keyboard activation and focus behavior.
- [x] Test loading and disabled contracts.
- [x] Test form error associations.
- [x] Test dialog dismissal and focus restoration.
- [x] Add Playwright coverage for direct `/ui` navigation.
- [x] Exercise wide and narrow viewports in Chromium and WebKit.
- [x] Assert that showcase content has no unintended horizontal overflow.
- [x] Decide whether stable showcase sections should use screenshot baselines and document the decision.

**Done when:** shared behavior is protected by focused component tests and a small cross-browser `/ui` suite.

## DS-10 — Migrate the foundation screen and close the phase

- [x] Rebuild the existing foundation health screen with reusable components.
- [x] Remove superseded private copies of shared styles.
- [x] Run web type-checking and relevant Vitest/component tests.
- [x] Run the `/ui` Playwright suite in Chromium and WebKit.
- [x] Run the production web build.
- [x] Update this plan, [design-system.md](design-system.md), and [roadmap.md](roadmap.md) to reflect completion.

**Done when:** application code, the showcase, tests, and documentation all consume and describe the same design-system foundation.

Completed on 2026-10-05 as part of visual-redesign Batch 3. The shared foundation and production-safe workbench are complete. The feature-component section list above remains a rolling inventory that later redesign batches extend when those domain page families migrate; it does not reopen the Phase 0 shared-component foundation.

## Recommended implementation batches

1. **Foundation contract:** DS-01 through DS-05.
2. **Reusable primitives:** DS-06 and DS-07, developed through `/ui`.
3. **Verification and adoption:** DS-08 through DS-10.
