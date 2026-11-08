import { Suspense } from "react";
import { DetailPage } from "@/components/public/pages";
import { postMetadata } from "@/lib/public-metadata";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return postMetadata("PROJECT", (await params).slug);
}
async function Content({ params }: { params: Promise<{ slug: string }> }) {
  return <DetailPage kind="PROJECT" slug={(await params).slug} />;
}
export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p role="status">본문을 불러오는 중…</p>}>
      <Content params={params} />
    </Suspense>
  );
}
