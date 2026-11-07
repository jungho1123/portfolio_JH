import { requireAdmin } from "@/lib/admin";
import { flushPublicCache } from "@/lib/cache";
import { errorResponse } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    await flushPublicCache();
    return Response.json({ done: true });
  } catch (e) {
    return errorResponse(e);
  }
}
