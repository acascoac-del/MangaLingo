import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MangaLingo — API + Extensión Chrome",
  description: "Traduce mangas en un solo request: detección de globos + OCR + inpainting + traducción multilenguaje + render final. Demo web, API propia y extensión Chrome.",
  keywords: ["manga", "traductor", "OCR", "inpainting", "Chrome extension", "API", "MangaLingo engine"],
  authors: [{ name: "MangaLingo" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "MangaLingo — API + Extensión Chrome",
    description: "Pipeline completo de traducción de manga en un solo request. Demo web + extensión Chrome.",
    siteName: "MangaLingo",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MangaLingo",
    description: "Traducción de manga end-to-end: detección + OCR + inpainting + traducción + render",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
