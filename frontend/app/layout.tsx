import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
const font = Geist({ subsets: ["latin"], variable: "--font-sans" });
export const metadata: Metadata = {
  title: {
    default: "GuardLink · Protection, together.",
    template: "%s · GuardLink",
  },
  description:
    "Member-owned protection. Submit once, understand the decision, follow the payment.",
  robots: { index: true, follow: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={font.variable}>{children}</body>
    </html>
  );
}
