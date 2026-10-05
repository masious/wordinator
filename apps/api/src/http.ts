import type { output, ZodType } from "zod";
import type { Context } from "hono";

export function apiError(context: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 429, code: string, message: string) {
  return context.json({ error: { code, message, requestId: context.get("requestId") } }, status);
}

export async function parseJson<S extends ZodType>(context: Context, schema: S): Promise<{ data: output<S> } | { response: Response }> {
  try {
    const raw = await context.req.text();
    if (new TextEncoder().encode(raw).byteLength > 131_072) {
      return { response: apiError(context, 413, "REQUEST_TOO_LARGE", "The request is too large.") };
    }
    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success) {
      return {
        response: context.json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Check the highlighted fields and try again.",
            issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
            requestId: context.get("requestId"),
          },
        }, 400),
      };
    }
    return { data: result.data };
  } catch {
    return { response: apiError(context, 400, "INVALID_JSON", "The request body must be valid JSON.") };
  }
}
