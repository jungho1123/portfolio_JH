import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin";
import { adminContent } from "@/lib/content";
import { Editor } from "@/components/admin/editor";
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentAdmin();
  if (!user) redirect("/admin?expired=1");
  const content = await adminContent((await params).id);
  return (
    <Editor
      key={JSON.stringify([user.id, content.id])}
      initial={JSON.parse(JSON.stringify(content))}
      accountId={user.id}
    />
  );
}
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p role="status">초안을 불러오는 중…</p>}>
      <Content params={params} />
    </Suspense>
  );
}

export const instant = false;
