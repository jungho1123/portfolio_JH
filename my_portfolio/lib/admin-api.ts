import { adminDocumentSchema, type ContentAction } from "@/lib/admin-types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public content?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error || "요청에 실패했습니다.",
      response.status,
      result.code,
      result.content,
    );
  return result;
}

// CACHE_PENDING means the mutation committed. Callers must apply its result once.
export async function requestContentAction(
  id: string,
  revision: number,
  action: ContentAction,
) {
  try {
    const result = await api<unknown>(`/api/admin/content/${id}`, "POST", {
      action,
      revision,
    });
    return {
      content: adminDocumentSchema.nullable().parse(result),
      cacheError: null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "CACHE_PENDING") {
      const parsed = adminDocumentSchema.nullable().safeParse(error.content);
      if (parsed.success)
        return { content: parsed.data, cacheError: error.message };
    }
    throw error;
  }
}
