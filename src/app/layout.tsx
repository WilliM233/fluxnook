import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fluxnook",
  description: "Your films, shows, books, comics and games, on shelves.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
