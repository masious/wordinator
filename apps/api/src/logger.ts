type SafeLogValue = string | number | boolean | null | undefined;

export type SafeLogContext = Readonly<Record<string, SafeLogValue>>;

export function logInfo(event: string, context: SafeLogContext = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...context }));
}

export function logError(event: string, context: SafeLogContext = {}): void {
  console.error(JSON.stringify({ level: "error", event, ...context }));
}

