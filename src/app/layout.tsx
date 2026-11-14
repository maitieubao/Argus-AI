import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Argus AI",
  description: "Online assessment platform for teachers and candidates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
