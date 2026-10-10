import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareNow | Doctor & Administrator Portal",
  description: "Care You Can Trust, Wherever You Are.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
