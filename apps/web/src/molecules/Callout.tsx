import type { CalloutIcon, CalloutVariant } from "@wordinator/contracts/lesson-document";
import {
  BookOpen, CircleCheck, CircleHelp, CircleX, Clock, Globe, Heart, Info, Lightbulb, MapPin, Megaphone, MessageCircleWarning, Pencil, Sparkles, Star,
  TriangleAlert, Volume2, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Callout.module.css";

// Every icon name the contracts accept maps to one lucide icon; nothing else is ever rendered.
export const calloutIcons = {
  lightbulb: Lightbulb, megaphone: Megaphone, "triangle-alert": TriangleAlert, "book-open": BookOpen, globe: Globe,
  "message-circle-warning": MessageCircleWarning, "volume-2": Volume2, info: Info, star: Star, heart: Heart, "circle-check": CircleCheck,
  "circle-x": CircleX, "circle-help": CircleHelp, sparkles: Sparkles, pencil: Pencil, clock: Clock, "map-pin": MapPin,
} as const satisfies Record<Exclude<CalloutIcon, "auto">, LucideIcon>;

export const calloutDefaults = {
  hint: "lightbulb", important: "megaphone", warning: "triangle-alert", grammar: "book-open", culture: "globe",
  "false-friend": "message-circle-warning", pronunciation: "volume-2",
} as const satisfies Record<CalloutVariant, Exclude<CalloutIcon, "auto">>;

export const calloutIcon = (variant: CalloutVariant, icon: CalloutIcon) => calloutIcons[icon === "auto" ? calloutDefaults[variant] : icon];

// A tinted note inside a lesson. The variant sets the tone and default icon and is announced to screen readers.
export function Callout({ variant, icon, iconSlot, children }: { variant: CalloutVariant; icon: CalloutIcon; iconSlot?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const Icon = calloutIcon(variant, icon);
  return <aside className={styles.callout} data-variant={variant} aria-label={t(`courses.callout.variants.${variant}`)}>
    {iconSlot ?? <Icon className={styles.icon} aria-hidden="true" />}
    <div className={styles.body}>{children}</div>
  </aside>;
}
