import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import worker from "../src/index";

// Requests to the Worker entry point, in place of `SELF.fetch`. The Workers pool (0.8.71, and still 0.23.0) wraps its `SELF`
// entrypoint prototype in one more Proxy on every request, so each request in a test file is slower than the last and long
// files time out. Background work a request hands to `waitUntil` is awaited after each test (test/setup.ts), as `SELF` did.
const pending: ExecutionContext[] = [];

export function fetchWorker(input: RequestInfo | URL, init?: RequestInit, extraEnv: Partial<Env> = {}) {
  const context = createExecutionContext();
  pending.push(context);
  return worker.fetch!(new Request(input, init), { ...env, ...extraEnv }, context);
}

export async function settleWorkerRequests() {
  await Promise.all(pending.splice(0).map(waitOnExecutionContext));
}
