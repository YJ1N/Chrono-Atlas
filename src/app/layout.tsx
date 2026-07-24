import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

/**
 * 타이포그래피는 두 서체뿐이다 (DESIGN_SYSTEM.md).
 *
 *   Inter            — UI · 숫자. Linear/Vercel 계열의 중립적 톤
 *   Instrument Serif — 사건 제목. National Geographic 계열의 무게감
 *
 * `next/font` 가 셀프호스팅하므로 외부 요청이 0이다.
 * 한글은 두 서체 모두 커버하지 않으므로 시스템 한글 서체로 폴백한다 —
 * macOS 는 Apple SD Gothic Neo, 그 외는 Noto Sans KR.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ChronoAtlas — Time Engine",
  description:
    "138억 년을 Google Maps 처럼 탐험합니다. 역사 웹사이트가 아니라 시간 엔진입니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
