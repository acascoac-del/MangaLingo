'use client';

import { Navbar } from '@/components/manga/navbar';
import { Hero } from '@/components/manga/hero';
import { Features } from '@/components/manga/features';
import { Pipeline } from '@/components/manga/pipeline';
import { DemoTranslator } from '@/components/manga/demo-translator';
import { DownloadPortal } from '@/components/manga/download-portal';
import { Footer } from '@/components/manga/footer';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <Pipeline />
        <DemoTranslator />
        <DownloadPortal />
      </main>
      <Footer />
    </div>
  );
}
