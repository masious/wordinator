import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { ComposerForm, composerDraftKey } from "./PhaseThreePages";

const groupId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000001";
const session = {
  status: "signedIn" as const,
  user: { id: userId, displayName: "Ada", mustChangePassword: false },
  groups: [{ id: groupId, name: "Study room", language: "nl" as const, role: "creator" as const, icon: "🇳🇱", iconUrl: null }],
  deletedGroups: [],
  requests: [],
};

function renderComposer(onDone = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    onDone,
    ...render(<MantineProvider><QueryClientProvider client={queryClient}><ComposerForm groupId={groupId} session={session} onDone={onDone} onDiscard={vi.fn()} /></QueryClientProvider></MantineProvider>),
  };
}

describe("Phase 3 composer", () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  afterEach(() => cleanup());

  it("preserves independent type state and writes an account/group/version-scoped draft", async () => {
    renderComposer();
    fireEvent.change(screen.getByRole("textbox", { name: /Sentence/ }), { target: { value: "Een zin" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Post type" }));
    fireEvent.click(await screen.findByRole("option", { name: "Question" }));
    expect(screen.getByRole("textbox", { name: /Question/ })).toHaveValue("Een zin");
    fireEvent.change(screen.getByRole("textbox", { name: /Question/ }), { target: { value: "Een vraag?" } });
    await waitFor(() => expect(localStorage.getItem(composerDraftKey(userId, groupId))).toContain("Een vraag?"));
    const saved = JSON.parse(localStorage.getItem(composerDraftKey(userId, groupId))!);
    expect(saved.byType.shared_sentence.body).toBe("Een zin");
    expect(saved.byType.question.body).toBe("Een vraag?");
  });

  it("clears the draft only after a successful publication", async () => {
    const post = {
      id: "30000000-0000-4000-8000-000000000001", groupId, type: "shared_sentence", body: "Goedemorgen", notes: null,
      author: { id: userId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, edited: false,
      questions: [], expectedAnswers: [], commentCount: 0, reactionCount: 0, reactions: [], permissions: { edit: true, delete: true },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ post }), { status: 201, headers: { "content-type": "application/json" } })));
    const done = vi.fn(); renderComposer(done);
    fireEvent.change(screen.getByRole("textbox", { name: /Sentence/ }), { target: { value: "Goedemorgen" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish post" }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(localStorage.getItem(composerDraftKey(userId, groupId))).toBeNull();
  });
});
