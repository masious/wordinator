import { SPEECH_TIMEOUT_MS } from "./speech";

// The Microsoft recognizer of spoken answers (docs/words.md#recognizers). The browser never sees the Azure key: the Worker trades
// it for a ten-minute authorization token, and the browser's Speech SDK streams the microphone straight to Azure with it.
export type IssueRecognitionToken = () => Promise<string | null>;

export function azureRecognitionToken(key: string, region: string, fetcher: typeof fetch = fetch): IssueRecognitionToken {
  return async () => {
    try {
      const response = await fetcher(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: "POST", headers: { "Ocp-Apim-Subscription-Key": key, "Content-Length": "0", "User-Agent": "wordinator" },
        signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
      if (!response.ok) { await response.body?.cancel(); return null; }
      const token = (await response.text()).trim();
      return token || null;
    } catch {
      return null;
    }
  };
}
