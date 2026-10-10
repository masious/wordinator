import { useReducedMotion } from "@mantine/hooks";
import { useEffect, useRef, useState } from "react";
import styles from "./AnimatedEmoji.module.css";

// An emoji that can play a Lottie animation, such as Noto's animated emoji (https://googlefonts.github.io/noto-emoji-animation/).
// Callers supply the artwork from Wordinator's own origin: loaders for the still image's URL and for the animation's JSON.
const player = () => import("lottie-web").then((module) => module.default);

// At rest the emoji is its still artwork, or the plain character without one. While `playing`, its animation is loaded and loops
// over the still; when playing stops, the animation is dropped and the still returns. Reduced motion keeps it still. The emoji
// is decorative: callers name what it stands for.
export function AnimatedEmoji({ emoji, still, animation, playing = false, className }: {
  emoji: string; still?: () => Promise<string>; animation?: () => Promise<unknown>; playing?: boolean; className?: string;
}) {
  const container = useRef<HTMLSpanElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [image, setImage] = useState<"loading" | "ready" | "failed">("loading");
  const [animating, setAnimating] = useState(false);
  const reduceMotion = useReducedMotion();
  const play = playing && !reduceMotion && Boolean(animation);
  useEffect(() => {
    let cancelled = false;
    setSource(null); setImage("loading");
    still?.().then((url) => { if (!cancelled) setSource(url); }, () => { if (!cancelled) setImage("failed"); });
    return () => { cancelled = true; };
  }, [still]);
  useEffect(() => {
    if (!play || !animation) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    Promise.all([player(), animation()]).then(([lottie, data]) => {
      if (cancelled || !container.current) return;
      // The player writes into the data it is given, so every instance gets its own copy.
      const item = lottie.loadAnimation({ container: container.current, renderer: "svg", loop: true, autoplay: true, animationData: structuredClone(data) });
      item.addEventListener("DOMLoaded", () => { if (!cancelled) setAnimating(true); });
      destroy = () => item.destroy();
    }).catch(() => undefined);
    return () => { cancelled = true; destroy?.(); setAnimating(false); };
  }, [animation, play]);
  return <span className={`${styles.emoji} ${className ?? ""}`} aria-hidden="true" data-animating={animating || undefined}>
    {!still || image === "failed"
      ? <span className={styles.still}>{emoji}</span>
      : source && <img className={styles.still} src={source} alt="" draggable={false} data-loading={image === "loading" || undefined}
        onLoad={() => setImage("ready")} onError={() => setImage("failed")} />}
    <span ref={container} className={styles.animation} />
  </span>;
}
