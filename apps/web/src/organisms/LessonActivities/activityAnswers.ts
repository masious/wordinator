import { useMutation } from "@tanstack/react-query";
import { activityAnswerResponseSchema } from "@wordinator/contracts/lesson-activities";
import { useRef, useState } from "react";
import { apiRequest } from "../../api";

// Shared by the activity page and its item components: answer attempts (one idempotency key per attempt) and device-local drafts.
export type InputMode = "typed" | "spoken";
// The answer payloads the contract accepts; word order is the positions of the question's tokens, in the learner's order.
export type AnswerInput = { kind: "choice"; optionId: string } | { kind: "text"; text: string } | { kind: "word_order"; order: number[] };
export type AnswerResult = ReturnType<typeof activityAnswerResponseSchema.parse>;

export const nonce = () => crypto.randomUUID();

// Drafts are device-local: namespaced by account, activity version, run, item and schema version, so another account or a changed
// activity never receives them.
const DRAFT_SCHEMA = "v1";
export const draftKey = (accountId: string, activityId: string, runId: string, itemId: string) =>
  `wordinator:lesson-activity:${DRAFT_SCHEMA}:${accountId}:${activityId}:${runId}:${itemId}`;
export function readDraft(key: string | null): string {
  if (!key) return "";
  try { return window.localStorage.getItem(key) ?? ""; } catch { return ""; }
}
export function writeDraft(key: string | null, value: string) {
  if (!key) return;
  try { if (value) window.localStorage.setItem(key, value); else window.localStorage.removeItem(key); } catch { /* storage unavailable: the draft lives in memory only */ }
}

// One answer attempt. The idempotency key is made once per attempt and reused by every submit of it (so a double click or a retry after a
// network error never creates a second answer); Try again starts a new attempt with a new key.
export function useAnswerAttempt(endpoint: string, runId: string, itemId: string, onSaved: () => void) {
  const key = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const mutation = useMutation({
    mutationFn: (input: { answer: AnswerInput; inputMode: InputMode; idempotencyKey: string }) => apiRequest(`${endpoint}/answers`, activityAnswerResponseSchema, {
      method: "POST", body: JSON.stringify({ runId, itemId, answer: input.answer, inputMode: input.inputMode, idempotencyKey: input.idempotencyKey }),
    }),
    onSuccess: (response) => { inFlight.current = false; setResult(response); onSaved(); },
    onError: () => { inFlight.current = false; },
  });
  const check = (answer: AnswerInput, inputMode: InputMode = "typed") => {
    if (inFlight.current) return;
    if (!key.current) key.current = nonce();
    inFlight.current = true;
    mutation.mutate({ answer, inputMode, idempotencyKey: key.current });
  };
  const retry = () => { key.current = null; setResult(null); mutation.reset(); };
  return { check, retry, result, pending: mutation.isPending, error: mutation.isError };
}
