import { describe, expect, it } from "vitest";
import { apiErrorSchema, completeOnboardingRequestSchema, createCommentRequestSchema, isSingleEmojiGrapheme, paginationQuerySchema, postInputSchema, quickReactionsSchema, registerRequestSchema, SLUG_MAX_LENGTH, slugify, slugSchema, toggleReactionRequestSchema } from ".";

describe("shared contracts", () => {
  it("coerces and bounds pagination input", () => {
    expect(paginationQuerySchema.parse({ limit: "25" })).toEqual({ limit: 25 });
    expect(() => paginationQuerySchema.parse({ limit: 101 })).toThrow();
  });

  it("accepts the stable error envelope", () => {
    expect(
      apiErrorSchema.parse({ error: { code: "NOT_FOUND", message: "Not found" } }),
    ).toBeDefined();
  });

  it("keeps registration immediate and validates the separate username setup", () => {
    expect(registerRequestSchema.parse({ email: "learner@example.test", password: "secret12" })).toEqual({ email: "learner@example.test", password: "secret12" });
    expect(completeOnboardingRequestSchema.parse({ username: "dutch_learner" }).username).toBe("dutch_learner");
    expect(() => completeOnboardingRequestSchema.parse({ username: "not a username" })).toThrow();
  });

  it("accepts single emoji graphemes and requires three unique reactions", () => {
    expect(isSingleEmojiGrapheme("👩🏽‍💻")).toBe(true);
    expect(isSingleEmojiGrapheme("🇳🇱")).toBe(true);
    expect(isSingleEmojiGrapheme("okay")).toBe(false);
    expect(quickReactionsSchema.parse(["👍", "❤️", "🌱"])).toHaveLength(3);
    expect(() => quickReactionsSchema.parse(["👍", "👍", "🌱"])).toThrow();
  });

  it("validates all post shapes and fill-in answer positions", () => {
    expect(postInputSchema.parse({ type: "shared_sentence", body: "Goedemorgen" }).type).toBe("shared_sentence");
    expect(postInputSchema.parse({ type: "question", body: "Hoe gaat het?", notes: "A hint" }).type).toBe("question");
    expect(postInputSchema.parse({ type: "reading", body: "Een verhaal", questions: [{ text: "Wie?" }] }).type).toBe("reading");
    expect(postInputSchema.parse({ type: "fill_in", body: "Ik … hier.", expectedAnswers: ["woon"] }).type).toBe("fill_in");
    expect(() => postInputSchema.parse({ type: "fill_in", body: "Ik … in …", expectedAnswers: ["woon"] })).toThrow();
    expect(() => postInputSchema.parse({ type: "fill_in", body: "No blank", expectedAnswers: [] })).toThrow();
  });

  it("validates discussion shapes and custom reaction graphemes", () => {
    const response = createCommentRequestSchema.parse({ kind: "reading_response", answers: ["", "antwoord"] });
    expect(response.kind === "reading_response" && response.answers).toHaveLength(2);
    expect(() => createCommentRequestSchema.parse({ kind: "text", body: "" })).toThrow();
    expect(toggleReactionRequestSchema.parse({ emoji: "👨‍👩‍👧‍👦", active: true }).active).toBe(true);
    expect(() => toggleReactionRequestSchema.parse({ emoji: "!!", active: true })).toThrow();
  });
});

describe("slugify", () => {
  it("folds accents and punctuation into a bounded, URL-safe slug", () => {
    expect(slugify("Dutch Foundations — Part II: Everyday Life")).toBe("dutch-foundations-part-ii-everyday-life");
    expect(slugify("Deutsch für Anfänger")).toBe("deutsch-fur-anfanger");
    expect(slugify("  ÉÉN Straße?! ")).toBe("een-strasse");
    expect(slugify("It's Ruud’s “huis”")).toBe("it-s-ruud-s-huis");
    expect(slugify("日本語")).toBe("");
    const long = slugify(`${"woord ".repeat(20)}einde`);
    expect(long.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slugSchema.safeParse(long).success).toBe(true);
    expect(slugSchema.safeParse("Not-A-Slug").success).toBe(false);
  });
});
