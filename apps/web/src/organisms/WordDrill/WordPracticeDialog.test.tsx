import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { WordPracticeCandidate } from "@wordinator/contracts/tutor";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { balancedPicks, WordPracticeDialog } from "./WordPracticeDialog";

const id = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const lessonId = id(1);
const candidate = (n: number, source: "weak" | "new"): WordPracticeCandidate =>
  ({ lessonId, wordId: id(100 + n), term: `woord ${n}`, meaning: `meaning ${n}`, lessonTitle: "At the station", source, recall: source === "new" ? 0.5 : 0.1 });
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }

describe("balancedPicks", () => {
  it("alternates weak and new words and lets one fill in when the other runs out", () => {
    const words = [candidate(1, "weak"), candidate(2, "weak"), candidate(3, "new"), candidate(4, "new"), candidate(5, "new")];
    expect(balancedPicks(words, 4).map((word) => word.term)).toEqual(["woord 1", "woord 3", "woord 2", "woord 4"]);
    expect(balancedPicks(words, 10)).toHaveLength(5);
    expect(balancedPicks(words, 0)).toEqual([]);
  });
});

describe("WordPracticeDialog", () => {
  let items: WordPracticeCandidate[];
  beforeEach(() => {
    items = Array.from({ length: 16 }, (_, n) => candidate(n + 1, n % 2 ? "new" : "weak"));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith("/api/ai/word-practice")) return response({ lessons: [{ id: lessonId, title: "At the station", courseTitle: "Dutch" }], items });
      if (path === "/api/ai/conversations" && init?.method === "POST") {
        return response({ conversation: { id: id(9), title: "", titleSource: "auto", archivedAt: null, provider: null, createdAt: 1, updatedAt: 1, tokens: 0 } }, 201);
      }
      return response({ error: { code: "NOT_FOUND", message: "Missing" } }, 404);
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("fills up to 15 words after the drill words and starts the practice with them", async () => {
    const onStarted = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MantineProvider><QueryClientProvider client={queryClient}>
      <WordPracticeDialog opened onClose={() => undefined} onStarted={onStarted} lessonIds={[lessonId, lessonId]}
        drillWords={[{ lessonId, wordId: id(50), term: "het kaartje", meaning: "the ticket" }, { lessonId, wordId: id(1), term: "woord 1", meaning: "meaning 1" }]} />
    </QueryClientProvider></MantineProvider>);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("15 words is the most for one practice."));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe(`/api/ai/word-practice?lessons=${lessonId}`);
    // A candidate with a drill word's term is left out; the drill words stay picked.
    expect(screen.getAllByText("woord 1")).toHaveLength(1);
    expect(screen.getByRole("checkbox", { name: /het kaartje/ })).toBeChecked();
    // Full: an unpicked word cannot be added until another is removed.
    const unpicked = screen.getAllByRole("checkbox").find((box) => !(box as HTMLInputElement).checked)!;
    expect(unpicked).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /het kaartje/ }));
    expect(screen.getByRole("status")).toHaveTextContent("14 of 15 words");
    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(id(9)));
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(String(post[1]!.body)) as { wordPractice: Array<{ wordId: string; source: string }> };
    expect(body.wordPractice).toHaveLength(14);
    expect(body.wordPractice[0]).toEqual({ lessonId, wordId: id(1), source: "drill" });
    expect(body.wordPractice.filter((word) => word.source === "weak")).toHaveLength(7);
  });
});
