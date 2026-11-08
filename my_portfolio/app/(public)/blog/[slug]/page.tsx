import { Suspense } from "react";
import { DetailPage } from "@/components/public/pages";
import { postMetadata } from "@/lib/public-metadata";
export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  return postMetadata("BLOG", (await props.params).slug);
}
async function Content(props: { params: Promise<{ slug: string }> }) {
  return <DetailPage kind="BLOG" slug={(await props.params).slug} />;
}
export default function Page(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p role="status">본문을 불러오는 중…</p>}>
      <Content params={props.params} />
    </Suspense>
  );
}
