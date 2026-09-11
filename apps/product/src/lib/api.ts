import { hc } from "hono/client";
import { z } from "zod";
import type { AppType } from "../../worker/app.js";

export const api = hc<AppType>("/", { init: { cache: "no-store" } });

const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
  }),
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  constructor(message: string, status: number, code: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type ApiResponse = Pick<Response, "ok" | "status" | "headers"> & {
  json(): Promise<unknown>;
};

export async function readResponse<T>(
  request: Promise<ApiResponse>,
  schema: z.ZodType<T>,
): Promise<T> {
  let response: ApiResponse;
  try {
    response = await request;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError("Unable to connect. Please try again.", 0, "NETWORK_ERROR");
  }
  const body: unknown = await response.json().catch(() => null);
  const requestId = response.headers.get("X-Request-ID") ?? undefined;
  if (!response.ok) {
    const parsed = errorResponse.safeParse(body);
    throw new ApiError(
      parsed.success
        ? parsed.data.error.message
        : "Unable to complete the request. Please try again.",
      response.status,
      parsed.success ? parsed.data.error.code : "REQUEST_FAILED",
      parsed.success ? (parsed.data.error.requestId ?? requestId) : requestId,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      "Received an unexpected response. Please try again.",
      response.status,
      "INVALID_RESPONSE",
      requestId,
    );
  return parsed.data;
}
