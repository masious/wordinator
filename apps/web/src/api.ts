import { accountSettingsResponseSchema, apiErrorSchema, courseContributorsResponseSchema, courseRefResponseSchema, courseSpeechCastResponseSchema, coursePageSchema, courseProgressResponseSchema, discussionResponseSchema, lessonProgressResponseSchema, groupShellResponseSchema, invitationResponseSchema, memberDirectoryResponseSchema, membershipAdminResponseSchema, notificationPageSchema, postPageSchema, postResponseSchema, profileResponseSchema, restrictedNotificationPageSchema, sessionResponseSchema, speechRecognitionTokenResponseSchema, type SpeechRecognitionTokenResponse } from "@wordinator/contracts";
import { courseDetailResponseSchema, courseWordsResponseSchema, lessonResponseSchema, wordBookmarkKeysResponseSchema, wordBookmarkLessonsResponseSchema, wordBookmarkPageSchema, wordDrillDeckSchema, wordSearchPageSchema, type WordDrillMode, type WordDrillSource } from "@wordinator/contracts/lesson-document";
import { lessonAiPracticesResponseSchema, tutorConversationPageSchema, tutorConversationResponseSchema, tutorMessagePageSchema, tutorProfileResponseSchema } from "@wordinator/contracts/tutor";
import { weakWordsPageSchema } from "@wordinator/contracts/weak-words";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

export class ApiError extends Error {
  // `body` is the whole error response, for errors that carry more than a code, such as a repeated lesson share's post ID.
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly body?: unknown) {
    super(message);
  }
}

export async function apiRequest<T>(path: string, schema: { parse(value: unknown): T }, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiError(response.status, parsed.success ? parsed.data.error.code : "UNKNOWN_ERROR", parsed.success ? parsed.data.error.message : "Something went wrong.", body);
  }
  return schema.parse(body);
}

export const sessionQueryOptions = () => queryOptions({
  queryKey: ["session"] as const,
  queryFn: () => apiRequest("/api/session", sessionResponseSchema),
});

export const invitationQueryOptions = (token: string) => queryOptions({
  queryKey: ["invitation", token] as const,
  queryFn: () => apiRequest(`/api/invitations/${encodeURIComponent(token)}`, invitationResponseSchema),
  retry: false,
});

export const groupQueryOptions = (groupId: string) => queryOptions({
  queryKey: ["group", groupId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}`, groupShellResponseSchema),
});

export const settingsQueryOptions = () => queryOptions({
  queryKey: ["settings"] as const,
  queryFn: () => apiRequest("/api/settings", accountSettingsResponseSchema),
});

export const profileQueryOptions = (groupId: string, userId: string) => queryOptions({
  queryKey: ["profile", groupId, userId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, profileResponseSchema),
  retry: false,
});

export const membersQueryOptions = (groupId: string) => queryOptions({
  queryKey: ["members", groupId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members`, memberDirectoryResponseSchema),
});

export const membershipsQueryOptions = (groupId: string) => queryOptions({
  queryKey: ["memberships", groupId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/memberships`, membershipAdminResponseSchema),
});

export const feedQueryOptions = (groupId: string) => infiniteQueryOptions({
  queryKey: ["posts", groupId] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, postPageSchema),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});

export const profilePostsQueryOptions = (groupId: string, userId: string) => infiniteQueryOptions({
  queryKey: ["profile-posts", groupId, userId] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, profileResponseSchema),
  getNextPageParam: (page) => page.posts.nextCursor ?? undefined,
});

export const postQueryOptions = (groupId: string, postId: string) => queryOptions({
  queryKey: ["post", groupId, postId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}`, postResponseSchema),
  retry: false,
});

export const discussionQueryOptions = (groupId: string, postId: string) => queryOptions({
  queryKey: ["discussion", groupId, postId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/discussion`, discussionResponseSchema),
  retry: false,
});

export const notificationsQueryOptions = (groupId: string) => queryOptions({
  queryKey: ["notifications", groupId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/notifications`, notificationPageSchema),
});

export const restrictedNotificationsQueryOptions = () => queryOptions({
  queryKey: ["restricted-notifications"] as const,
  queryFn: () => apiRequest("/api/notifications/status", restrictedNotificationPageSchema),
});

export const coursesQueryOptions = (groupId: string) => infiniteQueryOptions({
  queryKey: ["courses", groupId] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, coursePageSchema),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});

// Course and lesson URL segments are slugs, or legacy IDs that redirect to them. Slugs never change, so the mapping caches for the session.
export const courseRefQueryOptions = (groupId: string, courseRef: string, lessonRef?: string) => queryOptions({
  queryKey: ["course-ref", groupId, courseRef, lessonRef ?? null] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/course-refs/${encodeURIComponent(courseRef)}${lessonRef ? `?lesson=${encodeURIComponent(lessonRef)}` : ""}`, courseRefResponseSchema),
  staleTime: Infinity,
  retry: false,
});

export const courseQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course", groupId, courseId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}`, courseDetailResponseSchema),
  retry: false,
});

// The owner's dialogue cast editor: the course's speakers and the voices with their samples.
export const courseSpeechCastQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course-speech-cast", groupId, courseId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/speech-cast`, courseSpeechCastResponseSchema),
  retry: false,
});

export const courseContributorsQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course-contributors", groupId, courseId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/contributors`, courseContributorsResponseSchema),
  retry: false,
});

// Nested under the course key so every course refresh also refreshes progress.
export const courseProgressQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course", groupId, courseId, "progress"] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/progress`, courseProgressResponseSchema),
  retry: false,
});

// The viewer's own state of each published lesson for the Progress tab (C14); nested under the course key like progress.
export const lessonProgressQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course", groupId, courseId, "lesson-progress"] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/progress/lessons`, lessonProgressResponseSchema),
  retry: false,
});

// The viewer's course word recap; nested under the course key so course refreshes also refresh it.
export const courseWordsQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course", groupId, courseId, "words"] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/words`, courseWordsResponseSchema),
  retry: false,
});

// Word bookmarks (C9b) live under one group-level prefix, so a toggle can refresh every bookmark view at once.
export const wordBookmarksKey = (groupId: string) => ["word-bookmarks", groupId] as const;
export const wordBookmarkKeysQueryOptions = (groupId: string) => queryOptions({
  queryKey: [...wordBookmarksKey(groupId), "keys"] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/word-bookmarks/keys`, wordBookmarkKeysResponseSchema),
  retry: false,
});

// The Words tab's list: bookmarked words newest first, a hundred at a time, optionally of one lesson (C12a).
export const wordBookmarksQueryOptions = (groupId: string, lessonId?: string) => infiniteQueryOptions({
  queryKey: [...wordBookmarksKey(groupId), "list", lessonId ?? null] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/word-bookmarks?limit=100${lessonId ? `&lessonId=${encodeURIComponent(lessonId)}` : ""}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
    wordBookmarkPageSchema,
  ),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});

// The lessons holding the viewer's visible bookmarks, with counts, for the Words tab's lesson filter (C12a).
export const wordBookmarkLessonsQueryOptions = (groupId: string) => queryOptions({
  queryKey: [...wordBookmarksKey(groupId), "lessons"] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/word-bookmarks/lessons`, wordBookmarkLessonsResponseSchema),
  retry: false,
});

// A drill session's deck (C12e). Each session fetches its deck once: `run` tells sessions with the same settings apart, so Drill
// again draws a fresh deck, and the deck is never refetched in the background or kept once the session's page is left.
export type WordDrillSettings = { source: WordDrillSource; lesson?: string; direction: WordDrillMode };
export const wordDrillQueryOptions = (groupId: string, settings: WordDrillSettings, run: number) => queryOptions({
  queryKey: ["word-drill", groupId, settings.source, settings.lesson ?? null, settings.direction, run] as const,
  queryFn: () => apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/word-drill?source=${settings.source}${settings.source === "lesson" && settings.lesson ? `&lessonId=${encodeURIComponent(settings.lesson)}` : ""}&direction=${settings.direction}`,
    wordDrillDeckSchema,
  ),
  staleTime: Infinity, gcTime: 0, retry: false,
  refetchOnMount: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
});

// The Weak words view (C14d): the viewer's remembered terms, weakest first, twenty a page. The first page also says whether
// the viewer has any memory, which enables a Weak words drill without bookmarks.
export const weakWordsKey = (groupId: string) => ["weak-words", groupId] as const;
export const weakWordsQueryOptions = (groupId: string) => infiniteQueryOptions({
  queryKey: weakWordsKey(groupId),
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/weak-words${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, weakWordsPageSchema,
  ),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
  retry: false,
});

// Library word search (New words panel): published words of visible courses matching the query, twenty at a time.
export const wordSearchQueryOptions = (groupId: string, query: string) => infiniteQueryOptions({
  queryKey: ["word-search", groupId, query] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam, signal }) => apiRequest(
    `/api/groups/${encodeURIComponent(groupId)}/word-search?q=${encodeURIComponent(query)}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, wordSearchPageSchema, { signal },
  ),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
  retry: false,
});

export const lessonQueryOptions = (groupId: string, courseId: string, lessonId: string) => queryOptions({
  queryKey: ["course-lesson", groupId, courseId, lessonId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`, lessonResponseSchema),
  retry: false,
});

// The AI practices of a published lesson (C14h, docs/courses.md#ai-practices), read when the lesson page expands them.
export const lessonAiPracticesPath = (groupId: string, courseId: string, lessonId: string) =>
  `/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/ai-practices`;
export const lessonAiPracticesQueryOptions = (groupId: string, courseId: string, lessonId: string) => queryOptions({
  queryKey: ["course-lesson", groupId, courseId, lessonId, "ai-practices"] as const,
  queryFn: () => apiRequest(lessonAiPracticesPath(groupId, courseId, lessonId), lessonAiPracticesResponseSchema),
  retry: false,
});


// Microsoft speech recognition tokens (docs/words.md#recognizers), one per library, reused until shortly before Azure expires it.
// A refused token is forgotten, so the next listen asks for a new one.
const recognitionTokens = new Map<string, Promise<SpeechRecognitionTokenResponse>>();
export function speechRecognitionTokenSource(groupId: string) {
  return {
    get: async () => {
      const cached = recognitionTokens.get(groupId);
      if (cached) {
        const token = await cached.catch(() => null);
        if (token && token.expiresAt > Date.now()) return token;
      }
      const next = apiRequest(`/api/groups/${encodeURIComponent(groupId)}/speech-recognition/token`, speechRecognitionTokenResponseSchema, { method: "POST" });
      recognitionTokens.set(groupId, next);
      next.catch(() => { if (recognitionTokens.get(groupId) === next) recognitionTokens.delete(groupId); });
      return next;
    },
    forget: () => { recognitionTokens.delete(groupId); },
  };
}

// The AI tutor (C14i, docs/ai-tutor.md#api). Everything lives under one `tutor` prefix; a conversation's messages are nested
// under its key, newest page first, as the API returns them.
export const tutorKey = ["tutor"] as const;
export const tutorConversationsKey = [...tutorKey, "conversations"] as const;
export const tutorConversationsQueryOptions = (archived: boolean) => infiniteQueryOptions({
  queryKey: [...tutorConversationsKey, archived ? "archived" : "active"] as const,
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(`/api/ai/conversations?archived=${archived}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, tutorConversationPageSchema),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
});
export const tutorConversationQueryOptions = (conversationId: string) => queryOptions({
  queryKey: [...tutorKey, "conversation", conversationId] as const,
  queryFn: () => apiRequest(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, tutorConversationResponseSchema),
  retry: false,
});
export const tutorMessagesKey = (conversationId: string) => [...tutorKey, "conversation", conversationId, "messages"] as const;
export const tutorMessagesQueryOptions = (conversationId: string) => infiniteQueryOptions({
  queryKey: tutorMessagesKey(conversationId),
  initialPageParam: undefined as string | undefined,
  queryFn: ({ pageParam }) => apiRequest(`/api/ai/conversations/${encodeURIComponent(conversationId)}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`, tutorMessagePageSchema),
  getNextPageParam: (page) => page.nextCursor ?? undefined,
  retry: false,
});
export const tutorProfileQueryOptions = () => queryOptions({
  queryKey: [...tutorKey, "profile"] as const,
  queryFn: () => apiRequest("/api/ai/profile", tutorProfileResponseSchema),
  retry: false,
});
