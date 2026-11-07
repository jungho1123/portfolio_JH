"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="notice error-notice">
      <h1>관리 화면을 불러오지 못했습니다.</h1>
      <p>연결과 설정을 확인하고 다시 시도하세요. 기기 복구본은 보존됩니다.</p>
      <button className="button secondary" onClick={reset}>
        다시 시도
      </button>{" "}
      <a className="text-link" href="/admin">
        로그인 화면으로
      </a>
    </div>
  );
}
