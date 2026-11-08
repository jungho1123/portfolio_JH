/* eslint-disable @next/next/no-img-element -- Access-checked media routes resize images without a public optimizer cache. */
"use client";
import { useEffect, useState } from "react";
import { ArrowUp, Check, Copy, ArrowLeft, X, Expand } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const scroll = () => setVisible(window.scrollY > 500);
    scroll();
    addEventListener("scroll", scroll, { passive: true });
    return () => removeEventListener("scroll", scroll);
  }, []);
  return visible ? (
    <button
      className="back-top icon-button"
      aria-label="상단으로 이동"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        })
      }
    >
      <ArrowUp size={20} />
    </button>
  ) : null;
}
export function Share() {
  const [state, setState] = useState("");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.origin + location.pathname);
      setState("공유 링크를 복사했습니다.");
    } catch {
      setState("주소창의 링크를 직접 복사하세요.");
    }
  }
  return (
    <span className="inline-action">
      <button className="button secondary" onClick={copyLink}>
        {state.startsWith("공유") ? <Check size={16} /> : <Copy size={16} />}
        링크 복사
      </button>
      <span role="status" className="muted small">
        {state}
      </span>
    </span>
  );
}
export function BackToList(props: { href: string }) {
  function returnToList(e: React.MouseEvent<HTMLAnchorElement>) {
    try {
      const context = JSON.parse(
        sessionStorage.getItem(`portfolio:return:${props.href}`) || "null",
      );
      if (
        context?.to === location.pathname &&
        new URL(context.from, location.origin).pathname === props.href &&
        history.length > 1
      ) {
        e.preventDefault();
        history.back();
      }
    } catch {}
  }
  return (
    <a href={props.href} className="text-link" onClick={returnToList}>
      <ArrowLeft size={16} />
      목록으로 돌아가기
    </a>
  );
}
export function ZoomImage(props: { src: string; alt: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className="zoom-trigger"
        aria-label={`${props.alt || "본문 이미지"} 확대`}
      >
        <img src={props.src} alt={props.alt} loading="lazy" />
        <span>
          <Expand size={17} />
        </span>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="image-dialog">
          <Dialog.Title className="sr-only">
            {props.alt || "이미지 확대"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Escape 키 또는 닫기 버튼으로 돌아갑니다.
          </Dialog.Description>
          <img src={props.src} alt={props.alt} />
          <Dialog.Close
            className="icon-button image-close"
            aria-label="이미지 닫기"
          >
            <X size={22} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
