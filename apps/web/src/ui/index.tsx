import {
  ActionIcon,
  Avatar as MantineAvatar,
  Button as MantineButton,
  Checkbox,
  Modal,
  PasswordInput,
  Radio,
  Select,
  Textarea,
  TextInput,
  type ButtonGroupProps as MantineButtonGroupProps,
  type ButtonProps as MantineButtonProps,
  type ActionIconProps,
  type CheckboxProps,
  type ModalProps,
  type PasswordInputProps,
  type RadioProps,
  type SelectProps,
  type TextareaProps,
  type TextInputProps,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Search } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import styles from "./WordinatorUi.module.css";

export { ThemePreferenceControl } from "../colorScheme";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type WordinatorButtonProps = Omit<MantineButtonProps, "variant"> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof MantineButtonProps> & {
    variant?: ButtonVariant;
    trailingIcon?: ReactNode;
  };

// The trailing glyph goes in Mantine's right section, outside the label: the label clips its overflow (so long labels end in an
// ellipsis), and a glyph inside it could be cut. Pass icons here, never as children or `rightSection`.
export function Button({ variant = "primary", className, children, trailingIcon, ...props }: WordinatorButtonProps) {
  return (
    <MantineButton className={`${styles.button} ${styles[variant]} ${className ?? ""}`}
      rightSection={trailingIcon ? <span aria-hidden="true" className={styles.trailingGlyph}>{trailingIcon}</span> : undefined} {...props}>
      <span className={styles.buttonLabel}>{children}</span>
    </MantineButton>
  );
}

/** Attached buttons that act as one control: the group rounds the outer ends and inner seams are lines. */
export function ButtonGroup({ label, className, children, ...props }: Omit<MantineButtonGroupProps, "orientation"> & { label: string }) {
  return <MantineButton.Group aria-label={label} className={`${styles.buttonGroup} ${className ?? ""}`} {...props}>{children}</MantineButton.Group>;
}

// A square icon-only button. `tone="quiet"` drops the surface and edge for actions inside rows and cards (such as a list item's
// archive button), and `primary` sits on the action colour (such as a composer's send). `size="sm"` is `--control-height-sm`
// square, for buttons inside another control (such as a search field's start). Given `pressed`, it is a toggle button
// (`aria-pressed`): pressed, it sits on the soft accent with an accent line and an accent glyph, in every tone but primary.
export type IconButtonTone = "default" | "quiet" | "primary";
export function IconButton({ label, className, children, tone = "default", size = "md", pressed, ...props }: Omit<ActionIconProps, "variant" | "size"> & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ActionIconProps | "aria-label" | "aria-pressed"> & {
  label: string; tone?: IconButtonTone; size?: "sm" | "md"; pressed?: boolean;
}) {
  return <ActionIcon aria-label={label} aria-pressed={pressed} data-tone={tone} data-size={size} className={`${styles.iconButton} ${className ?? ""}`} {...props}>{children}</ActionIcon>;
}

export function ArrowIcon() {
  return <svg aria-hidden="true" className={styles.lineIcon} viewBox="0 0 20 20"><path d="M5 15 15 5m-7 0h7v7" /></svg>;
}

export function StarIcon() {
  return <svg aria-hidden="true" className={styles.lineIcon} viewBox="0 0 20 20"><path d="m10 2.5 2.2 4.45 4.9.72-3.55 3.45.84 4.88L10 13.7 5.61 16l.84-4.88L2.9 7.67l4.9-.72L10 2.5Z" /></svg>;
}

export function PageContainer({ children, reading = false, className }: PropsWithChildren<{ reading?: boolean; className?: string }>) {
  return <div className={`${reading ? styles.reading : styles.container} ${className ?? ""}`}>{children}</div>;
}

export type SurfaceTone = "default" | "quiet" | "featured" | "inset" | "danger";
export function Surface({ children, className, tone = "default", density = "normal" }: PropsWithChildren<{ className?: string; tone?: SurfaceTone; density?: "normal" | "reading" }>) {
  return (
    <section className={`${styles.surfaceShell} ${styles[`surface${capitalize(tone)}`]}`}>
      <div className={`${styles.surfaceCore} ${density === "reading" ? styles.surfaceReading : ""} ${className ?? ""}`}>{children}</div>
    </section>
  );
}

function capitalize(value: string) {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

// A small pill label (a badge). Tones tint it: accent for the current or featured thing, success for done, warm for attention,
// info for categories.
export type LabelChipTone = "default" | "accent" | "success" | "warm" | "info";
export function LabelChip({ children, tone = "default", className }: PropsWithChildren<{ tone?: LabelChipTone; className?: string }>) {
  return <span className={`${styles.chip} ${className ?? ""}`} data-tone={tone}>{children}</span>;
}

// The uppercase accent line above a page or card title.
export function Eyebrow({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <p className={`${styles.eyebrow} ${className ?? ""}`}>{children}</p>;
}

// Initials on ink by default; `accent` marks the tutor and `soft` a quiet identity. A picture replaces the initials.
export type AvatarTone = "ink" | "accent" | "soft";
export function Avatar({ name, className, src, size, radius, tone = "ink" }: { name: string; className?: string, src?: string | null, size?: number | string, radius?: number | string, tone?: AvatarTone }) {
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <MantineAvatar className={`${styles.avatar} ${className ?? ""}`} data-tone={tone} size={size} radius={radius} alt={name} name={name} src={src}>{initials}</MantineAvatar>;
}

export function StatusPanel({ title, children, tone = "info" }: PropsWithChildren<{ title: string; tone?: "info" | "success" | "error" }>) {
  const toneClass = `status${capitalize(tone)}` as keyof typeof styles;
  return (
    <div className={`${styles.status} ${styles[toneClass]}`} role={tone === "error" ? "alert" : "status"}>
      <span aria-hidden="true" className={styles.statusDot} />
      <div className={styles.statusBody}>
        <p className={styles.statusTitle}>{title}</p>
        {children && <div className={styles.statusMessage}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action, framed = false }: PropsWithChildren<{ title: string; action?: ReactNode; framed?: boolean }>) {
  const state = <div className={styles.state}><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
  return framed ? <Surface tone="quiet">{state}</Surface> : state;
}

export function ErrorState({ title, children, action }: PropsWithChildren<{ title: string; action?: ReactNode }>) {
  return <div className={`${styles.state} ${styles.stateError}`} role="alert"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}

export function LoadingState({ label }: { label: string }) {
  return <div aria-label={label} aria-busy="true" className={styles.state}><div className={styles.skeletonWide} /><div className={styles.skeletonShort} /></div>;
}

export function FieldHelp({ id, children, error = false }: PropsWithChildren<{ id: string; error?: boolean }>) {
  return <span className={error ? `${styles.help} ${styles.errorText}` : styles.help} id={id}>{children}</span>;
}

export function TextField({ className, ...props }: TextInputProps) { return <TextInput className={`${styles.control} ${className ?? ""}`} {...props} />; }
// A one-line search box (`type="search"`, so the browser's own clear × ends it while there is text). Its start is a magnifier, or,
// given `toggle`, a small quiet toggle `IconButton` that switches a search scope on and off (such as the library); its label is
// also its tooltip.
export type SearchToggle = { icon: ReactNode; label: string; pressed: boolean; onToggle: () => void };
export function SearchField({ toggle, className, ...props }: Omit<TextInputProps, "type" | "leftSection" | "leftSectionPointerEvents"> & { toggle?: SearchToggle }) {
  return <TextInput type="search" className={`${styles.control} ${className ?? ""}`} leftSectionPointerEvents={toggle ? "all" : "none"}
    leftSection={toggle
      ? <IconButton tone="quiet" size="sm" label={toggle.label} title={toggle.label} pressed={toggle.pressed} onClick={toggle.onToggle}>{toggle.icon}</IconButton>
      : <Search aria-hidden="true" size={16} />}
    {...props} />;
}
export function PasswordField({ className, ...props }: PasswordInputProps) { return <PasswordInput className={`${styles.control} ${className ?? ""}`} {...props} />; }
export function TextAreaField({ className, ...props }: TextareaProps) { return <Textarea className={`${styles.control} ${className ?? ""}`} {...props} />; }
export function SelectField({ className, ...props }: SelectProps) { return <Select className={`${styles.control} ${className ?? ""}`} {...props} />; }
export function CheckboxField({ className, ...props }: CheckboxProps) { return <Checkbox className={`${styles.choice} ${className ?? ""}`} {...props} />; }
export function RadioField({ className, ...props }: RadioProps) { return <Radio className={`${styles.choice} ${className ?? ""}`} {...props} />; }

export function PageHeader({ eyebrow, title, intro, actions, className }: { eyebrow?: ReactNode; title: ReactNode; intro?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={className ? `${styles.pageHeader} ${className}` : styles.pageHeader}><div className={styles.pageHeaderCopy}>{eyebrow && <div>{eyebrow}</div>}<h1>{title}</h1>{intro && <p>{intro}</p>}</div>{actions && <div className={styles.pageHeaderActions}>{actions}</div>}</header>;
}

export function SectionHeader({ eyebrow, title, description, action }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className={styles.sectionHeader}><div>{eyebrow && <div>{eyebrow}</div>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div>{action}</div>}</header>;
}

export function SplitLayout({ primary, secondary, reverse = false, className }: { primary: ReactNode; secondary: ReactNode; reverse?: boolean; className?: string }) {
  return <div className={`${styles.split} ${reverse ? styles.splitReverse : ""} ${className ?? ""}`}><div>{primary}</div><div>{secondary}</div></div>;
}

export function MetadataRow({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={`${styles.metadata} ${className ?? ""}`}>{children}</div>;
}

// One entry of a metadata row with its leading line icon (decorative).
export function MetadataItem({ icon, children }: PropsWithChildren<{ icon?: ReactNode }>) {
  return <span className={styles.metadataItem}>{icon && <span aria-hidden="true" className={styles.navigationIcon}>{icon}</span>}{children}</span>;
}

export function NavigationItem({ href, icon, active = false, children }: PropsWithChildren<{ href: string; icon?: ReactNode; active?: boolean }>) {
  return <a aria-current={active ? "page" : undefined} className={styles.navigationItem} href={href}>{icon && <span aria-hidden="true" className={styles.navigationIcon}>{icon}</span>}<span>{children}</span></a>;
}

export function Reveal({ children, delay = 0, className }: PropsWithChildren<{ delay?: number; className?: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (!node || visible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);
  return <div className={`${styles.reveal} ${visible ? styles.revealed : ""} ${className ?? ""}`} ref={ref} style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}>{children}</div>;
}

export function Stagger({ children, step = 90, className, style, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { step?: number }>) {
  return <div className={`${styles.stagger} ${className ?? ""}`} style={{ ...style, "--stagger-step": `${step}ms` } as React.CSSProperties} {...props}>{children}</div>;
}

function DialogBody({ children }: PropsWithChildren) { return <div className={styles.dialogBody}>{children}</div>; }

export function Dialog(props: ModalProps) {
  const { children, classNames, ...modalProps } = props;
  const customClassNames = typeof classNames === "object" ? classNames : {};
  const { t } = useTranslation();
  return <Modal closeButtonProps={{ "aria-label": t("common.close") }} classNames={{ inner: styles.dialogInner, content: styles.dialogShell, header: styles.dialogHeader, body: styles.dialogContent, ...customClassNames }} {...modalProps}><DialogBody>{children}</DialogBody></Modal>;
}

// The adaptive dialog centres on wide screens and is a full-screen sheet below `48em`.
export function AdaptiveDialog(props: ModalProps) {
  const narrow = useMediaQuery("(max-width: 48em)");
  // The theme's content border and shadow are inline styles, so only a styles prop can drop them from the full-screen sheet.
  return <Dialog centered={!narrow} fullScreen={narrow} radius={narrow ? 0 : "lg"} size="var(--width-modal)" styles={narrow ? { content: { border: 0, boxShadow: "none" } } : undefined} {...props} />;
}

export function ConfirmDialog({ confirmLabel, cancelLabel, onConfirm, onClose, children, confirmLoading = false, ...props }: ModalProps & { confirmLabel: string; cancelLabel?: string; onConfirm: () => void; confirmLoading?: boolean }) {
  return <AdaptiveDialog {...props} onClose={onClose}><div className={styles.confirmBody}>{children}<div className={styles.dialogActions}>{cancelLabel && <Button variant="quiet" onClick={onClose}>{cancelLabel}</Button>}<Button variant="danger" loading={confirmLoading} onClick={onConfirm}>{confirmLabel}</Button></div></div></AdaptiveDialog>;
}
