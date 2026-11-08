"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUpRight } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ThemeSwitch } from "@/components/ui/theme";
export type SectionLink = { id: string; label: string };
export function Header(props: { name: string; sections: SectionLink[] }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="wordmark">
          {props.name || "PORTFOLIO"}
          <span className="status-dot" />
        </Link>
        <nav className="desktop-nav" aria-label="주 메뉴">
          {props.sections.map((s) => (
            <a key={s.id} href={`/#${s.id}`}>
              {s.label}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <ThemeSwitch />
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger
              className="icon-button mobile-only"
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content className="mobile-menu">
                <Dialog.Title>메뉴</Dialog.Title>
                <Dialog.Description className="sr-only">
                  홈의 섹션으로 이동합니다.
                </Dialog.Description>
                <Dialog.Close
                  className="icon-button close-button"
                  aria-label="메뉴 닫기"
                >
                  <X size={20} />
                </Dialog.Close>
                <nav aria-label="모바일 메뉴">
                  <Link href="/" onClick={() => setOpen(false)}>
                    홈<ArrowUpRight size={17} />
                  </Link>
                  {props.sections.map((s) => (
                    <a
                      key={s.id}
                      href={`/#${s.id}`}
                      onClick={() => setOpen(false)}
                    >
                      {s.label}
                      <ArrowUpRight size={17} />
                    </a>
                  ))}
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
