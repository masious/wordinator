import { useState, useEffect, FormEvent  } from 'react';
import { createPostResponseSchema, postResponseSchema, type Post, type PostInput, type PostType  } from '@wordinator/contracts';
import { useMutation  } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../api';
import { SelectField, TextAreaField, TextField, Button, } from '../ui/index'
import ErrorMessage from '../molecules/ErrorMessage'
import type { SignedInSession, ComposerDraft, TypeDraft } from './types/auth';
import styles from './ComposerForm.module.css';


const emptyType = (): TypeDraft => ({
  body: "",
  notes: "",
  questions: [""],
  expectedAnswers: [],
});
const emptyDraft = (): ComposerDraft => ({
  version: 1,
  activeType: "shared_sentence",
  byType: {
    shared_sentence: emptyType(),
    question: emptyType(),
    reading: emptyType(),
    fill_in: emptyType(),
  },
});
export const composerDraftKey = (accountId: string, groupId: string) =>
  `wordinator:draft:v1:${accountId}:${groupId}:post:new`;

function readDraft(key: string): ComposerDraft {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1
    )
      return emptyDraft();
    return value as ComposerDraft;
  } catch {
    return emptyDraft();
  }
}

function draftFromPost(post: Post): ComposerDraft {
  const draft = emptyDraft();
  draft.activeType = post.type;
  draft.byType[post.type] = {
    body: post.body,
    notes: post.notes ?? "",
    questions: post.questions.length
      ? post.questions.map((question) => question.text)
      : [""],
    expectedAnswers: post.expectedAnswers.map((answer) => answer.text),
  };
  return draft;
}

function inputFromDraft(draft: ComposerDraft): PostInput {
  const fields = draft.byType[draft.activeType];
  const shared = { body: fields.body, notes: fields.notes || null };
  if (draft.activeType === "reading")
    return {
      type: "reading",
      ...shared,
      questions: fields.questions.map((text) => ({ text })),
    };
  if (draft.activeType === "fill_in")
    return {
      type: "fill_in",
      ...shared,
      expectedAnswers: fields.expectedAnswers,
    };
  return { type: draft.activeType, ...shared };
}

export default function ComposerForm({
  groupId,
  session,
  initialPost,
  onDone,
  onDiscard,
}: {
  groupId: string;
  session: SignedInSession;
  initialPost?: Post;
  onDone: (post: Post) => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const key = composerDraftKey(session.user.id, groupId);
  const [draft, setDraft] = useState<ComposerDraft>(() =>
    initialPost ? draftFromPost(initialPost) : readDraft(key),
  );
  const current = draft.byType[draft.activeType];
  useEffect(() => {
    if (!initialPost) localStorage.setItem(key, JSON.stringify(draft));
  }, [draft, initialPost, key]);
  const update = (change: Partial<TypeDraft>) =>
    setDraft((value) => ({
      ...value,
      byType: {
        ...value.byType,
        [value.activeType]: { ...value.byType[value.activeType], ...change },
      },
    }));
  const selectType = (type: PostType) =>
    setDraft((value) => {
      const source = value.byType[value.activeType];
      const destination = value.byType[type];
      return {
        ...value,
        activeType: type,
        byType: {
          ...value.byType,
          [type]: {
            ...destination,
            body: destination.body || source.body,
            notes: destination.notes || source.notes,
          },
        },
      };
    });
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(
        `/api/groups/${encodeURIComponent(groupId)}/posts${initialPost ? `/${encodeURIComponent(initialPost.id)}` : ""}`,
        initialPost ? postResponseSchema : createPostResponseSchema,
        {
          method: initialPost ? "PATCH" : "POST",
          body: JSON.stringify(inputFromDraft(draft)),
        },
      ),
    onSuccess: ({ post }) => {
      if (!initialPost) localStorage.removeItem(key);
      onDone(post);
    },
  });
  const blankCount = [...current.body].filter(
    (character) => character === "…",
  ).length;
  useEffect(() => {
    if (
      draft.activeType !== "fill_in" ||
      current.expectedAnswers.length === blankCount
    )
      return;
    update({
      expectedAnswers: Array.from(
        { length: blankCount },
        (_, index) => current.expectedAnswers[index] ?? null,
      ),
    });
  }, [blankCount, current.expectedAnswers, draft.activeType]);

  return (
    <form
      className={styles.composerForm}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <SelectField
        label={t("posts.type")}
        value={draft.activeType}
        onChange={(value) => selectType(value as PostType)}
        data={[
          { value: "shared_sentence", label: t("posts.types.shared_sentence") },
          { value: "question", label: t("posts.types.question") },
          { value: "reading", label: t("posts.types.reading") },
          { value: "fill_in", label: t("posts.types.fill_in") },
        ]}
      />
      <TextAreaField
        label={t(`posts.bodyLabels.${draft.activeType}`)}
        value={current.body}
        maxLength={10_000}
        minRows={draft.activeType === "reading" ? 8 : 4}
        autosize
        onChange={(event) => update({ body: event.currentTarget.value })}
        required
      />
      {draft.activeType === "reading" && (
        <fieldset>
          <legend>{t("posts.readingQuestions")}</legend>
          <div className={styles.fieldList}>
            {current.questions.map((question, index) => (
              <div className={styles.fieldRow} key={index}>
                <TextField
                  aria-label={t("posts.questionNumber", { number: index + 1 })}
                  value={question}
                  maxLength={1_000}
                  onChange={(event) =>
                    update({
                      questions: current.questions.map((item, currentIndex) =>
                        currentIndex === index
                          ? event.currentTarget.value
                          : item,
                      ),
                    })
                  }
                  required
                />
                {current.questions.length > 1 && (
                  <Button
                    type="button"
                    variant="quiet"
                    onClick={() =>
                      update({
                        questions: current.questions.filter(
                          (_, currentIndex) => currentIndex !== index,
                        ),
                      })
                    }
                  >
                    {t("common.remove")}
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => update({ questions: [...current.questions, ""] })}
          >
            {t("posts.addQuestion")}
          </Button>
        </fieldset>
      )}
      {draft.activeType === "fill_in" && (
        <fieldset>
          <legend>{t("posts.expectedAnswers")}</legend>
          <p className={styles.muted}>{t("posts.fillHelp")}</p>
          {blankCount === 0 ? (
            <p className={styles.error}>{t("posts.addBlank")}</p>
          ) : (
            <div className={styles.fieldList}>
              {current.expectedAnswers.map((answer, index) => (
                <TextField
                  key={index}
                  label={t("posts.blankNumber", { number: index + 1 })}
                  value={answer ?? ""}
                  maxLength={500}
                  onChange={(event) =>
                    update({
                      expectedAnswers: current.expectedAnswers.map(
                        (item, currentIndex) =>
                          currentIndex === index
                            ? event.currentTarget.value || null
                            : item,
                      ),
                    })
                  }
                />
              ))}
            </div>
          )}
        </fieldset>
      )}
      <TextAreaField
        label={t("posts.notes")}
        description={t("posts.notesHelp")}
        value={current.notes}
        maxLength={4_000}
        minRows={3}
        autosize
        onChange={(event) => update({ notes: event.currentTarget.value })}
      />
      <ErrorMessage error={mutation.error} />
      <div className={styles.actions}>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            if (!initialPost) localStorage.removeItem(key);
            onDiscard();
          }}
        >
          {t("posts.discard")}
        </Button>
        <Button loading={mutation.isPending} type="submit">
          {initialPost ? t("posts.saveEdit") : t("posts.publish")}
        </Button>
      </div>
    </form>
  );
}
