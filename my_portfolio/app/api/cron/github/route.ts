import { publicHome } from "@/lib/public-data";
import { refreshGithub } from "@/lib/github";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new Response("Unauthorized", { status: 401 });
  const home = await publicHome();
  if (home.github) await refreshGithub(home.github);
  return Response.json({ checked: true });
}
