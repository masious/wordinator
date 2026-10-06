# Design system

Wordinator’s interface is a cozy shared study journal: warm, modern, quietly playful, and personal. It should resemble tactile stationery and an editorial workbook, not a competitive learning dashboard.

This file owns canonical design values. Define these as CSS custom properties and map applicable values into the Mantine theme. Components must consume semantic tokens rather than repeat raw values. Changing a token requires updating this document.

## Approved visual direction

The premium visual refresh uses **Editorial Luxury** as its texture archetype and **Editorial Split** as its primary layout archetype. It deepens the existing stationery direction rather than replacing it: warm paper, espresso ink, restrained coral and sage accents, expressive editorial typography, large spatial pauses, nested physical surfaces, and deliberate transform-and-opacity motion.

Wide page introductions may split context and actions asymmetrically. The feed itself remains a single ordered reading column so strict reverse chronology is always obvious. Supporting pages may use asymmetric grouped panels, but generic equal-column dashboard grids are not part of the visual language. Below `48em`, asymmetric compositions collapse to a single full-width column, decorative overlap or rotation disappears, and page gutters remain practical for touch use.

The examples in the visual-design skill are conceptual. Wordinator continues to use Mantine and CSS Modules; Tailwind is prohibited. The documented mobile bottom navigation, always-available group switcher, accessible focus treatment, plain-text content (course lessons excepted, see [courses](courses.md#lesson-documents)), and reduced-motion behavior take precedence over generic archetype examples.

The refresh was delivered through [the visual redesign plan](../VISUAL-REDESIGN-PLAN.md). Batches 2 through 7 established and migrated the editorial foundation, shared components, application shell, production page families, and stable light-theme gate. Batch 8 completed the dark mapping and dual-theme release gate without page-specific redesign. The following rules govern the shipped system:

- Major cards, composers, dialogs, and focused forms gain a subtle outer bezel and distinct inner core. Lightweight list rows remain quieter so depth communicates hierarchy.
- Fine translucent rings, inset highlights, and diffused ambient shadows replace universal dark outlines and hard offset shadows.
- Primary actions become generous pills and may use a nested trailing icon island when direction or progression benefits from an icon.
- Newsreader Variable is the self-hosted display serif for expressive headings; Manrope remains the interface and authored-text family.
- Page and section rhythm grows substantially on wide screens without weakening information density on mobile.
- Entry, overlay, hover, and press motion uses centralized custom cubic-bezier curves and only animates `transform` and `opacity`.
- Backdrop blur is limited to fixed or sticky navigation and overlays. Paper grain is rendered as a single fixed, pointer-free layer and is disabled for print and forced-colors mode.
- Icons use a consistent ultra-light line vocabulary. Thick Lucide, FontAwesome, and Material icon styles are excluded.
- Authenticated desktop navigation uses a detached sticky island with a tonal bezel and glass core. The account menu (avatar trigger, every size) holds a compact identity row (`40px` avatar, name, My profile), the group switcher as a menu section listing active groups with their icon and a check on the current one, Create a group, Settings, and Sign out. Create a group opens the shared adaptive dialog from any route. Primary destinations remain visually quiet and show an icon plus exact active-route state.
- Below `48em`, the header becomes a slim `56px` bar (brand mark, current group name, account avatar) and the primary navigation becomes a four-slot dock: Journal, Courses, Notices, and More. More opens a bottom sheet with Members, My profile, Settings, Create a group, and Sign out, and is marked current when the route belongs to it. The dock height, offset, safe-area inset, page padding, and floating-action clearance derive from shared shell tokens so content and controls remain reachable in short or keyboard-constrained viewports.
- Authentication and invitation routes use an editorial split above `48em` and a direct single-column composition below it. Supporting authenticated pages use asymmetric identity, settings, and directory compositions on wide screens, collapse to one column on narrow screens, and keep notifications as quiet separated rows rather than independent elevated cards.
- Destructive membership and group-lifecycle operations use the shared adaptive confirmation dialog. Native browser confirmation is not part of the application interaction language.
- The journal header uses the editorial page-header contract above `48em`. Below `48em` the journal hero (group title, intro, Create a group) is dropped: the group name is shown in the header and kept as a visually hidden `h1`, and Create a group lives in the account menu and the More sheet.
- The journal opens with a one-line create prompt row at every size: a pill-shaped `--color-core` button with the member's avatar and the muted "Write something…" placeholder in the `--type-post-body` role, at least `--touch-target` tall. It replaces the former featured create card.
- Feed cards, composition forms, concealed-answer state, response composers, and top-level discussion items use concentric surfaces; nested replies and authored-content rows remain quieter. Feed metadata uses the mono role, authored text uses the reading role, and reactions use hairline pill controls rather than strong system borders.
- The floating journal create action is driven by an `IntersectionObserver` attached to the prompt row, not a scroll listener; it appears only after the prompt row scrolls away. Mobile composition and reading surfaces occupy the full viewport after their transform-based entry transition settles.

## Token architecture

Primitive tokens are fixed visual ingredients and use the `--palette-*` namespace. Semantic tokens describe a role, such as `--color-page`, `--color-action`, `--color-danger-surface`, or `--color-focus`. Application and reusable-component styles consume semantic roles; primitives are used only to define those roles or to document the palette in `/ui`.

Typography, spacing, radii, shadows, motion, content widths, control heights, minimum touch targets, breakpoints, and layer order are centralized alongside color in `tokens.css`. Mantine maps applicable theme fields back to these custom properties instead of maintaining a second independent set of values. Explicit component props may override theme defaults when a feature has a documented reason.

## Color tokens

Values may be tuned against real screens, but changes must remain centralized. Light is the default mapping when JavaScript or browser storage is unavailable; the pre-paint bootstrap resolves the stored or system preference before the application module loads.

| Primitive | Value | Default semantic role |
| --- | --- | --- |
| `--palette-paper` | `#F5EDE2` | `--color-page` |
| `--palette-paper-deep` | `#EADFCE` | bottom of the global paper wash |
| `--palette-surface` | `#FFFAF2` | `--color-surface` |
| `--palette-surface-raised` | `#FFFDF8` | `--color-surface-raised`, `--color-core` |
| `--palette-surface-muted` | `#EEE5D8` | `--color-muted`, `--color-disabled` |
| `--palette-ink` | `#2D2622` | `--color-foreground`, `--color-action-text` |
| `--palette-ink-muted` | `#6F6259` | `--color-foreground-muted` |
| `--palette-coral` | `#E9826D` | `--color-action` |
| `--palette-sage` | `#A9C8B4` | `--color-support` |
| `--palette-ochre` | `#E7BD62` | `--color-highlight` |
| `--palette-blue` | `#A8C8DF` | `--color-info` |
| `--palette-danger` | `#B9534C` | `--color-danger` |
| `--palette-success` | `#3F775A` | `--color-success` |
| `--palette-focus` | `#315F8A` | `--color-focus` |

The dark primitives preserve the same roles and hierarchy:

| Primitive | Dark value |
| --- | --- |
| `--palette-paper` / `--palette-paper-deep` | `#1C1715` / `#120F0E` |
| `--palette-surface` / `--palette-surface-raised` / `--palette-surface-muted` | `#251F1C` / `#2D2521` / `#38302B` |
| `--palette-ink` / `--palette-ink-muted` | `#F6EADC` / `#C6B5A8` |
| `--palette-coral` / hover / active | `#F09A87` / `#F5AA99` / `#D98270` |
| `--palette-sage` / soft | `#92B99E` / `#30443A` |
| `--palette-ochre` / soft | `#D8AD58` / `#493B25` |
| `--palette-blue` / soft | `#8DB6D0` / `#293D49` |
| `--palette-danger` / surface / text | `#EF938B` / `#512C29` / `#FFD9D5` |
| `--palette-success` / surface | `#86C79E` / `#294435` |
| `--palette-focus` | `#9BCDF4` |

Surface roles include `--color-bezel`, `--color-core`, `--color-hairline`, `--color-inner-highlight`, `--color-separator`, `--color-navigation-glass`, `--color-overlay`, and `--color-overlay-glass`. State roles include hover, active, disabled, unread, selected, concealed, and pinned. Compatibility aliases using the former paper, ink, mint, yellow, and blue names remain temporarily for migration; new component code must use semantic roles.

Accent colors should usually appear as backgrounds paired with the scheme's high-contrast foreground, not as low-contrast body text. Dark mode remaps the same semantic roles instead of adding page-specific branches. Its warm charcoal canvas, espresso surfaces, warm near-white text, restrained accents, lower-opacity inset highlights, and warm diffuse shadows preserve the light theme's hierarchy without pure-black expanses or generic bright borders. Body, muted, action, danger, selected, and focus pairs are browser-tested in both schemes; their audited contrast ratios meet the applicable `4.5:1` text or `3:1` focus threshold.

## Theme preference contract

Theme preference is browser-local and intentionally independent of accounts, groups, the API, and the database. The storage key is `wordinator:color-scheme`; explicit values are `light` and `dark`, while a missing value or Mantine's internal `auto` value means the user-facing `system` preference. System is the default and continues to respond to `prefers-color-scheme` changes.

The inline head bootstrap resolves the scheme before first paint and sets `data-mantine-color-scheme`, the document `color-scheme`, and `<meta name="theme-color">`. Mantine's local-storage manager owns subsequent preference updates, and the runtime synchronizer keeps browser chrome metadata aligned with the resolved scheme. The shared labelled segmented control appears in Settings at desktop and mobile sizes and in `/ui`; its text state remains understandable without icon interpretation. Global styles never filter or dim uploaded images, avatars, or group icons.

## Typography

Self-host font assets where licensing permits; do not add a tracking font CDN.

| Token | Stack | Use |
| --- | --- | --- |
| `--font-sans` | `"Manrope Variable", Manrope, system-ui, sans-serif` | UI and authored content |
| `--font-display` / `--font-serif` | `"Newsreader Variable", Newsreader, Georgia, serif` | Display, page, and section headings; short editorial accents |
| `--font-mono` | `"DM Mono", ui-monospace, monospace` | Labels, post types, compact metadata |

Manrope, Newsreader, and DM Mono are distributed under the SIL Open Font License 1.1. The web package self-hosts their Fontsource assets with `font-display: swap`; no font request is made to a tracking CDN and primary typography does not depend on fonts installed on the user's device. Newsreader ships normal and italic variable files and uses optical sizing.

The base scale runs from `0.75rem` through `3rem`. Semantic roles are `--text-display`, `--type-page-title`, `--type-section-title`, `--type-card-title`, `--type-body`, `--type-authored`, `--type-metadata`, `--type-eyebrow`, and `--type-control-label`. Display text reaches `clamp(3.25rem, 8vw, 6.75rem)` only in rare expressive moments; page and section headings use smaller responsive clamps. Body line height is `1.65`, compact labels use `1.25`, and headings use `1.04–1.12`. Avoid long all-caps text; mono eyebrow labels may use uppercase with `--tracking-eyebrow`.

Posts have their own roles so every post kind reads the same: `--type-post-author` (`0.9375rem`, sans, semibold), `--type-post-meta` (`0.8125rem`, mono), `--type-post-body` (the authored role), and `--line-post-body` (`1.65`, `1.55` below `48em`).

Below `48em`, the type roles step down instead of each component overriding sizes: `--type-page-title` is `1.75rem`, `--type-section-title` is `1.375rem`, and `--type-card-title` is `--text-lg`. Components must not add their own mobile font-size clamps for these roles.

## Spacing and sizing

Spacing scale: `4`, `8`, `12`, `16`, `20`, `24`, `32`, `40`, `48`, `64`, `80`, `96`, `128`, and `160px`. Semantic layout roles define fluid page gutters, `80–160px` wide-screen section rhythm, card inset, shell clearance, and navigation offset. Below `48em`, page gutters become `16px`, section rhythm becomes `40px`, card inset becomes `16px`, `--navigation-height` becomes `56px`, and `--mobile-dock-height` becomes `64px`. Touch targets remain at least `44px`.

Phones get one frame per surface: below `48em` the `Surface` bezel shell dissolves (no padding, background, border, or shadow) and the core carries the card with `--radius-lg` and the card shadow. Do not nest a bezel shell inside another framed surface on mobile. In discussions this means each top-level comment, response composer, and the concealed-answer state is one frame; a composer nested inside a comment or the concealed state goes flat; and replies are unframed rows behind an `8px` indent with a `--color-hairline` rule. Discussion bylines use the post roles (`32px` avatar, `--type-post-author`, `--type-post-meta`) and comment bodies use `--type-post-body` with `--line-post-body`.

Page-level grid containers that hold content columns declare `grid-template-columns: minmax(0, 1fr)`. An implicit `auto` column grows to its widest child's min-content, which widens the page beyond the viewport and makes mobile browsers zoom the whole page out.

Content widths:

- Feed and reading column: `min(100% - 32px, 760px)`
- Wide application shell: `1200px`
- Standard modal: approximately `640px`
- Reading/composition modal: approximately `760px`

Course covers use `--aspect-course-cover` (`2 / 1`) in library cards and on the course page, and the library grid fills columns no narrower than `--width-course-card-min` (`17rem`). A course without a cover shows the first letter of its title on a muted panel. The feed's course post shows the same cover treatment beside a mono eyebrow, the display-serif title, level, and a three-line summary on a bezel panel; below `48em` the cover stacks above the copy. An unavailable course is a muted note. No new tokens were added.

On the course page, lessons use an editorial split above `48em`: a sticky outline panel (bezel surface, mono lesson numbers, at least `14rem` wide) beside a lesson column capped at `--width-reading`; below `48em` the outline stacks above the lessons and stops sticking. Lesson titles use the section-title role with a mono eyebrow for the derived lesson number. Block kinds carry the highlighting: headings use the display serif, text uses the authored role, examples sit on a `--color-support-soft` panel with the sentence emphasized and translation and note muted, and dialogues sit on a `--color-wash` panel with mono speaker labels. Editor tools are quiet buttons below each block, and version conflicts use the danger surface. No new tokens were added.

The course page's Contributors panel sits on a quiet surface between course management and the lessons. Requests and current contributors are hairline-separated rows with an avatar and name, and actions on the right; below `36em` rows and actions stack and buttons fill the width. Owner decisions use the secondary (decline) and primary (accept) buttons, and removal uses the danger button behind a confirmation. Lessons and blocks show a muted "Last edited by" line to the owner and contributors. No new tokens were added.

Progress uses one shared `ProgressMeter` molecule: an `8px` (or `5px` compact) pill track on `--color-wash-strong` whose fill uses `--color-action` and turns `--color-success` at 100%, animated with `--motion-standard` and `--ease-physical`, and exposed as an ARIA `progressbar`. The lesson player opens in the adaptive dialog (full screen below `48em`) with a mono step counter above the meter. Each step enters with a short rise-and-fade; example sentences and practice prompts use the display serif at `--text-2xl`; dialogue lines stay visible and muted while the newest is emphasized; the share prompt sits on `--color-concealed`; and the completion screen uses a round success badge that pops in. All entry motion is removed under reduced motion. The course page's Progress panel sits between course management and contributors as rows with avatar, name, mono percentage, compact meter, and a muted lesson count; the viewer's row has a `--color-wash` background. Finished lessons show a success check in the outline and a "Finished" label beside Practise again. No new tokens were added.

Layer order uses `--z-content: 10`, `--z-grain: 50`, `--z-navigation: 100`, `--z-floating-action: 200`, `--z-overlay: 300`, and `--z-transient: 400`. Components must use the named layer appropriate to their role rather than introduce arbitrary z-index values. The grain layer is pointer-free and contains no interactive content.

## Shape, border, and shadow

| Token | Value |
| --- | --- |
| `--radius-sm` | `10px` |
| `--radius-md` | `16px` |
| `--radius-lg` | `24px` |
| `--radius-xl` | `32px` |
| `--radius-shell` / `--radius-core` | `36px` / `calc(36px - 8px)` |
| `--radius-pill` | `999px` |
| `--ring-hairline` | translucent espresso `1px` ring |
| `--border-strong` | `2px solid var(--color-foreground)`; focus, validation, and tactile controls only |
| `--shadow-inset-highlight` | subtle white inset top highlight |
| `--shadow-card` | two-layer diffuse card shadow |
| `--shadow-raised` | two-layer raised-surface shadow |
| `--shadow-floating` / `--shadow-overlay` | navigation and overlay elevation |
| `--shadow-pressed` | compact ambient and inset press shadow |

Major surfaces use a bezel shell and concentric inner core. Lightweight rows use separators rather than independent elevation. Slight rotation is allowed only as a decorative accent—approximately `-0.35deg` to `0.35deg`—never on dense forms, long text, or the complete application shell, and it is removed below `48em`.

## Motion

Durations are `140ms` for press feedback, `360ms` for ordinary transitions, `520ms` for overlays, and `820ms` for one-time reveals. All use `--ease-physical: cubic-bezier(0.32, 0.72, 0, 1)`. Animation is limited to transform and opacity; entrance effects must use `IntersectionObserver`, must not replay during feed refreshes, and become effectively instant under `prefers-reduced-motion`. Continuous parallax and layout-property animation are prohibited.

## Responsive behavior

Use Mantine-aligned breakpoints near `36em`, `48em`, `62em`, and `75em`; components should respond to available space rather than device names.

- Desktop/tablet: detached navigation island, centered feed, modal composer
- Mobile: slim header bar, four-slot dock with More sheet, no journal hero, full-screen composer and reading wizard
- The group switcher lives in the account menu at every size
- Avoid horizontal scrolling for authored content

## Component character

- Cards: tonal bezel, raised paper core, translucent hairline, inset highlight, and diffuse ambient shadow
- Buttons: pill geometry, tactile press state, short direct labels, and optional trailing icon islands
- Inputs: warm raised core, tonal enclosure, calm hairline and focus transition, generous padding; no floating labels
- Dialogs: editorial heading, restrained overlay, clear primary/secondary actions
- Post-type labels: compact DM Mono chips using gentle accent backgrounds
- Empty/error states: plain-language copy and one obvious recovery action
- Reactions: hairline chips that expose count and identities, with the selected state on the selected/highlight roles; feed cards stack them in a vertical rail beside the card link. Do not color dislike as a destructive system error

## Reusable component contract

The reusable UI layer owns application-wide visual or behavioral contracts: actions and icon actions, surfaces, page/reading containers, labels, avatars, feedback and loading states, form help, dialogs, confirmations, menus, popovers, and tooltips. Domain language, authorization, data loading, and multi-step feature workflows remain in feature components. Wrap a Mantine primitive only when Wordinator adds one of these shared contracts.

The implemented component layer adds `default`, `quiet`, `featured`, `inset`, and `danger` concentric surface treatments; normal and reading density; pill buttons with optional trailing icon islands; tonal shared wrappers for text, password, textarea, select, checkbox, and radio controls; page and section headers; editorial split layouts; metadata rows; navigation items; standard, adaptive, and confirmation dialogs; and reveal/stagger utilities. Shared line icons use a `1.25px` stroke and inherit the current foreground. Feature pages migrate onto these contracts in the later redesign batches rather than creating page-local equivalents.

Every applicable shared component defines default, hover, keyboard-focus, pressed or selected, disabled, loading, and error behavior. Semantic HTML or Mantine supplies keyboard behavior and accessible names; styling must not remove them. Focus remains visible, controls use practical `44px` targets, and foreground/background pairs use the documented ink-based contrast. Authored text and safe links wrap without forcing horizontal page overflow. Motion uses the central duration scale and becomes effectively instant under `prefers-reduced-motion`.

The production-safe `/ui` route is the canonical visual inventory. It uses only static fixtures and i18next-backed copy, displays real exported components rather than visual copies, and uses an asymmetric editorial composition with explicit wide and narrow preview contexts. Its dual-theme foundation includes the real preference control plus deterministic light and dark scopes rendering actual navigation, surfaces, action variants, validation, disabled/loading states, authored content, and feedback components regardless of the active application scheme.

Redesign Batch 7 established release-blocking Chromium light-theme baselines for authentication, `/ui`, and the signed-in journal. Batch 8 adds stable full-inventory light/dark `/ui` and dark journal baselines. Its Chromium/WebKit gate verifies startup resolution, explicit persistence, live system changes, document and browser-chrome propagation, representative production routes at `390px` and `1440px`, overlays, deterministic previews, overflow, semantic contrast, forced colors, reduced motion, and unfiltered media.

## Accessibility status

Formal WCAG 2.2 AA conformance is future work. Mantine semantics, keyboard-operable primitives, sensible focus treatment, and safe contrast should still be preserved; “not initially required” is not permission to remove them.
