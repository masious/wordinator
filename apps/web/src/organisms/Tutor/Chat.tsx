import { TUTOR_MESSAGE_TEXT_MAX, tutorConversationResponseSchema, type TutorComponentAnswer, type TutorConversation, type TutorMessage, type TutorMessagePage, type TutorPart, type TutorRespondRequest, type TutorStreamEvent } from "@wordinator/contracts/tutor";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, apiRequest, tutorConversationQueryOptions, tutorConversationsKey, tutorMessagesKey, tutorMessagesQueryOptions } from "../../api";
import { SpeechRecognitionScope, type TokenSource } from "../../molecules/speechRecognition";
import { Button, IconButton, TextAreaField } from "../../ui";
import { AssistantParts, UserMessage, type PartHandlers, type StreamPart } from "./Messages";
import { conversationPath, limitResetsAt, streamTurn, tutorClip } from "./tutorApi";
import styles from "./Tutor.module.css";

// The chat (docs/ai-tutor.md): messages oldest first with older pages on request, the turn streaming live, and the composer.
// A streamed turn renders from its events and is replaced, on `done`, by the stored message in the TanStack Query cache.

type Streaming = { messageId: string | null; parts: StreamPart[] };
type Refusal = { code: string } | null;
type Messages = InfiniteData<TutorMessagePage, string | undefined>;

const emptyPages = (): Messages => ({ pages: [{ items: [], nextCursor: null }], pageParams: [undefined] });

// Adds or replaces a message in the newest page.
function withMessage(data: Messages | undefined, message: TutorMessage): Messages {
  const base = data ?? emptyPages();
  const pages = base.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== message.id) }));
  pages[0] = { ...pages[0]!, items: [message, ...pages[0]!.items] };
  return { ...base, pages };
}

// Replaces an answered component or card in its message, which no longer waits.
function withAnsweredPart(data: Messages | undefined, messageId: string, part: Extract<TutorPart, { type: "component" | "confirmation" }>): Messages | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((message) => message.id !== messageId ? message : {
    ...message, status: "complete" as const,
    parts: message.parts.map((entry) => (entry.type === part.type && "toolCallId" in entry && entry.toolCallId === part.toolCallId) ? part : entry),
  }) })) };
}

function applyEvent(current: Streaming, event: TutorStreamEvent): Streaming {
  switch (event.type) {
    case "start": return { ...current, messageId: event.messageId };
    case "text": {
      const last = current.parts[current.parts.length - 1];
      if (last?.type === "raw_text") return { ...current, parts: [...current.parts.slice(0, -1), { type: "raw_text", raw: last.raw + event.delta }] };
      return { ...current, parts: [...current.parts, { type: "raw_text", raw: event.delta }] };
    }
    case "tool_call": case "tool_result": case "component": case "confirmation": return { ...current, parts: [...current.parts, event.part] };
    case "error": return { ...current, parts: [...current.parts, { type: "error", code: event.code, message: event.message }] };
    default: return current;
  }
}

const textOf = (message: TutorMessage) => message.parts.map((part) => part.type === "text" ? part.text : "").join("");

export function TutorChat({ conversationId, conversation, onCreated, language, languageName, recognitionLocale, token }: {
  // Null for a new conversation, which is created when the learner first sends.
  conversationId: string | null; conversation: TutorConversation | null; onCreated: (conversation: TutorConversation) => void;
  language: string; languageName: string; recognitionLocale: string | null; token: TokenSource;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [ownId, setOwnId] = useState<string | null>(conversationId);
  const id = conversationId ?? ownId;
  const messages = useInfiniteQuery({ ...tutorMessagesQueryOptions(id ?? ""), enabled: Boolean(id) });
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [limitUntil, setLimitUntil] = useState<number | null>(null);
  const [text, setText] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Another conversation was opened: drop this one's streaming state (its turn carries on and is stored by the server).
  // A conversation this chat just created arrives as the new prop and keeps its stream.
  const previous = useRef(conversationId);
  useEffect(() => {
    if (previous.current === conversationId) return;
    previous.current = conversationId;
    if (conversationId !== null && conversationId === ownId) return;
    abort.current?.abort(); abort.current = null;
    setOwnId(conversationId); setStreaming(null); setBusy(false); setRefusal(null); setText("");
  }, [conversationId, ownId]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (limitUntil === null) return;
    const timer = window.setTimeout(() => setLimitUntil(null), Math.max(0, limitUntil - Date.now()));
    return () => window.clearTimeout(timer);
  }, [limitUntil]);
  useEffect(() => { bottom.current?.scrollIntoView?.({ block: "end" }); }, [streaming, messages.data?.pages[0]?.items.length]);

  const list = (messages.data?.pages.flatMap((page) => page.items) ?? []).slice().reverse();
  const last = list[list.length - 1];
  const archived = conversation?.archivedAt != null;
  const awaiting = last?.role === "assistant" && last.status === "awaiting_user";
  const lastUser = [...list].reverse().find((message) => message.role === "user");

  const run = async (target: string, path: string, body: unknown) => {
    const controller = new AbortController();
    abort.current?.abort(); abort.current = controller;
    setBusy(true); setRefusal(null); setStreaming({ messageId: null, parts: [] });
    const key = tutorMessagesKey(target);
    let finished = false;
    try {
      await streamTurn(path, body, (event) => {
        if (controller.signal.aborted) return;
        if (event.type === "user_message") queryClient.setQueryData<Messages>(key, (data) => withMessage(data, event.message));
        else if (event.type === "answered") queryClient.setQueryData<Messages>(key, (data) => withAnsweredPart(data, event.messageId, event.part));
        else if (event.type === "done") { finished = true; queryClient.setQueryData<Messages>(key, (data) => withMessage(data, event.message)); setStreaming(null); }
        else setStreaming((current) => applyEvent(current ?? { messageId: null, parts: [] }, event));
      }, controller.signal);
      if (!finished && !controller.signal.aborted) { setStreaming(null); setRefusal({ code: "STREAM_LOST" }); await queryClient.invalidateQueries({ queryKey: key }); }
    } catch (error) {
      if (controller.signal.aborted) return;
      setStreaming(null);
      if (error instanceof ApiError) {
        if (error.code === "AI_DAILY_LIMIT") setLimitUntil(limitResetsAt(error.body));
        else setRefusal({ code: error.code });
        if (error.code === "CONVERSATION_ARCHIVED") await queryClient.invalidateQueries({ queryKey: tutorConversationQueryOptions(target).queryKey });
        if (error.code === "TURN_IN_PROGRESS" || error.code === "TOOL_CALL_ANSWERED") await queryClient.invalidateQueries({ queryKey: key });
      } else setRefusal({ code: "STREAM_LOST" });
      throw error;
    } finally {
      if (abort.current === controller) { abort.current = null; setBusy(false); }
      void queryClient.invalidateQueries({ queryKey: tutorConversationsKey });
    }
  };

  const send = async (message: string) => {
    let target = id;
    if (!target) {
      setBusy(true);
      try {
        const created = await apiRequest("/api/ai/conversations", tutorConversationResponseSchema, { method: "POST" });
        target = created.conversation.id;
        queryClient.setQueryData(tutorConversationQueryOptions(target).queryKey, created);
        queryClient.setQueryData<Messages>(tutorMessagesKey(target), emptyPages());
        setOwnId(target); onCreated(created.conversation);
      } catch { setBusy(false); setRefusal({ code: "generic" }); return; }
    }
    await run(target, `${conversationPath(target)}/messages`, { text: message });
  };
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const message = text.trim();
    if (!message || composerLocked) return;
    setText("");
    void send(message).catch(() => { setText((current) => current || message); });
  };
  const respond = (toolCallId: string, request: TutorRespondRequest) => {
    if (!id) return Promise.reject(new Error("No conversation"));
    return run(id, `${conversationPath(id)}/tool-calls/${encodeURIComponent(toolCallId)}/respond`, request);
  };
  const retry = lastUser && !archived ? () => { void send(textOf(lastUser)).catch(() => undefined); } : undefined;

  const composerLocked = busy || archived || awaiting || limitUntil !== null;
  const handlers = (message: TutorMessage | null, live: boolean): PartHandlers => {
    const messageId = message?.id ?? null;
    const isLast = message !== null && message.id === last?.id;
    return {
      disabled: archived || busy || live,
      language: languageName, lang: language,
      speech: id && messageId ? (spanIndex) => tutorClip(id, messageId, { spanIndex }) : undefined,
      componentClip: id && messageId ? (toolCallId) => tutorClip(id, messageId, { toolCallId }) : undefined,
      onAnswer: (toolCallId, answer: TutorComponentAnswer) => respond(toolCallId, { type: "component", answer }),
      onConfirm: (toolCallId, confirmed) => respond(toolCallId, { type: "confirmation", confirmed }),
      onRetry: isLast && message?.status === "error" && !busy ? retry : undefined,
      focusOpen: isLast,
    };
  };

  const resets = limitUntil === null ? "" : new Date(limitUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return <SpeechRecognitionScope locale={recognitionLocale} token={token}>
    <div className={styles.chat}>
      <div className={styles.messages} aria-live="polite" aria-busy={busy || undefined}>
        {messages.hasNextPage && <Button variant="quiet" className={styles.earlier} loading={messages.isFetchingNextPage} onClick={() => void messages.fetchNextPage()}>{t("tutor.earlier")}</Button>}
        {messages.isError && <p className={styles.errorLine} role="alert">{t("tutor.messagesUnavailable")}</p>}
        {!messages.hasNextPage && <p className={styles.privacy}>{t("tutor.privacy")}</p>}
        {list.length === 0 && !streaming && !messages.isPending && <p className={styles.emptyChat}>{t("tutor.emptyChat")}</p>}
        {list.map((message) => message.role === "user"
          ? <UserMessage key={message.id} text={textOf(message)} />
          : <AssistantParts key={message.id} parts={message.parts} streaming={false} handlers={handlers(message, false)} />)}
        {streaming && <AssistantParts parts={streaming.parts.length ? streaming.parts : []} streaming handlers={handlers(null, true)} />}
        {streaming && streaming.parts.length === 0 && <p className={styles.thinking} role="status">{t("tutor.thinking")}</p>}
        {refusal && <div className={styles.errorPart} role="alert">
          <p>{t(`tutor.errors.${refusal.code}`, { defaultValue: t("tutor.errors.generic") })}</p>
          {refusal.code === "STREAM_LOST" && retry && !busy && <Button variant="secondary" onClick={retry}>{t("tutor.tryAgain")}</Button>}
        </div>}
        <div ref={bottom} />
      </div>
      <form className={styles.composer} onSubmit={submit}>
        {limitUntil !== null ? <p className={styles.composerNote} role="status">{t("tutor.limit", { time: resets })}</p>
          : archived ? <p className={styles.composerNote}>{t("tutor.archivedNote")}</p>
          : <>
            <TextAreaField className={styles.composerField} aria-label={t("tutor.composerLabel")} placeholder={awaiting ? t("tutor.answerFirst") : t("tutor.composerPlaceholder")}
              value={text} maxLength={TUTOR_MESSAGE_TEXT_MAX} autosize minRows={1} maxRows={6} disabled={awaiting}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} />
            <IconButton label={t("tutor.send")} type="submit" className={styles.send} disabled={composerLocked || !text.trim()} loading={busy}><ArrowUp size={18} aria-hidden="true" /></IconButton>
          </>}
      </form>
    </div>
  </SpeechRecognitionScope>;
}
