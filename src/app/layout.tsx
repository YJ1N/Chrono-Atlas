import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Inter — Linear/Vercel 계열 톤 (DESIGN_SYSTEM.md).
 * `next/font` 가 셀프호스팅하므로 외부 요청이 없다.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ChronoAtlas — Time Engine",
  description:
    "138억 년을 Google Maps 처럼 탐색합니다. 역사 웹사이트가 아니라 시간 엔진입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
