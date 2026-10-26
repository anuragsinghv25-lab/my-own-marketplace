import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import '@fontsource-variable/inter';
import { Toaster } from '@orbita/ui';
import './globals.css';

const name = process.env.NEXT_PUBLIC_MARKETPLACE_NAME ?? 'Orbita';

export const metadata: Metadata = {
  title: { default: name, template: `%s · ${name}` },
  description: 'Governed product catalogs: categories, brands and catalogs with AI assist.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0e11' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('theme')?.value === 'dark' ? 'dark' : 'light';
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <body className="bg-bg text-ink antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
