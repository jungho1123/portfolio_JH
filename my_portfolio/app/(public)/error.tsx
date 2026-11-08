"use client";
import Link from "next/link";
export default function ErrorPage(props: { reset: () => void }) {
  return (
    <div className="empty-state">
      <h1>페이지를 불러오지 못했습니다.</h1>
      <p>잠시 후 다시 시도해 주세요.</p>
      <button className="button" onClick={props.reset}>
        다시 시도
      </button>
      <Link href="/" className="button secondary">
        홈으로
      </Link>
    </div>
  );
}
