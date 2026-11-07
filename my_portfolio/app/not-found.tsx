import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="site-main">
      <div className="empty-state">
        <p className="eyebrow">404 · PAGE NOT FOUND</p>
        <h1>페이지를 찾을 수 없습니다.</h1>
        <p>주소가 변경되었거나 현재 공개되지 않은 페이지입니다.</p>
        <div className="profile-ctas" style={{ justifyContent: "center" }}>
          <Link className="button" href="/">
            홈으로
          </Link>
          <Link className="button secondary" href="/projects">
            프로젝트 목록
          </Link>
          <Link className="button secondary" href="/blog">
            블로그 목록
          </Link>
        </div>
      </div>
    </main>
  );
}
