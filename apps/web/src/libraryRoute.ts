import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { sessionQueryOptions } from "./api";

// Library routes need a signed-in, set-up account. The single backing library record is a storage detail
// (docs/architecture.md), so routes resolve it from the session instead of carrying it in the URL.
export async function requireLibrary(queryClient: QueryClient) {
  const session = await queryClient.ensureQueryData(sessionQueryOptions());
  if (session.status !== "signedIn" || session.user.mustChangePassword || session.user.onboardingComplete === false || !session.groups[0]) throw redirect({ to: "/" });
  return { groupId: session.groups[0].id };
}
