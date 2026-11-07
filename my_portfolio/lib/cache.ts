import { revalidatePath, revalidateTag } from "next/cache";
import { db } from "@/lib/prisma";
export async function flushPublicCache() {
  const jobs = await db.cacheJob.findMany({ select: { id: true } });
  if (!jobs.length) return;
  revalidateTag("portfolio", { expire: 0 });
  revalidatePath("/", "layout");
  await db.cacheJob.deleteMany({
    where: { id: { in: jobs.map((j) => j.id) } },
  });
}
