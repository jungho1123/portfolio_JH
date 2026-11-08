// Safe in client and server modules; do not import Next's server error handling here.
export function errorMessage(
  error: unknown,
  fallback = "작업에 실패했습니다.",
) {
  return error instanceof Error ? error.message : fallback;
}
