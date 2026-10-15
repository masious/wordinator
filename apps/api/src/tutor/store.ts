import type { AiProvider } from "@wordinator/contracts/ai";
import {
  TUTOR_CONVERSATIONS_PAGE_SIZE, TUTOR_MESSAGES_PAGE_SIZE, toPublicPart, tutorStoredPartSchema,
  type TutorConversation, type TutorMessage, type TutorMessageStatus, type TutorStoredPart,
} from "@wordinator/contracts/tutor";

// Conversations and messages in D1 (docs/data-model.md#ai-tutor). Every read and write is scoped by the signed-in account's ID,
// so another account's conversation, message, or tool call is never found.

type ConversationRow = { id: string; title: string; archivedAt: number | null; createdAt: number; updatedAt: number };
const CONVERSATION_COLUMNS = "id, title, archived_at AS archivedAt, created_at AS createdAt, updated_at AS updatedAt";

type Cursor = [number, string];
export const encodeCursor = (createdAt: number, id: string) => btoa(JSON.stringify([createdAt, id]));
export function decodeCursor(value: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(atob(value));
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "number" && Number.isFinite(parsed[0]) && typeof parsed[1] === "string") return [parsed[0], parsed[1]];
  } catch { /* fall through */ }
  return null;
}

export const presentConversation = (row: ConversationRow): TutorConversation =>
  ({ id: row.id, title: row.title, archivedAt: row.archivedAt, createdAt: row.createdAt, updatedAt: row.updatedAt });

export async function readConversation(db: D1Database, userId: string, id: string): Promise<ConversationRow | null> {
  return db.prepare(`SELECT ${CONVERSATION_COLUMNS} FROM ai_conversations WHERE id = ? AND user_id = ?`).bind(id, userId).first<ConversationRow>();
}

// Most recently updated first; the cursor is the last row's `(updated_at, id)`.
export async function listConversations(db: D1Database, userId: string, archived: boolean, cursor: Cursor | null) {
  const rows = await db.prepare(
    `SELECT ${CONVERSATION_COLUMNS} FROM ai_conversations WHERE user_id = ? AND archived_at IS ${archived ? "NOT NULL" : "NULL"}
     ${cursor ? "AND (updated_at < ? OR (updated_at = ? AND id < ?))" : ""} ORDER BY updated_at DESC, id DESC LIMIT ?`,
  ).bind(userId, ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []), TUTOR_CONVERSATIONS_PAGE_SIZE + 1).all<ConversationRow>();
  const page = rows.results.slice(0, TUTOR_CONVERSATIONS_PAGE_SIZE); const tail = page.at(-1);
  return { items: page.map(presentConversation), nextCursor: rows.results.length > TUTOR_CONVERSATIONS_PAGE_SIZE && tail ? encodeCursor(tail.updatedAt, tail.id) : null };
}

export async function createConversation(db: D1Database, userId: string, now = Date.now()): Promise<ConversationRow> {
  const row: ConversationRow = { id: crypto.randomUUID(), title: "", archivedAt: null, createdAt: now, updatedAt: now };
  await db.prepare("INSERT INTO ai_conversations (id, user_id, title, archived_at, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)")
    .bind(row.id, userId, row.title, now, now).run();
  return row;
}

// Archiving keeps the conversation's `updated_at`, so it keeps its place when it comes back.
export async function setArchived(db: D1Database, userId: string, id: string, archived: boolean, now = Date.now()) {
  await db.prepare(`UPDATE ai_conversations SET archived_at = ${archived ? "COALESCE(archived_at, ?)" : "NULL"} WHERE id = ? AND user_id = ?`)
    .bind(...(archived ? [now] : []), id, userId).run();
  return readConversation(db, userId, id);
}

export const touchConversationStatement = (db: D1Database, userId: string, id: string, now: number, title?: string) => db.prepare(
  `UPDATE ai_conversations SET updated_at = MAX(updated_at, ?)${title !== undefined ? ", title = CASE WHEN title = '' THEN ? ELSE title END" : ""} WHERE id = ? AND user_id = ?`,
).bind(now, ...(title !== undefined ? [title] : []), id, userId);

// ---- Messages ----

export type MessageRow = {
  id: string; conversationId: string; role: "user" | "assistant"; parts: string; status: TutorMessageStatus;
  provider: AiProvider | null; model: string | null; createdAt: number;
};
export type StoredMessage = Omit<MessageRow, "parts"> & { parts: TutorStoredPart[] };
const MESSAGE_COLUMNS = "id, conversation_id AS conversationId, role, parts, status, provider, model, created_at AS createdAt";

// Parts are validated on read too; a part that no longer fits the contracts is left out rather than failing the conversation.
export function parseParts(raw: string): TutorStoredPart[] {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  return value.flatMap((part) => { const parsed = tutorStoredPartSchema.safeParse(part); return parsed.success ? [parsed.data] : []; });
}
const toStored = (row: MessageRow): StoredMessage => ({ ...row, parts: parseParts(row.parts) });

export const presentMessage = (message: StoredMessage): TutorMessage => ({
  id: message.id, conversationId: message.conversationId, role: message.role, status: message.status, parts: message.parts.map(toPublicPart),
  provider: message.provider, model: message.model, createdAt: message.createdAt,
});

// Newest first; the cursor is the last row's `(created_at, id)` and reads older messages.
export async function readMessagePage(db: D1Database, userId: string, conversationId: string, cursor: Cursor | null) {
  const rows = await db.prepare(
    `SELECT ${MESSAGE_COLUMNS} FROM ai_messages WHERE conversation_id = ? AND user_id = ?
     ${cursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(conversationId, userId, ...(cursor ? [cursor[0], cursor[0], cursor[1]] : []), TUTOR_MESSAGES_PAGE_SIZE + 1).all<MessageRow>();
  const page = rows.results.slice(0, TUTOR_MESSAGES_PAGE_SIZE); const tail = page.at(-1);
  return { items: page.map((row) => presentMessage(toStored(row))), nextCursor: rows.results.length > TUTOR_MESSAGES_PAGE_SIZE && tail ? encodeCursor(tail.createdAt, tail.id) : null };
}

// The most recent messages oldest first, for the model's history.
export async function readHistory(db: D1Database, userId: string, conversationId: string, limit = 40): Promise<StoredMessage[]> {
  const rows = await db.prepare(
    `SELECT ${MESSAGE_COLUMNS} FROM ai_messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(conversationId, userId, limit).all<MessageRow>();
  return rows.results.reverse().map(toStored);
}

export async function readMessage(db: D1Database, userId: string, conversationId: string, messageId: string): Promise<StoredMessage | null> {
  const row = await db.prepare(`SELECT ${MESSAGE_COLUMNS} FROM ai_messages WHERE id = ? AND conversation_id = ? AND user_id = ?`)
    .bind(messageId, conversationId, userId).first<MessageRow>();
  return row ? toStored(row) : null;
}

// The message that holds a component or confirmation with this tool call ID.
export async function findToolCallMessage(db: D1Database, userId: string, conversationId: string, toolCallId: string): Promise<StoredMessage | null> {
  const row = await db.prepare(
    `SELECT ${MESSAGE_COLUMNS} FROM ai_messages m WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'
       AND EXISTS (SELECT 1 FROM json_each(m.parts) p WHERE json_extract(p.value, '$.toolCallId') = ?
         AND json_extract(p.value, '$.type') IN ('component', 'confirmation'))
     LIMIT 1`,
  ).bind(conversationId, userId, toolCallId).first<MessageRow>();
  return row ? toStored(row) : null;
}

export async function hasAwaitingMessage(db: D1Database, userId: string, conversationId: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM ai_messages WHERE conversation_id = ? AND user_id = ? AND status = 'awaiting_user' LIMIT 1")
    .bind(conversationId, userId).first<{ found: number }>();
  return Boolean(row);
}

// The latest message time of a conversation, so a new message is ordered after it even within one millisecond.
export async function lastMessageAt(db: D1Database, conversationId: string): Promise<number> {
  const row = await db.prepare("SELECT MAX(created_at) AS at FROM ai_messages WHERE conversation_id = ?").bind(conversationId).first<{ at: number | null }>();
  return row?.at ?? 0;
}

export const insertMessageStatement = (db: D1Database, userId: string, message: StoredMessage) => db.prepare(
  "INSERT INTO ai_messages (id, conversation_id, user_id, role, parts, status, provider, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
).bind(message.id, message.conversationId, userId, message.role, JSON.stringify(message.parts), message.status, message.provider, message.model, message.createdAt);

/**
 * Stores an answered part in place, once: the update applies only while the message still waits for the learner and the part
 * is still unanswered, so a second answer, or two at once, changes nothing. Returns whether this call stored the answer.
 */
export async function storeAnswer(db: D1Database, userId: string, message: StoredMessage, parts: TutorStoredPart[], toolCallId: string): Promise<boolean> {
  const result = await db.prepare(
    `UPDATE ai_messages SET parts = ?, status = 'complete' WHERE id = ? AND user_id = ? AND status = 'awaiting_user'
       AND EXISTS (SELECT 1 FROM json_each(ai_messages.parts) p WHERE json_extract(p.value, '$.toolCallId') = ?
         AND json_extract(p.value, '$.type') IN ('component', 'confirmation') AND json_extract(p.value, '$.answeredAt') IS NULL)`,
  ).bind(JSON.stringify(parts), message.id, userId, toolCallId).run();
  return (result.meta.changes ?? 0) > 0;
}
