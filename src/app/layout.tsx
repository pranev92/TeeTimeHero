import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "TeeTime Hero",
  description: "Automated golf tee time booking — never miss an opening again",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark">
      <body className={`${geist.variable} min-h-full bg-zinc-950 font-sans text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
