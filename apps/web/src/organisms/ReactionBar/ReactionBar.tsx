import {
  isSingleEmojiGrapheme,
  reactionTargetResponseSchema,
  type ReactionSummary,
} from "@wordinator/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip } from "@mantine/core";
import { StarPlus } from "lucide-react";
import { Button } from "../../ui/index";
import { apiRequest, sessionQueryOptions } from "../../api";
import styles from "./ReactionBar.module.css";

export default function ReactionBar({
  reactions,
  quickReactions,
  path,
  onChanged,
  orientation = "horizontal",
}: {
  reactions: ReactionSummary[];
  quickReactions: string[];
  path: string;
  onChanged: () => void;
  orientation?: "horizontal" | "vertical";
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const session = useQuery(sessionQueryOptions());
  const mutation = useMutation({
    mutationFn: ({ emoji, active }: { emoji: string; active: boolean }) =>
      apiRequest(path, reactionTargetResponseSchema, {
        method: "PUT",
        body: JSON.stringify({ emoji, active }),
      }),
    onSuccess: () => {
      setCustom("");
      setError("");
      onChanged();
    },
  });
  if (session.data?.status !== "signedIn") return null;

  const vertical = orientation === "vertical";
  const choices = [...new Set([...quickReactions, ...reactions.map((reaction) => reaction.emoji)])];
  const toggle = (emoji: string) =>
    mutation.mutate({ emoji, active: !reactions.find((reaction) => reaction.emoji === emoji)?.reacted });
  const identities = (emoji: string) =>
    reactions.find((reaction) => reaction.emoji === emoji)?.members.map((member) => member.displayName).join(", ") ?? "";
  const message = error || (mutation.error ? t("errors.generic") : "");

  return (
    <div className={vertical ? styles.vertical : styles.horizontal}>
      <div className={styles.chips}>
        {choices.map((emoji) => {
          const summary = reactions.find((reaction) => reaction.emoji === emoji);
          const names = identities(emoji);
          const chip = (
            <button
              key={emoji}
              type="button"
              className={styles.chip}
              data-active={summary?.reacted ?? false}
              aria-pressed={summary?.reacted ?? false}
              aria-label={t("discussion.reactWith", { emoji })}
              onClick={() => {
                setOpen(emoji);
                toggle(emoji);
              }}
            >
              <span className={styles.emoji} aria-hidden="true">{emoji}</span>
              <span className={styles.count}>{summary?.count ?? 0}</span>
            </button>
          );
          // The vertical rail has no room for the identity line, so it names the members beside each chip instead.
          return vertical ? (
            <Tooltip key={emoji} label={names} disabled={!names} position="left" withArrow events={{ hover: true, focus: true, touch: true }}>
              {chip}
            </Tooltip>
          ) : chip;
        })}
        <form
          className={styles.custom}
          onSubmit={(event) => {
            event.preventDefault();
            const emoji = custom.trim();
            if (!isSingleEmojiGrapheme(emoji)) {
              setError(t("discussion.emojiError"));
              return;
            }
            toggle(emoji);
          }}
        >
          {/* The emoji picker will open from this slot; until then it is a plain single-emoji input. */}
          <label className={styles.customField}>
            <input
              className={styles.customInput}
              aria-label={t("discussion.customEmoji")}
              aria-invalid={Boolean(error)}
              value={custom}
              onChange={(event) => {
                setCustom(event.currentTarget.value);
                setError("");
              }}
            />
            {!custom && <StarPlus className={styles.customIcon} size={16} aria-hidden="true" />}
          </label>
          {!vertical && (
            <Button type="submit" variant="secondary">
              {t("discussion.addReaction")}
            </Button>
          )}
        </form>
      </div>
      {!vertical && open && identities(open) && (
        <div className={styles.identities} role="status">
          {identities(open)}
        </div>
      )}
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
