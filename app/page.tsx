import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TOEFL Interactive Learning Center",
  description: "托福填词、句子精听、邮件写作与阅读练习工具。",
};

export default function Home() {
  return (
    <main className="site-shell">
      <iframe
        className="practice-frame"
        src="/practice/index.html"
        title="TOEFL Interactive Learning Center"
      />
    </main>
  );
}
