import { describe, expect, it } from "vitest";
import { adminAnalyticsQuerySchema, aiAnalyticsResponseSchema, learningAnalyticsResponseSchema, speechAnalyticsResponseSchema } from "./admin";

const counts = { lessonsCompleted: 1, drillReviews: 2, practiceAttempts: { lesson: 1, aiChat: 0, aiPractice: 3 }, pronunciationAttempts: 0 };
const learning = {
  days: 7, from: "2026-10-10", to: "2026-10-16",
  daily: [{ day: "2026-10-16", activeAccounts: 2, ...counts }],
  accounts: [{ userId: "u1", username: "ada", activeDays: 1, ...counts }],
};

describe("adminAnalyticsQuerySchema", () => {
  it("accepts 7, 30, and 90 days and defaults to 7", () => {
    expect(adminAnalyticsQuerySchema.parse({}).days).toBe(7);
    expect(adminAnalyticsQuerySchema.parse({ days: undefined }).days).toBe(7);
    expect(adminAnalyticsQuerySchema.parse({ days: "30" }).days).toBe(30);
    expect(adminAnalyticsQuerySchema.parse({ days: "90" }).days).toBe(90);
  });

  it("refuses any other range", () => {
    for (const days of ["0", "14", "365", "7.0", "", "abc"]) expect(adminAnalyticsQuerySchema.safeParse({ days }).success).toBe(false);
  });
});

describe("analytics responses", () => {
  it("accepts counts by day and account", () => {
    expect(learningAnalyticsResponseSchema.parse(learning)).toEqual(learning);
    expect(learningAnalyticsResponseSchema.safeParse({ ...learning, accounts: [{ ...learning.accounts[0], username: null }] }).success).toBe(true);
    const ai = { turns: 1, requests: 2, failures: 1, tokensIn: 10, tokensOut: 5, costMicroUsd: 3 };
    expect(aiAnalyticsResponseSchema.safeParse({
      days: 30, from: "2026-09-17", to: "2026-10-16", daily: [{ day: "2026-10-16", ...ai }],
      accounts: [{ userId: "u1", username: "ada", ...ai }], models: [{ provider: "azure", model: "gpt-4.1-mini", ...ai }],
    }).success).toBe(true);
    const speech = { requests: 2, characters: 240, cacheHits: 1, azureCalls: 1, azureCharacters: 120 };
    expect(speechAnalyticsResponseSchema.safeParse({
      days: 90, from: "2026-07-19", to: "2026-10-16", daily: [{ day: "2026-10-16", ...speech }], accounts: [{ userId: "u1", username: "ada", ...speech }],
    }).success).toBe(true);
  });

  it("refuses text fields, negative counts, unknown providers, and other ranges", () => {
    expect(learningAnalyticsResponseSchema.safeParse({ ...learning, accounts: [{ ...learning.accounts[0], answer: "Het huis" }] }).success).toBe(false);
    expect(learningAnalyticsResponseSchema.safeParse({ ...learning, daily: [{ ...learning.daily[0], term: "de hond" }] }).success).toBe(false);
    expect(learningAnalyticsResponseSchema.safeParse({ ...learning, daily: [{ ...learning.daily[0], drillReviews: -1 }] }).success).toBe(false);
    expect(learningAnalyticsResponseSchema.safeParse({ ...learning, days: 14 }).success).toBe(false);
    expect(learningAnalyticsResponseSchema.safeParse({ ...learning, from: "16/10/2026" }).success).toBe(false);
    const ai = { turns: 0, requests: 0, failures: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 };
    expect(aiAnalyticsResponseSchema.safeParse({ days: 7, from: "2026-10-10", to: "2026-10-16", daily: [], accounts: [], models: [{ provider: "anthropic", model: "x", ...ai }] }).success).toBe(false);
  });
});
