import type { Metadata } from "next";
import "./globals.css";
import { Fraunces, Inter } from "next/font/google";
import { cn } from "@/lib/utils";

// Deep Field's two faces (Ch 1.2): Fraunces for titles, Inter for text.
// next/font takes `axes` only on the variable font, so 400 and 600 are CSS
// weights here, not separate files.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  variable: "--font-heading",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Fluxnook",
  description: "Your films, shows, books, comics and games, on shelves.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("font-sans", inter.variable, fraunces.variable)}
    >
      <body>{children}</body>
    </html>
  );
}
