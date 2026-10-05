# Wordinator visual redesign plan

## Status

- Program status: in progress
- Current milestone: Batch 7 complete on 2026-10-05
- Canonical visual rules: `docs/design-system.md`
- Original Phase 0 foundation tracking: `docs/design-system-plan.md`
- Baseline capture command: `CAPTURE_VISUAL_BASELINES=1 pnpm --filter @wordinator/web exec playwright test e2e/visual-baselines.spec.ts --project=chromium`

## Purpose

This plan evolves Wordinator from a coherent, friendly component-library aesthetic into a premium editorial product experience while preserving its identity as a cozy shared study journal.

The redesign must continue to use Mantine, CSS Modules, semantic CSS tokens, and the existing reusable UI layer. Tailwind examples from the visual-design skill are references for visual behavior, not authorization to introduce Tailwind. Product behavior, tenant boundaries, accessibility, localization, draft preservation, feed ordering, and responsive workflows must not change as a side effect of the redesign.

## Selected creative direction

### Vibe: Editorial Luxury

- Warm cream and softly varied paper surfaces.
- Deep espresso foreground rather than pure black.
- Muted coral, sage, yellow, and blue used as controlled accents.
- A license-approved variable serif for expressive page headings and short editorial moments.
- A geometric sans for interface text and authored content.
- DM Mono retained for compact metadata and post-type labels.
- A subtle, fixed paper-grain layer that does not repaint with scrolling.
- Fine translucent rings, inset highlights, and diffuse ambient shadows instead of heavy outlines and hard offset shadows.
- The dark counterpart is an editorial night palette: deep espresso-charcoal canvas, warm near-white type, restrained accents, and low-luminance layered surfaces. It must feel like the same tactile journal after dark, not a separate neon or generic OLED product.

### Layout: Editorial Split

- Wide page introductions use an asymmetric split between title/context and primary actions or supporting content.
- The feed remains a single ordered reading column so strict reverse chronology stays obvious.
- Supporting screens may use asymmetric grouped panels, but must not become generic equal-column grids.
- Below `768px`, all split layouts collapse to a single full-width column with compact page padding and generous vertical gaps.
- Full-height layouts use `min-height: 100dvh`, not `height: 100vh`.

## Current-state assessment

### Strengths to preserve

- The warm paper palette already fits Wordinator's product character.
- Primitive and semantic tokens are centralized in `apps/web/src/tokens.css`.
- Mantine is bridged through a centralized theme.
- Manrope and DM Mono are self-hosted rather than loaded from a tracking CDN.
- Shared primitives already cover buttons, surfaces, status panels, loading, empty states, dialogs, avatars, and labels.
- `/ui` provides a production-safe visual inventory.
- Focus visibility, practical touch targets, safe text wrapping, and reduced-motion handling have an established foundation.
- Mobile navigation, adaptive dialogs, and the centered reading column already reflect documented product behavior.

### Gaps relative to the new direction

- Thick dark outlines and hard offset shadows dominate nearly every component.
- Cards, inputs, dialogs, and panels are flat single-layer enclosures rather than nested physical surfaces.
- Page typography relies almost entirely on one sans-serif family and has limited editorial contrast.
- Section spacing is generally `32–48px`, leaving pages visually dense rather than cinematic and calm.
- The desktop shell is an edge-to-edge sticky bar with crowded text navigation.
- `/ui` uses a symmetrical auto-fit grid with equally weighted panels.
- Buttons lack pill geometry, internal icon islands, and refined hover/press choreography.
- Forms remain visually close to default Mantine controls.
- Motion is mostly limited to short button presses and a skeleton animation.
- Native browser `confirm()` is still used for destructive membership and group actions.
- Reactions, post actions, and metadata compete for attention in feed cards.
- The application does not yet have a consistent light-stroke icon language.

### Foundation defects to fix before visual migration

- `--space-5` is referenced but not defined, collapsing intended gaps in navigation, feed, discussion, notification, and floating-action layouts.
- `--z-content` is referenced but not defined.
- `--color-highlight-soft` is referenced but not defined.
- The loading animation uses `ease-in-out`, which conflicts with the new motion rules.
- Several feature styles use raw `font-weight: 700` or `800` rather than semantic weight tokens.

## Design principles

1. **Editorial before decorative.** Typography, proportion, hierarchy, and whitespace create the premium feeling; effects only reinforce them.
2. **Layer important surfaces.** Primary cards, composers, dialogs, and major forms use a double-bezel shell and inner core. Lightweight list rows remain visually quieter.
3. **Use accents sparingly.** Coral indicates primary action. Sage, yellow, and blue communicate support, selection, and information without turning pages into color grids.
4. **Protect reading order.** The feed remains a clear single column with strict reverse chronology. Asymmetry belongs in headers, supporting panels, and page composition.
5. **Motion communicates mass.** Movement uses custom curves, transform, and opacity. It should clarify entry, hierarchy, and state changes rather than decorate routine scrolling.
6. **Mobile is a deliberate composition.** Desktop asymmetry collapses cleanly; overlap, rotation, and nonessential decoration disappear below `768px`.
7. **Accessibility is non-negotiable.** New visual treatments preserve focus visibility, contrast, semantic structure, keyboard behavior, reduced motion, and `44px` touch targets.
8. **One system, not page-specific styling.** Shared tokens and components must be stable before feature pages are migrated.

## Target foundations

### Color

Refine the existing palette rather than replacing its identity:

- Page: warm cream with minimal tonal variation.
- Surface: soft ivory.
- Elevated surface: a slightly brighter paper tone.
- Muted surface: warm stone or parchment.
- Foreground: deep espresso.
- Muted foreground: warm taupe with sufficient contrast.
- Action: restrained coral.
- Support: desaturated sage.
- Highlight: muted ochre.
- Information: dusty blue.
- Danger and success: quieter surfaces paired with accessible dark foregrounds.
- Borders: translucent espresso hairlines and stronger focus/error roles, not one universal solid outline.

Add semantic roles for:

- outer bezel and inner core backgrounds;
- hairline, inner highlight, and strong separator;
- raised, floating, and overlay surfaces;
- navigation glass and overlay glass;
- subtle grain opacity;
- unread, selected, concealed, and pinned states.

### Typography

- Evaluate a license-approved, self-hosted variable serif for display headings.
- Keep Manrope initially for UI and authored text unless a tested replacement improves the system materially.
- Retain DM Mono for labels, post types, progress, and compact metadata.
- Introduce semantic type tokens for display, page title, section title, card title, body, authored content, metadata, eyebrow, and control label.
- Expand rare display headings beyond the current hero size while keeping mobile titles fluid and restrained.
- Prefer high-contrast size and family changes over excessive bold weights.

### Spacing and layout

- Add spacing values for `20`, `40`, `80`, `96`, `128`, and `160px` where the semantic scale requires them.
- Define semantic layout tokens for page gutters, section rhythm, card inset, shell clearance, and navigation offset.
- Use `80–160px` section rhythm on wide screens where content density permits it.
- Keep mobile page gutters near `16px` and vertical page rhythm near `32–48px`.
- Retain the `760px` reading measure for feed and long-form detail content.
- Allow wider editorial headers and settings/member compositions inside the `1200px` shell.

### Shape and elevation

- Increase major surface radii into the `28–36px` range.
- Define concentric outer and inner radii mathematically.
- Replace hard offset shadows with soft, layered ambient shadows.
- Use a faint outer ring and an inset top highlight for physical depth.
- Keep high-contrast borders for focus, validation, and intentionally tactile small controls only.
- Restrict decorative rotation to noninteractive accents and remove it on narrow viewports.

### Motion

- Define press, standard, reveal, and overlay durations.
- Use a shared physical curve such as `cubic-bezier(0.32, 0.72, 0, 1)`.
- Animate only `transform` and `opacity`.
- Use `IntersectionObserver` for entry reveals; do not attach scroll listeners.
- Avoid applying entrance animation repeatedly during feed refreshes or pagination.
- Apply backdrop blur only to fixed or sticky navigation and overlays.
- Preserve centralized `prefers-reduced-motion` behavior.

## Reusable component work

The reusable layer must be completed before feature pages are restyled.

### Surface

- Implement outer-shell and inner-core architecture.
- Support `default`, `quiet`, `featured`, `inset`, and `danger` treatments.
- Support normal and reading-density padding.
- Avoid giving every nested row full card elevation.

### Button and icon button

- Change primary actions to pill geometry.
- Add physical press scaling and refined hover movement.
- Support an optional trailing icon island for directional primary CTAs.
- Keep secondary, quiet, and destructive hierarchy clear.
- Adopt a consistent ultra-light icon set; do not use thick Lucide, FontAwesome, or Material icons.
- Preserve loading width and accessible labels.

### Forms

- Centralize text input, password, textarea, select, checkbox, radio, and file-input presentation.
- Add tonal outer shells, inset highlights, and calm focus transitions.
- Preserve visible labels; do not introduce floating labels.
- Make descriptions and validation messages visually distinct without relying on color alone.
- Verify long labels and translated copy.

### Page composition

Add reusable primitives for:

- editorial page header;
- section header;
- split hero layout;
- reading column;
- metadata row;
- action cluster;
- navigation item;
- mobile navigation item;
- reveal/stagger container.

### Dialogs and transient UI

- Apply double-bezel treatment to dialogs.
- Strengthen editorial title hierarchy and action placement.
- Add transform/opacity entry and exit choreography.
- Keep mobile dialogs full-screen where already documented.
- Replace every browser `confirm()` with `ConfirmDialog`.
- Align menus, popovers, and tooltips with the new hairline and elevation system.

### States

- Redesign empty, loading, error, success, connectivity, deleted-group, and restricted-member states.
- Keep one obvious recovery action.
- Use calm illustration-free composition unless a reusable visual language is explicitly developed.
- Replace the current `ease-in-out` skeleton animation with the shared custom curve.

## Application-shell redesign

### Desktop

- Replace the edge-to-edge bar with a detached floating navigation island.
- Keep the island within the wide shell with visible page background above and around it.
- Include brand, group switcher, primary destinations, profile utility, and a secondary menu for infrequent actions.
- Add light icons and active-route indicators.
- Keep group switching immediately available.
- Apply backdrop blur only while the fixed/sticky island is visible.
- Stagger initial navigation-item entry without replaying it on every route transition.

### Mobile

- Preserve the documented bottom navigation rather than forcing a hamburger menu.
- Present it as an inset floating dock with five concise destinations.
- Use icon plus short-label navigation items with a clear active state.
- Keep sign-out and infrequent utilities outside the primary dock.
- Maintain safe-area padding and composer/FAB clearance.
- Keep a compact top utility area for brand and group switching.

## Page-family migration

### Authentication and invitation

- Use an editorial split on wide screens: expressive introduction on one side and the focused form surface on the other.
- Replace the isolated decorative circle with a restrained language/journal motif built from reusable decorative elements.
- Collapse to a direct single-column form on mobile.
- Preserve all invitation, repeat-request, forced-password-change, and signed-in status behavior.

### Feed and group home

- Use a split group header with identity/context on one side and the create-group action on the other.
- Keep the post feed in a single centered reading column.
- Redesign the create-post prompt as a featured nested surface.
- Give post cards layered shells with a calmer internal hierarchy.
- Make authored text the visual focus.
- Reduce competition between author, type, timestamp, reactions, response counts, and management actions.
- Move edit/delete and other infrequent operations into a precise overflow menu where appropriate.
- Treat notes as inset paper annotations.
- Preserve newest-first order, pagination, newer-post reconciliation, concealment, and safe plain-text rendering.

### Composer

- Treat the composer as an editorial workspace rather than a generic modal form.
- Use a strong type selector, generous field rhythm, and a stable action area.
- Preserve independent per-type state, drafts, discard rules, validation, and full-screen mobile behavior.
- Use motion to clarify type changes without animating layout dimensions.

### Post detail, answers, and discussion

- Separate the post reading surface from the conversation surface through depth and spacing.
- Present concealed answers as a calm, intentional inset panel rather than a warning block.
- Improve reply hierarchy without relying only on a heavy vertical rule.
- Refine reaction pills and identity disclosure.
- Give the reading wizard a focused progress treatment and stable navigation.
- Preserve two-level discussions, direct-link reveal, pinning, matching, and draft behavior.

### Profiles and members

- Build a strong editorial identity header with avatar, name, role/status, and biography.
- Use asymmetric wide layouts for profile identity and post-history context.
- Turn member cards into quiet identity rows inside a larger nested surface.
- Visually separate active and former members without diminishing historical attribution.
- Keep membership-management actions secondary until explicitly invoked.

### Settings and group lifecycle

- Group settings into asymmetric, clearly titled panels.
- Separate routine personal settings from membership and destructive group operations.
- Give uploads and previews a purpose-built media surface.
- Make temporary passwords prominent, readable, and clearly one-time without using alarm styling.
- Replace native confirmations for leaving, removing members, and deleting groups.

### Notifications

- Use quiet list rows with tonal unread state, precise timestamps, and subtle separators.
- Avoid wrapping every notification in an independently elevated card.
- Keep mark-read actions subordinate to the notification destination.
- Preserve deleted-target destinations and restricted status notices.

### `/ui` workbench

- Replace the current symmetrical grid with an asymmetric editorial inventory.
- Show token foundations, typography, surface depth, motion, navigation, and responsive composition.
- Display real shared components in every important state.
- Add wide and narrow preview contexts.
- Include long labels, long authored text, loading, validation, destructive actions, and reduced-motion examples.
- Establish screenshot baselines only after the refreshed component language stabilizes.

## Delivery sequence

### Batch 1 — Specification and foundation repair

- [x] Update `docs/design-system.md` with the approved visual direction.
- [x] Add this redesign effort to `docs/index.md` and `docs/roadmap.md` when implementation begins.
- [x] Reconcile this plan with `docs/design-system-plan.md` so responsibilities are not duplicated.
- [x] Fix all undefined semantic tokens.
- [x] Inventory raw values, direct Mantine styling, native confirmations, and inconsistent component patterns.
- [x] Capture baseline wide and narrow screenshots for representative routes.

**Exit condition:** the intended visual system and migration boundary are documented, and current token defects no longer distort the UI.

### Batch 1 inventory snapshot

The initial scan identified the following migration targets. Line numbers will move as later batches edit the files; categories and owning batches are the durable record.

| Category | Current locations | Owning batch |
| --- | --- | --- |
| Undefined tokens | `--space-5`, `--z-content`, and `--color-highlight-soft` across phase page styles | Batch 1, repaired |
| Hard outlined/elevated feature surfaces | Post cards, discussion items, concealed answers, shell bars, member rows, notification rows, and workbench swatches | Batches 3–6 |
| Direct Mantine form imports | Phase One through Phase Five pages and `/ui` | Batch 3 shared form contracts, then Batches 5–6 migration |
| Native destructive confirmation | Group deletion, member removal, and leaving a group | Batch 6 |
| Raw numeric font weights | Shell, post cards, discussions, members, settings success/error text | Batches 2–6 |
| Raw component measurements | Foundation card clamp, workbench grid minimums/swatches, global minimum width/focus outline, UI status and skeleton sizes | Batches 2–3 |
| Flat page-local surface implementations | Composer fieldsets, post cards, discussion composers/items, concealed panels, reactions, member rows, and notifications | Batches 3–6 |
| Banned/default motion | Skeleton `ease-in-out`; otherwise insufficient entry and overlay choreography | Batches 2–3 and 7 |
| Symmetrical layout | `/ui` auto-fit equal-column inventory | Batch 3 |
| Edge-to-edge navigation | Desktop top bar and mobile full-width bottom bar | Batch 4 |

The inventory intentionally records direct Mantine imports as migration targets, not automatic violations. A Mantine primitive should be wrapped only when Wordinator adds an application-wide visual or behavioral contract.

### Batch 2 — Tokens, typography, and global canvas

- [x] Refine palette and semantic color roles.
- [x] Expand spacing, type, radius, elevation, layout, motion, and layer tokens.
- [x] Select, license-check, self-host, and document the display serif.
- [x] Update the Mantine theme bridge.
- [x] Add the fixed paper-grain treatment with reduced-motion/performance safeguards.
- [x] Validate contrast and font loading.

**Exit condition:** the new visual language is expressible entirely through documented semantic tokens.

### Batch 3 — Shared primitives and `/ui`

- [x] Rebuild surfaces with double-bezel architecture.
- [x] Rebuild buttons, icon buttons, and icon islands.
- [x] Rebuild form controls and form-state presentation.
- [x] Add page-header, section-header, split-layout, metadata, and navigation primitives.
- [x] Rebuild adaptive and confirmation dialogs.
- [x] Add reveal and stagger utilities.
- [x] Redesign `/ui` around the new system.
- [x] Add component, keyboard, focus, loading, disabled, and reduced-motion tests.

**Exit condition:** feature pages can be migrated without inventing new foundational presentation rules.

Completed on 2026-10-05. The reusable layer now provides concentric surface treatments, pill actions with optional directional icon islands, light-stroke shared icons, tonal form wrappers, editorial composition primitives, one-time intersection-observer reveals, stagger containers, and nested adaptive/confirmation dialogs. `/ui` is an asymmetric production-safe inventory covering tokens, typography, measurements, surface depth, actions, forms, state presentation, overlays, responsive previews, long content, and disabled/loading/error cases. Component tests cover semantics, loading, validation, keyboard-reachable cancellation, dismissal, and focus restoration; focused Playwright coverage passes in Chromium and WebKit for direct access, keyboard operation, narrow full-screen dialogs, overflow, and reduced motion.

### Batch 4 — Application shell

- [x] Implement the floating desktop navigation island.
- [x] Implement active-route and icon treatment.
- [x] Redesign the group switcher.
- [x] Implement the floating mobile navigation dock and safe-area behavior.
- [x] Verify content clearance for the shell, overlays, floating actions, and mobile keyboard.
- [x] Add desktop/mobile shell coverage in Chromium and WebKit.

**Exit condition:** all authenticated pages use the new shell without losing navigation clarity or group access.

Completed on 2026-10-05. Authenticated routes now share a detached, sticky double-bezel navigation island with a glass core, exact active-route semantics, a light-stroke icon vocabulary, an always-visible tonal group switcher, and a separate account utility for profile, settings, and sign-out. Below `48em`, the shell collapses to a compact brand/switcher utility island and an inset five-destination dock with safe-area-aware content and floating-action clearance. Chromium and WebKit coverage verifies desktop detachment, mobile inset geometry, group access, route state, five destinations, horizontal overflow, and a short `390 × 500` viewport representing keyboard-constrained space.

### Batch 5 — Core journal experience

- [x] Migrate the group header and create-post prompt.
- [x] Migrate feed cards and pagination/newer-post controls.
- [x] Migrate the composer.
- [x] Migrate post detail, concealment, discussions, replies, reactions, pinning, and reading wizard.
- [x] Verify draft preservation, strict ordering, direct links, overflow handling, and narrow layouts.

**Exit condition:** the primary journal experience expresses the full new design language without product-behavior regressions.

Completed on 2026-10-05. The journal now opens with the shared editorial page header and a featured create-post prompt, then keeps its strict reverse-chronology reading column through concentric feed cards, quieter metadata and actions, refined new/older-post controls, and an observer-driven floating create action. Composition and response flows use the shared tonal field wrappers; post detail, spoiler concealment, discussion threads, nested replies, reaction chips, pinned answers, and the reading wizard use the same layered paper language without changing permissions or workflow. Focused Chromium and WebKit coverage verifies newest-first placement, long authored-text containment at `390px`, and the edge-to-edge mobile composer in addition to the existing draft, direct-link, concealment, response, reaction, reply, and pinning suites.

### Batch 6 — Supporting page families

- [x] Migrate authentication, invitation, and membership-status screens.
- [x] Migrate profiles and member directory.
- [x] Migrate settings, uploads, password regeneration, and group lifecycle.
- [x] Migrate notifications and restricted/deleted states.
- [x] Remove native `confirm()` usage.

**Exit condition:** every production route uses the refreshed system and shared confirmation behavior.

Completed on 2026-10-05. Authentication, invitation, forced-password, and membership-status experiences now use the responsive editorial split with a restrained journal motif, featured nested form surface, and shared tonal controls. Profiles, the member directory, settings, media uploads, temporary-password display, deleted-group restoration, and notification lists now use asymmetric compositions, editorial headers, nested hierarchy, quiet rows, and semantic unread, former-member, and destructive states. Member removal, group leaving, and recoverable group deletion use the shared adaptive `ConfirmDialog`; no native browser confirmation remains. Focused component tests cover cancellation without mutation, and the Chromium and WebKit invitation, profile/settings, membership, temporary-password, leave, deletion, and restoration flows pass at the production routes.

### Batch 7 — Motion and light-theme consistency gate

- [x] Apply restrained entry choreography and internal hover/press physics.
- [x] Remove remaining banned easing, harsh shadows, generic borders, and unapproved icon styles.
- [x] Audit transform/opacity-only animation and blur placement.
- [x] Audit `390px`, `768px`, and `1440px` layouts.
- [x] Test long localized labels and authored-content overflow.
- [x] Run typechecking, Vitest/component tests, Playwright in Chromium and WebKit, and the production web build.
- [x] Add stable light-theme visual regression baselines.
- [x] Update design-system, plan, and roadmap status for the completed light-theme migration.

**Exit condition:** the light theme is visually coherent across the entire application, responsive, accessible, performant, documented, and protected by appropriate verification; this stable semantic-token baseline is ready for dark-theme mapping without page-specific redesign.

Completed on 2026-10-05. Production page families and shared surfaces now use restrained one-time entry choreography backed by the central physical easing and disabled under reduced motion; existing button, icon-island, navigation, reaction, and disclosure interactions preserve transform-only hover and press feedback. Repeated translucent ink washes were promoted to semantic tokens, while the audit confirmed approved diffuse shadows, semantic hairlines, `1.25px` line icons, transform/opacity-only authored keyframes, and blur confined to sticky or fixed navigation. A new browser gate injects exceptionally long localized labels and unbroken authored content and proves containment at `390px`, `768px`, and `1440px`. Deterministic Chromium baselines now protect authentication, `/ui`, and the signed-in journal, while the complete Chromium/WebKit suite, workspace TypeScript check, 18 component tests, and production web build pass.

### Batch 8 — Dark mode and dual-theme release gate

Dark mode extends the completed editorial system after Batch 7; it does not run in parallel with unfinished page-family migration. Light remains a first-class theme, and both themes must use the same component structure, spacing, typography, hierarchy, motion, and responsive behavior.

- [x] Audit every production route, shared primitive, feature component, overlay, transient state, illustration-free decoration, and inline/SVG icon for light-only colors, opacity assumptions, and shadows that bypass semantic tokens.
- [x] Define and document a dark primitive palette plus dark mappings for every existing semantic surface, foreground, hairline, separator, action, feedback, focus, overlay, glass, and interaction-state role; do not create page-specific dark values.
- [x] Preserve the Editorial Luxury character with warm charcoal/espresso depth, softly differentiated nested surfaces, warm near-white foregrounds, restrained coral/sage/ochre/blue accents, and subtle grain. Avoid pure-black expanses, glowing neon accents, generic white borders, and harsh black shadows.
- [x] Re-tune double-bezel shells, inset highlights, diffuse elevation, navigation glass, dialogs, menus, tooltips, concealed answers, unread/selected/pinned states, skeletons, and disabled controls so hierarchy remains legible without turning every edge into a bright outline.
- [x] Add a three-way `system` / `light` / `dark` preference using Mantine's color-scheme integration. Default to `system`, persist an explicit choice per browser, respond to operating-system changes while `system` is active, and avoid API, account, or database changes.
- [x] Apply the resolved scheme before the first painted application frame to prevent a light flash in dark mode, and keep the document color-scheme, browser chrome/theme color, Mantine provider, and CSS semantic-token scope synchronized.
- [x] Add a keyboard-operable, screen-reader-labelled theme control to the shared account/settings utility at desktop and mobile sizes. Its label and state copy must use i18next keys and remain understandable without relying on sun/moon icons alone.
- [x] Extend `/ui` with a theme foundation section, the real preference control, and deterministic light/dark preview contexts that render the actual exported components and representative feature states. Include surfaces, all action variants, forms, overlays, focus/error/disabled/loading states, navigation, long authored content, and wide/narrow compositions in both themes.
- [x] Verify user images, avatars, group icons, and uploaded media are not globally filtered or dimmed; only their surrounding chrome changes scheme.
- [x] Validate WCAG-oriented contrast for text, focus, validation, selected/unread/concealed states, and accent-on-surface pairs in both themes, including forced-colors and reduced-motion behavior.
- [x] Add component tests for preference selection and persistence, system-preference changes, accessible control state, and scheme propagation. Add Chromium/WebKit checks for no-flash startup, refresh persistence, wide/narrow `/ui` demos, overlays, browser chrome metadata, overflow, and all representative production routes in light and dark modes.
- [x] Capture stable light and dark screenshot baselines only after the dual-theme inventory is complete, then run typechecking, Vitest/component tests, Playwright, and the production web build.
- [x] Update `docs/design-system.md`, this plan, `docs/design-system-plan.md`, and `docs/roadmap.md` with the shipped dual-theme contract and completion status.

**Exit condition:** system, light, and dark preferences resolve without first-paint flashing; every production route and `/ui` demonstrate one coherent editorial system in both themes; no component depends on light-only raw color assumptions; and dual-theme accessibility, responsive, browser, visual-regression, and build gates pass.

Completed on 2026-10-05. A single semantic token system now maps to warm paper light and charcoal/espresso dark palettes. The browser-local system/light/dark preference resolves in the document head before application startup, follows operating-system changes in system mode, persists explicit choices, and synchronizes Mantine, document `color-scheme`, and browser theme metadata. The shared localized control ships in Settings and `/ui`, which now contains deterministic light/dark component contexts. Component coverage and the Chromium/WebKit dual-theme gate protect accessible state, persistence, representative routes, overlays, containment, semantic contrast, forced colors, reduced motion, unfiltered media, and stable light/dark `/ui` plus dark journal baselines.

## Verification matrix

Every implementation batch should verify the relevant subset of:

- TypeScript typechecking.
- Shared component and React Testing Library tests.
- Keyboard activation and focus restoration.
- Reduced-motion behavior.
- Contrast and visible focus.
- Long labels and unbroken authored text.
- Narrow and wide responsive behavior.
- Chromium and WebKit critical paths.
- Production web build.
- Visual screenshots after the system stabilizes.
- Light, dark, and system-resolved color schemes after Batch 8 begins.

The final manual visual review must cover:

- sign-in and invitation;
- forced password change and membership status;
- desktop and mobile application shell;
- empty and populated feed;
- all four post types;
- composer and saved drafts;
- post detail and concealed/revealed answers;
- discussions, replies, reactions, and pinning;
- member directory and former members;
- profile and profile-post list;
- settings, uploads, temporary password, group deletion, and restoration;
- notifications, restricted notices, loading, connectivity, failure, and empty states;
- `/ui` at wide and narrow sizes in both light and dark themes.

## Non-goals and constraints

- Do not introduce Tailwind.
- Do not change API behavior, database schemas, authorization, feed ranking, or product workflows solely for visual reasons.
- Do not begin dark-mode implementation before the Batch 7 light-theme consistency gate; Batch 8 maps the stable system rather than masking unfinished light-theme migrations.
- Do not replace the light theme, make dark mode account- or group-scoped, or add server persistence solely for theme preference.
- Do not add analytics, tracking, gamification, AI features, rich text, or new feed filtering.
- Do not use remote font CDNs.
- Do not apply backdrop blur to scrolling content.
- Do not animate layout properties such as width, height, top, or left.
- Do not sacrifice accessible contrast or visible focus for subtlety.
- Do not place every list row inside a visually heavy card; depth must communicate hierarchy.

## Definition of done

The redesign is complete when:

- all production routes use the refreshed shared design system;
- the desktop shell is a detached floating navigation island and mobile navigation remains a refined accessible dock;
- primary surfaces use consistent nested architecture;
- typography, spacing, elevation, icons, and motion follow the documented direction;
- no undefined design tokens remain;
- no native destructive confirmation remains;
- no banned font, icon, border, shadow, layout, or easing pattern remains;
- asymmetric layouts collapse cleanly below `768px`;
- reduced-motion behavior is complete;
- light and dark modes preserve the same editorial identity, hierarchy, component structure, and responsive behavior;
- system, light, and dark preferences resolve before first paint and persist according to the documented browser-local contract;
- `/ui` accurately inventories the production components and states and provides deterministic wide/narrow demonstrations in both themes;
- relevant typecheck, unit/component, Playwright, and production-build gates pass;
- `docs/design-system.md`, `docs/design-system-plan.md`, `docs/index.md`, and `docs/roadmap.md` describe the shipped result.
