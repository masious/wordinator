import { beforeEach, describe, expect, it } from "vitest";
import { azureRecognitionToken } from "../src/speechRecognition";
import { errorCode, request, resetDatabase, seedGroup, seedUser, signIn } from "./courseApi";
import { fetchWorker } from "./worker";

// The Microsoft recognizer's token route (C13, docs/words.md#recognizers). The test Worker has no Azure key, so a member's
// request reports the recognizer unavailable; the exchange itself is tested with a stand-in fetch.
const tokenPath = (groupId: string) => `/api/groups/${groupId}/speech-recognition/token`;

beforeEach(resetDatabase);

describe("speech recognition token route", () => {
  it("requires a signed-in member of the library", async () => {
    const owner = await seedUser("owner"); const groupId = await seedGroup("owner", owner);
    await seedUser("stranger");
    const anonymous = await fetchWorker(`https://wordinator.test${tokenPath(groupId)}`, { method: "POST" });
    expect(anonymous.status).toBe(401);
    const stranger = await request(tokenPath(groupId), await signIn("stranger"), undefined, "POST");
    expect(stranger.status).toBe(404);
  });

  it("reports the recognizer unavailable without an Azure key", async () => {
    const owner = await seedUser("owner"); const groupId = await seedGroup("owner", owner);
    const response = await request(tokenPath(groupId), await signIn("owner"), undefined, "POST");
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("SPEECH_RECOGNITION_UNAVAILABLE");
  });
});

describe("azureRecognitionToken", () => {
  it("trades the key for a token at the region's issueToken endpoint", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const issue = azureRecognitionToken("secret-key", "germanywestcentral", async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response("token-value");
    });
    expect(await issue()).toBe("token-value");
    expect(calls[0]!.url).toBe("https://germanywestcentral.api.cognitive.microsoft.com/sts/v1.0/issueToken");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("Ocp-Apim-Subscription-Key")).toBe("secret-key");
  });

  it("gives nothing when Azure refuses or cannot be reached", async () => {
    expect(await azureRecognitionToken("bad", "germanywestcentral", async () => new Response("no", { status: 401 }))()).toBeNull();
    expect(await azureRecognitionToken("key", "germanywestcentral", async () => { throw new Error("offline"); })()).toBeNull();
  });
});
