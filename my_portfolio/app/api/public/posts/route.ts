import { kindSchema } from "@/lib/schemas";
import { publicList, parseFilters } from "@/lib/public-data";
import { errorResponse } from "@/lib/errors";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      await publicList(
        kindSchema.parse(params.get("kind")),
        parseFilters(params),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
