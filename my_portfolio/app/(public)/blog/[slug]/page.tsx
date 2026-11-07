import { Suspense } from "react";
import { DetailPage, postMetadata } from "@/components/public/pages";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return postMetadata("BLOG", (await params).slug);
}
async function Content({ params }: { params: Promise<{ slug: string }> }) {
  return <DetailPage kind="BLOG" slug={(await params).slug} />;
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
