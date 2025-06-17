import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next S3 Uploader Demo",
  description: "Demo of the new router architecture for next-s3-uploader",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
