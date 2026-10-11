// A past or future moment relative to now ("3 days ago", "yesterday"), in seconds up to days.
export function relativeTime(value: number) {
  const seconds = Math.round((value - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(seconds) < 60
      ? [seconds, "second"]
      : Math.abs(seconds) < 3_600
        ? [Math.round(seconds / 60), "minute"]
        : Math.abs(seconds) < 86_400
          ? [Math.round(seconds / 3_600), "hour"]
          : [Math.round(seconds / 86_400), "day"];
  return formatter.format(amount, unit);
}
