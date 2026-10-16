import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  createTheme,
  Menu,
  Modal,
  PasswordInput,
  Popover,
  Radio,
  SegmentedControl,
  Select,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";

const semanticScale = (value: string) => Array(10).fill(value) as unknown as readonly [
  string, string, string, string, string, string, string, string, string, string,
];

const motion = {
  standard: 180,
  overlay: 320,
} as const;

const inputDefaults = {
  radius: "md",
  size: "md",
  styles: {
    input: {
      minHeight: "var(--control-height)",
      color: "var(--color-foreground)",
      background: "var(--color-core)",
      border: "var(--ring-hairline)",
    },
    label: {
      color: "var(--color-foreground)",
      fontSize: "var(--type-control-label)",
      fontWeight: "var(--weight-semibold)",
    },
    description: { color: "var(--color-foreground-muted)" },
    error: { color: "var(--color-danger-text)", fontWeight: "var(--weight-medium)" },
  },
} as const;

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: 5,
  autoContrast: false,
  black: "var(--color-foreground)",
  white: "var(--color-surface)",
  fontFamily: "var(--font-sans)",
  fontFamilyMonospace: "var(--font-mono)",
  fontSizes: {
    xs: "var(--text-xs)", sm: "var(--text-sm)", md: "var(--text-md)",
    lg: "var(--text-lg)", xl: "var(--text-xl)",
  },
  fontWeights: {
    regular: "var(--weight-regular)", medium: "var(--weight-medium)", bold: "var(--weight-bold)",
  },
  lineHeights: {
    xs: "var(--line-compact)", sm: "var(--line-compact)", md: "var(--line-body)",
    lg: "var(--line-body)", xl: "var(--line-heading)",
  },
  headings: {
    fontFamily: "var(--font-display)",
    fontWeight: "var(--weight-medium)",
    textWrap: "balance",
    sizes: {
      h1: { fontSize: "var(--type-page-title)", lineHeight: "var(--line-heading)" },
      h2: { fontSize: "var(--type-section-title)", lineHeight: "var(--line-heading)" },
      h3: { fontSize: "var(--type-card-title)", lineHeight: "var(--line-title)" },
      h4: { fontSize: "var(--text-lg)", lineHeight: "var(--line-title)" },
      h5: { fontSize: "var(--text-md)", lineHeight: "var(--line-title)" },
      h6: { fontSize: "var(--text-sm)", lineHeight: "var(--line-heading)" },
    },
  },
  colors: {
    accent: semanticScale("var(--color-action)"),
    support: semanticScale("var(--color-support)"),
    highlight: semanticScale("var(--color-highlight)"),
    surface: semanticScale("var(--color-surface)"),
  },
  spacing: {
    xs: "var(--space-1)", sm: "var(--space-2)", md: "var(--space-4)",
    lg: "var(--space-6)", xl: "var(--space-8)",
  },
  radius: {
    xs: "var(--radius-sm)", sm: "var(--radius-sm)", md: "var(--radius-md)",
    lg: "var(--radius-lg)", xl: "var(--radius-xl)",
  },
  defaultRadius: "md",
  shadows: {
    xs: "var(--shadow-pressed)", sm: "var(--shadow-card)", md: "var(--shadow-card)",
    lg: "var(--shadow-raised)", xl: "var(--shadow-raised)",
  },
  breakpoints: {
    xs: "var(--breakpoint-sm)", sm: "var(--breakpoint-sm)", md: "var(--breakpoint-md)",
    lg: "var(--breakpoint-lg)", xl: "var(--breakpoint-xl)",
  },
  focusRing: "auto",
  respectReducedMotion: true,
  cursorType: "pointer",
  components: {
    Button: Button.extend({
      defaultProps: { autoContrast: false, color: "accent", radius: "sm", size: "md" },
      styles: {
        root: {
          minHeight: "var(--control-height)",
          fontWeight: "var(--weight-semibold)",
        },
      },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { autoContrast: false, color: "accent", radius: "sm", size: "var(--control-height)" },
    }),
    TextInput: TextInput.extend({ defaultProps: inputDefaults }),
    PasswordInput: PasswordInput.extend({ defaultProps: inputDefaults }),
    Textarea: Textarea.extend({ defaultProps: inputDefaults }),
    Select: Select.extend({ defaultProps: inputDefaults }),
    Checkbox: Checkbox.extend({ defaultProps: { color: "accent", radius: "sm", size: "md" } }),
    Radio: Radio.extend({ defaultProps: { color: "accent", size: "md" } }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        radius: "lg",
        size: "var(--width-modal)",
        transitionProps: { duration: motion.overlay, timingFunction: "var(--ease-physical)" },
      },
      styles: {
        overlay: { background: "var(--color-overlay)" },
        content: {
          background: "var(--color-surface-raised)",
          border: "var(--ring-hairline)",
          boxShadow: "var(--shadow-overlay)",
        },
        title: {
          fontSize: "var(--type-dialog-title)",
          fontWeight: "var(--weight-semibold)",
          letterSpacing: "var(--tracking-title)",
        },
      },
    }),
    Menu: Menu.extend({
      defaultProps: {
        radius: "md",
        shadow: "md",
        transitionProps: { duration: motion.standard, timingFunction: "var(--ease-physical)" },
      },
      styles: { dropdown: { background: "var(--color-surface-raised)", border: "var(--ring-hairline)" } },
    }),
    Popover: Popover.extend({
      defaultProps: {
        radius: "md",
        shadow: "md",
        transitionProps: { duration: motion.standard, timingFunction: "var(--ease-physical)" },
      },
      styles: { dropdown: { background: "var(--color-surface-raised)", border: "var(--ring-hairline)" } },
    }),
    Tooltip: Tooltip.extend({
      defaultProps: {
        color: "var(--color-inverse-surface)",
        openDelay: 300,
        transitionProps: { duration: motion.standard, timingFunction: "var(--ease-physical)" },
      },
      styles: { tooltip: { color: "var(--color-inverse-text)", fontSize: "var(--text-xs)", fontWeight: "var(--weight-semibold)" } },
    }),
    // The switcher look (a paper track, the active option on ink) lives in index.css so modules can still adjust it.
    SegmentedControl: SegmentedControl.extend({ defaultProps: { radius: "sm", size: "sm" } }),
    Badge: Badge.extend({
      defaultProps: { color: "accent", radius: "xl", variant: "filled" },
      styles: { root: { color: "var(--color-action-text)", fontFamily: "var(--font-sans)", fontSize: "var(--type-badge)" } },
    }),
    Alert: Alert.extend({
      defaultProps: { color: "accent", radius: "lg", variant: "light" },
      styles: {
        root: { border: "var(--ring-hairline)" },
        title: { color: "var(--color-foreground)" },
      },
    }),
    Avatar: Avatar.extend({
      defaultProps: { color: "accent", radius: "100%", size: "var(--size-avatar)" },
    }),
  },
});
