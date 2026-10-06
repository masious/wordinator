import { accountSettingsResponseSchema, apiErrorSchema, coursePageSchema, courseResponseSchema, discussionResponseSchema, groupShellResponseSchema, invitationResponseSchema, memberDirectoryResponseSchema, notificationPageSchema, postPageSchema, postResponseSchema, profileResponseSchema, restrictedNotificationPageSchema, sessionResponseSchema } from "@wordinator/contracts";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
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
    throw new ApiError(response.status, parsed.success ? parsed.data.error.code : "UNKNOWN_ERROR", parsed.success ? parsed.data.error.message : "Something went wrong.");
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

export const courseQueryOptions = (groupId: string, courseId: string) => queryOptions({
  queryKey: ["course", groupId, courseId] as const,
  queryFn: () => apiRequest(`/api/groups/${encodeURIComponent(groupId)}/courses/${encodeURIComponent(courseId)}`, courseResponseSchema),
  retry: false,
});
