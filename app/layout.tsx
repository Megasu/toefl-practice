import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOEFL Interactive Learning Center",
  description: "托福填词、句子精听、邮件写作与阅读练习工具。",
};

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
