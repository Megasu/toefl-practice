import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const socialImageUrl = `${protocol}://${host}/og.png`;

  return {
    title: "TOEFL 备考训练中心",
    description: "托福填词、句子组合、邮件写作与阅读练习工具。",
    openGraph: {
      title: "TOEFL 备考训练中心",
      description: "1143 道句子组合题，支持四类语法专项与整句判分。",
      type: "website",
      images: [{ url: socialImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "TOEFL 备考训练中心",
      description: "1143 道句子组合题，支持四类语法专项与整句判分。",
      images: [socialImageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
