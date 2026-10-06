import {
  isSingleEmojiGrapheme,
  reactionSummarySchema,
  reactionTargetResponseSchema,
  type ReactionSummary,
} from "@wordinator/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/index";
import styles from "./ReactionBar.module.css";
import { StarPlus } from "lucide-react";
import { apiRequest, sessionQueryOptions } from "../../api";
import { Pill, PillsInput } from "@mantine/core";

export default function ReactionBar({
  reactions,
  quickReactions,
  path,
  onChanged,
}: {
  reactions: ReactionSummary[];
  quickReactions: string[];
  path: string;
  onChanged: () => void;
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
  const choices = [
    ...new Set([
      ...quickReactions,
      ...reactions.map((reaction) => reaction.emoji),
    ]),
  ];
  const toggle = (emoji: string) =>
    mutation.mutate({
      emoji,
      active: !reactions.find((reaction) => reaction.emoji === emoji)?.reacted,
    });

    if (session.data?.status !== 'signedIn') return null;
  const viewerId = session.data.user.id;

  return (
    <>
      <PillsInput
        label={reactions.find(reaction => reaction.members.some((m) => m.id === viewerId))?.emoji}
        variant="filled"
        classNames={{ root: styles.reactionBarRoot, input: styles.reactionBarInput }}
      >
        <Pill.Group>
          {choices.map((emoji) => {
            const summary = reactions.find(
              (reaction) => reaction.emoji === emoji,
            );
            return (
              <Pill
                // component="button"
                key={emoji}
                className={summary?.reacted ? styles.activeReaction : styles.reaction}
                data-active={summary?.reacted ?? false}
                aria-pressed={summary?.reacted ?? false}
                aria-label={t("discussion.reactWith", { emoji })}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpen(emoji);
                  toggle(emoji);
                }}
              >
                {" "}
                {emoji} {summary?.count ?? 0}
              </Pill>
            );
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
            <div className={styles.customReactionWrapper}>
              <PillsInput.Field
                aria-label={t("discussion.customEmoji")}
                value={custom}
                onChange={(event) => setCustom(event.currentTarget.value)}
              />
              {/* <input
            className={styles.customReactionInput}
            
          /> */}
              <StarPlus
                className={styles.customReactionPlaceholder}
                size={16}
              />
            </div>
            {/* <TextField
          aria-label={t("discussion.customEmoji")}
          value={custom}
          onChange={(event) => setCustom(event.currentTarget.value)}
          maxLength={16}
        /> */}

            <Button type="submit" variant="secondary">
              {t("discussion.addReaction")}
            </Button>
          </form>
        </Pill.Group>
      </PillsInput>

      {open && (
        <div className={styles.identities} role="status">
          {reactions
            .find((reaction) => reaction.emoji === open)
            ?.members.map((member) => member.displayName)
            .join(", ")}
        </div>
      )}
      {(error || mutation.error) && (
        <p className={styles.error} role="alert">
          {error || t("errors.generic")}
        </p>
      )}
    </>
  );
}
