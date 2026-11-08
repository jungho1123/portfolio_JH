"use client";
import { SiGithub as Github } from "react-icons/si";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearRecovery } from "@/lib/recovery";
export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/admin",
        errorCallbackURL: "/admin?login=failed",
      });
      if (result.error)
        throw new Error(
          "로그인에 실패했습니다. 허용 계정과 OAuth 설정을 확인하세요.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그인 실패");
      setBusy(false);
    }
  }
  return (
    <div className="login-card">
      <span className="eyebrow">PRIVATE WORKSPACE</span>
      <h1>기록을 관리하는 공간</h1>
      <p>등록된 GitHub 계정으로 로그인하세요.</p>
      <button className="button" disabled={busy} onClick={login}>
        <Github aria-hidden="true" size={17} />
        {busy ? "GitHub로 이동 중…" : "GitHub로 로그인"}
      </button>
      {error && (
        <p className="notice error-notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function Logout() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    if (
      !window.confirm(
        "로그아웃하면 이 기기의 임시복구 데이터가 정리됩니다. 저장하지 못한 내용을 확인했나요?",
      )
    )
      return;
    setBusy(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("로그아웃하지 못했습니다.");
      await clearRecovery();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Drop all authenticated client state after explicit logout.
      location.assign("/admin?logout=done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "로그아웃 실패");
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="icon-button"
        title="로그아웃"
        aria-label="로그아웃"
        disabled={busy}
        onClick={logout}
      >
        <LogOut size={17} />
      </button>
      {error && (
        <span role="alert" className="small">
          {error}
        </span>
      )}
    </>
  );
}
