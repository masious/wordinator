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
  Select,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";

const semanticScale = (value: string) => Array(10).fill(value) as unknown as readonly [
  string, string, string, string, string, string, string, string, string, string,
];

const motion = {
  standard: 360,
  overlay: 520,
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
      boxShadow: "var(--shadow-inset-highlight)",
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
  primaryColor: "coral",
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
    coral: semanticScale("var(--color-action)"),
    sage: semanticScale("var(--color-support)"),
    ochre: semanticScale("var(--color-highlight)"),
    paper: semanticScale("var(--color-surface)"),
  },
  spacing: {
    xs: "var(--space-1)", sm: "var(--space-2)", md: "var(--space-4)",
    lg: "var(--space-6)", xl: "var(--space-8)",
  },
  radius: {
    xs: "var(--radius-sm)", sm: "var(--radius-sm)", md: "var(--radius-md)",
    lg: "var(--radius-lg)", xl: "var(--radius-xl)",
  },
  defaultRadius: "lg",
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
      defaultProps: { autoContrast: false, color: "coral", radius: "xl", size: "md" },
      styles: {
        root: {
          minHeight: "var(--control-height)",
          color: "var(--color-action-text)",
          fontWeight: "var(--weight-semibold)",
        },
      },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { autoContrast: false, color: "coral", radius: "xl", size: "var(--touch-target)" },
      styles: { root: { color: "var(--color-action-text)" } },
    }),
    TextInput: TextInput.extend({ defaultProps: inputDefaults }),
    PasswordInput: PasswordInput.extend({ defaultProps: inputDefaults }),
    Textarea: Textarea.extend({ defaultProps: inputDefaults }),
    Select: Select.extend({ defaultProps: inputDefaults }),
    Checkbox: Checkbox.extend({ defaultProps: { color: "coral", radius: "sm", size: "md" } }),
    Radio: Radio.extend({ defaultProps: { color: "coral", size: "md" } }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        radius: "xl",
        size: "var(--width-modal)",
        transitionProps: { duration: motion.overlay, timingFunction: "var(--ease-physical)" },
      },
      styles: {
        overlay: { background: "var(--color-overlay)", backdropFilter: "blur(12px)" },
        content: {
          background: "var(--color-overlay-glass)",
          border: "var(--ring-hairline)",
          boxShadow: "var(--shadow-overlay), var(--shadow-inset-highlight)",
        },
        title: {
          fontFamily: "var(--font-display)",
          fontSize: "var(--type-dialog-title)",
          fontWeight: "var(--weight-medium)",
        },
      },
    }),
    Menu: Menu.extend({
      defaultProps: {
        radius: "lg",
        shadow: "md",
        transitionProps: { duration: motion.standard, timingFunction: "var(--ease-physical)" },
      },
      styles: { dropdown: { background: "var(--color-surface-raised)", border: "var(--ring-hairline)" } },
    }),
    Popover: Popover.extend({
      defaultProps: {
        radius: "lg",
        shadow: "md",
        transitionProps: { duration: motion.standard, timingFunction: "var(--ease-physical)" },
      },
      styles: { dropdown: { background: "var(--color-surface-raised)", border: "var(--ring-hairline)" } },
    }),
    Tooltip: Tooltip.extend({
      defaultProps: {
        color: "var(--color-foreground)",
        openDelay: 300,
        transitionProps: { duration: motion.standard, timingFunction: "var(--ease-physical)" },
      },
      styles: { tooltip: { fontSize: "var(--text-sm)" } },
    }),
    Badge: Badge.extend({
      defaultProps: { color: "coral", radius: "xl", variant: "filled" },
      styles: { root: { color: "var(--color-action-text)", fontFamily: "var(--font-mono)" } },
    }),
    Alert: Alert.extend({
      defaultProps: { color: "coral", radius: "lg", variant: "light" },
      styles: {
        root: { border: "var(--ring-hairline)", boxShadow: "var(--shadow-inset-highlight)" },
        title: { color: "var(--color-foreground)" },
      },
    }),
    Avatar: Avatar.extend({
      defaultProps: { color: "coral", radius: "xl", size: "var(--touch-target)" },
      styles: { root: { color: "var(--color-action-text)", border: "var(--ring-hairline)" } },
    }),
  },
});
