import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { groupQueryOptions, sessionQueryOptions } from "./api";

export async function requireSettingsSession(queryClient: QueryClient) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions());
  if (session.status !== "signedIn" || session.user.mustChangePassword) throw redirect({ to: "/" });
}

// A convenience redirect for ordinary members; the API still rejects every creator-only read and mutation.
export async function requireCreatorSettings(queryClient: QueryClient, groupId: string) {
  await requireSettingsSession(queryClient);
  const shell = await queryClient.ensureQueryData(groupQueryOptions(groupId));
  if (shell.group.role !== "creator") throw redirect({ to: "/groups/$groupId/settings/account", params: { groupId }, replace: true });
}
