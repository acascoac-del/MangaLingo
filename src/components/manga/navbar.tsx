'use client';

import Link from 'next/link';
import { Languages, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';

const LINKS = [
  { href: '#demo', label: 'Demo' },
  { href: '#features', label: 'Features' },
  { href: '#pipeline', label: 'Pipeline' },
  { href: '#download', label: 'Descargas' },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <div className="size-8 rounded-md bg-gradient-to-br from-fuchsia-500 to-amber-500 flex items-center justify-center">
            <Languages className="size-4 text-white" />
          </div>
          MangaLingo
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <Button key={l.href} asChild variant="ghost" size="sm">
              <a href={l.href}>{l.label}</a>
            </Button>
          ))}
          <Button asChild size="sm" className="ml-2">
            <a href="#download">Instalar extensión</a>
          </Button>
        </nav>

        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menú">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="text-left">MangaLingo</SheetTitle>
              <div className="mt-6 flex flex-col gap-2">
                {LINKS.map((l) => (
                  <Button
                    key={l.href}
                    asChild
                    variant="ghost"
                    className="justify-start"
                    onClick={() => setOpen(false)}
                  >
                    <a href={l.href}>{l.label}</a>
                  </Button>
                ))}
                <Button asChild className="mt-2" onClick={() => setOpen(false)}>
                  <a href="#download">Instalar extensión</a>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
