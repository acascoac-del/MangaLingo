import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const ASSETS = [
  { name: 'mangalingo-extension.zip', publicPath: '/mangalingo-extension.zip' },
  { name: 'manifest.json', publicPath: '/extension/manifest.json' },
  { name: 'background.js', publicPath: '/extension/background.js' },
  { name: 'content.js', publicPath: '/extension/content.js' },
  { name: 'popup.html', publicPath: '/extension/popup.html' },
];

export async function GET() {
  const pubDir = path.join(process.cwd(), 'public');
  const out: { name: string; size: number; url: string; mtime: string }[] = [];

  for (const a of ASSETS) {
    const fsPath = path.join(pubDir, a.publicPath);
    try {
      const st = await fs.stat(fsPath);
      out.push({
        name: a.name,
        size: st.size,
        url: a.publicPath,
        mtime: st.mtime.toISOString(),
      });
    } catch {
      // skip missing
    }
  }

  return NextResponse.json({ assets: out });
}
