import {
  lessonDraftConflictSchema, lessonDraftSavedResponseSchema, type LessonDocument, type LessonDraft, type LessonDraftSavedResponse,
} from "@wordinator/contracts/lesson-document";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearLocalLessonDraft, storeLocalLessonDraft } from "./lessonDraft";

export type SaveStatus = "saved" | "pending" | "saving" | "conflict" | "error" | "invalid";
export const AUTOSAVE_DELAY_MS = 1_500;

// Saves the lesson draft about 1.5 s after the last change, one request at a time, always against the latest known
// draft version. Every change is mirrored to local storage first, so nothing is lost if the tab closes mid-save.
// A stale version hands the server's draft and the local edit to `onConflict`; the local edit stays stored.
export function useLessonAutosave({ path, initialVersion, localKey, onSaved, onConflict, delay = AUTOSAVE_DELAY_MS }: {
  path: string; initialVersion: number; localKey: string; delay?: number;
  onSaved: (saved: LessonDraftSavedResponse, document: LessonDocument) => void;
  onConflict: (server: LessonDraft, local: LessonDocument) => void;
}) {
  const [status, setStatus] = useState<SaveStatus>("saved");
  const version = useRef(initialVersion);
  const pending = useRef<LessonDocument | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<boolean> | null>(null);
  const callbacks = useRef({ onSaved, onConflict });
  callbacks.current = { onSaved, onConflict };

  const stopTimer = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  const send = useCallback(async (document: LessonDocument): Promise<boolean> => {
    setStatus("saving");
    try {
      const response = await fetch(`${path}/draft`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ document, draftVersion: version.current }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const saved = lessonDraftSavedResponseSchema.parse(body);
        version.current = saved.draftVersion;
        if (pending.current) setStatus("pending");
        else { clearLocalLessonDraft(localKey); setStatus("saved"); }
        callbacks.current.onSaved(saved, document);
        return true;
      }
      const conflict = lessonDraftConflictSchema.safeParse(body);
      if (response.status === 409 && conflict.success) {
        stopTimer();
        const local = pending.current ?? document;
        pending.current = null;
        version.current = conflict.data.draft.version;
        storeLocalLessonDraft(localKey, { baseVersion: conflict.data.draft.version, document: local, conflict: true });
        setStatus("conflict");
        callbacks.current.onConflict(conflict.data.draft, local);
        return false;
      }
    } catch { /* offline or interrupted: kept as pending below */ }
    pending.current ??= document;
    setStatus("error");
    return false;
  }, [localKey, path]);

  // Sends the pending change now, waiting for any request already in flight. Resolves to whether everything is saved.
  const flush = useCallback(async (): Promise<boolean> => {
    stopTimer();
    if (inflight.current) await inflight.current;
    const document = pending.current;
    if (!document) return true;
    pending.current = null;
    const run = send(document);
    inflight.current = run;
    try { return await run; } finally { if (inflight.current === run) inflight.current = null; }
  }, [send]);

  const schedule = useCallback((document: LessonDocument) => {
    pending.current = document;
    storeLocalLessonDraft(localKey, { baseVersion: version.current, document });
    setStatus("pending");
    stopTimer();
    timer.current = setTimeout(() => void flush(), delay);
  }, [delay, flush, localKey]);

  // Adopts a server draft (after a conflict, discard, or publish) as the new base, dropping anything pending.
  const reset = useCallback((nextVersion: number) => {
    stopTimer();
    pending.current = null;
    version.current = nextVersion;
    setStatus("saved");
  }, []);

  const markInvalid = useCallback(() => { stopTimer(); pending.current = null; setStatus("invalid"); }, []);

  // Leaving the editor sends whatever is still pending; the local copy covers a send that never completes.
  useEffect(() => () => { if (pending.current) void flush(); }, [flush]);

  return { status, schedule, flush, reset, markInvalid, version: () => version.current };
}
