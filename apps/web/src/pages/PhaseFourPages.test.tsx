import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscussionItem, Post } from "@wordinator/contracts";
import "../i18n";
import { DiscussionPanel, ReactionBar, discussionDraftKey } from "./PhaseFourPages";

const groupId = "20000000-0000-4000-8000-000000000001"; const userId = "10000000-0000-4000-8000-000000000001";
const session = { status: "signedIn" as const, user: { id: userId, displayName: "Ada", mustChangePassword: false }, groups: [{ id: groupId, name: "Study", language: "nl" as const, role: "member" as const, icon: "🇳🇱", iconUrl: null }], requests: [], deletedGroups: [] };
const basePost: Post = { id: "30000000-0000-4000-8000-000000000001", groupId, type: "question", body: "Waarom?", notes: null, author: { id: "40000000-0000-4000-8000-000000000001", displayName: "Lin", avatarUrl: null }, createdAt: 1, updatedAt: 1, edited: false, questions: [], expectedAnswers: [], commentCount: 1, reactionCount: 0, reactions: [], permissions: { edit: false, delete: false } };
const hiddenAnswer: DiscussionItem = { id: "50000000-0000-4000-8000-000000000001", parentId: null, kind: "text", body: "Omdat het mooi is.", author: { id: userId, displayName: "Ada", avatarUrl: null }, createdAt: 1, updatedAt: 1, edited: false, pinned: false, responseItems: [], reactions: [], permissions: { edit: true, delete: true, reply: true, pin: false }, replies: [] };

function json(value: unknown, status = 200) { return Promise.resolve(new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } })); }
function renderWithClient(node: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<MantineProvider><QueryClientProvider client={client}>{node}</QueryClientProvider></MantineProvider>); }

describe("Phase 4 discussion UI", () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); window.history.replaceState({}, "", "/"); });
  afterEach(() => cleanup());

  it("keeps answers concealed until an explicit reveal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => json({ items: [hiddenAnswer], count: 1, concealed: true, quickReactions: ["❤️", "💡", "👎"] })));
    renderWithClient(<DiscussionPanel post={basePost} groupId={groupId} session={session} />);
    expect(await screen.findByText("1 answer is concealed")).toBeVisible(); expect(screen.queryByText("Omdat het mooi is.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answers" }));
    expect(await screen.findByText("Omdat het mooi is.")).toBeVisible();
  });

  it("reveals and targets a directly linked answer", async () => {
    window.history.replaceState({}, "", `/?comment=${hiddenAnswer.id}`);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => json({ items: [hiddenAnswer], count: 1, concealed: true, quickReactions: ["❤️", "💡", "👎"] })));
    renderWithClient(<DiscussionPanel post={basePost} groupId={groupId} session={session} />);
    expect(await screen.findByText("Omdat het mooi is.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reveal answers" })).not.toBeInTheDocument();
  });

  it("persists reading wizard progress and clears it after publishing the complete set", async () => {
    const reading: Post = { ...basePost, type: "reading", body: "Een verhaal", questions: [{ id: "60000000-0000-4000-8000-000000000001", position: 0, text: "Wie?" }, { id: "60000000-0000-4000-8000-000000000002", position: 1, text: "Waar?" }], commentCount: 0 };
    const fetchMock = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ item: { ...hiddenAnswer, kind: "reading_response", body: null, responseItems: [{ position: 0, prompt: "Wie?", answer: "Ada", skipped: false, matched: null }, { position: 1, prompt: "Waar?", answer: "", skipped: true, matched: null }] } }, 201);
      return json({ items: [], count: 0, concealed: true, quickReactions: ["❤️", "💡", "👎"] });
    });
    vi.stubGlobal("fetch", fetchMock); renderWithClient(<DiscussionPanel post={reading} groupId={groupId} session={session} />);
    expect(await screen.findByText("Question 1 of 2")).toBeVisible(); fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "Ada" } }); fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Question 2 of 2")).toBeVisible();
    await waitFor(() => expect(localStorage.getItem(discussionDraftKey(userId, groupId, "reading_response", reading.id))).toContain("Ada"));
    fireEvent.click(screen.getByRole("button", { name: "Publish answer set" }));
    await waitFor(() => expect(localStorage.getItem(discussionDraftKey(userId, groupId, "reading_response", reading.id))).toBeNull());
  });

  it("rejects text in the custom reaction control and accepts a composed emoji", async () => {
    const fetchMock = vi.fn().mockImplementation(() => json({ reactions: [{ emoji: "👩🏽‍💻", count: 1, reacted: true, members: [{ id: userId, displayName: "Ada" }] }] })); vi.stubGlobal("fetch", fetchMock);
    renderWithClient(<ReactionBar reactions={[]} quickReactions={["❤️", "💡", "👎"]} path="/reaction" onChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Custom emoji"), { target: { value: "word" } }); fireEvent.click(screen.getByRole("button", { name: "Add" })); expect(screen.getByRole("alert")).toHaveTextContent("Choose exactly one emoji.");
    fireEvent.change(screen.getByLabelText("Custom emoji"), { target: { value: "👩🏽‍💻" } }); fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});
