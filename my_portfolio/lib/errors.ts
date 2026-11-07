import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export function fail(status: number, message: string, code?: string): never {
  throw new AppError(status, message, code);
}
export function errorResponse(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AppError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" / "),
        code: "VALIDATION",
      },
      { status: 400 },
    );
  if ((error as { code?: string })?.code === "P2002")
    return Response.json(
      { error: "이미 사용 중인 이름 또는 주소입니다.", code: "DUPLICATE" },
      { status: 409 },
    );
  if ((error as { code?: string })?.code === "P2034")
    return Response.json(
      {
        error: "다른 변경과 충돌했습니다. 새로 조회하고 다시 시도하세요.",
        code: "CONFLICT",
      },
      { status: 409 },
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "unknown",
  );
  return Response.json(
    {
      error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.",
      code: "INTERNAL",
    },
    { status: 500 },
  );
}
