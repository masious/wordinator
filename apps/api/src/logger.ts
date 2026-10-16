type SafeLogValue = string | number | boolean | null | undefined;

export type SafeLogContext = Readonly<Record<string, SafeLogValue>>;

export function logInfo(event: string, context: SafeLogContext = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...context }));
}

// Warning severity in Workers Logs: something went wrong that the app handled, such as a tool call the model got wrong.
export function logWarn(event: string, context: SafeLogContext = {}): void {
  console.warn(JSON.stringify({ level: "warn", event, ...context }));
}

export function logError(event: string, context: SafeLogContext = {}): void {
  console.error(JSON.stringify({ level: "error", event, ...context }));
}

