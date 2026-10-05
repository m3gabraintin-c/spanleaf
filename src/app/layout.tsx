import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: ${APP_TAGLINE}`, template: `%s | ${APP_NAME}` },
  description: "Spread one picture across a row of slides, then export each slide at 1080 pixels wide.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
