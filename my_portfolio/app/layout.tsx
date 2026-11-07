import type { Metadata } from "next";
import { Theme } from "@/components/ui/theme";
import "@fontsource-variable/noto-sans-kr";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_URL ||
      process.env.BETTER_AUTH_URL ||
      "http://localhost:3000",
  ),
  title: { default: "포트폴리오", template: "%s | 포트폴리오" },
  description: "프로젝트와 배움의 기록을 담은 개인 포트폴리오",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Theme>
          <a href="#main" className="skip-link">
            본문으로 건너뛰기
          </a>
          {children}
        </Theme>
      </body>
    </html>
  );
}
