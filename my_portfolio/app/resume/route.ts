import { publicHome } from "@/lib/public-data";
import { GET as serveMedia } from "@/app/media/[id]/route";
export async function GET(request: Request) {
  const home = await publicHome();
  if (!home.resumeId)
    return new Response("등록된 이력서가 없습니다.", { status: 404 });
  return serveMedia(request, {
    params: Promise.resolve({ id: home.resumeId }),
  });
}
