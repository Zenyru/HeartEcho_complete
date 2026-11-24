import type { Metadata } from "next";
import "./globals.css";
import { Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-outfit",
});

export const metadata: Metadata = {
  title: "HeartEcho",
  description: "A Friend that helps you calm down",
  // the tab icon is src/app/icon.svg (Next.js finds it by its name)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
   <html lang="en" className={outfit.variable}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
