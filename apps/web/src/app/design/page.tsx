import type { Metadata } from 'next';
import Link from 'next/link';
import { defineAbilityFor } from '@orbita/authz';
import { OrbitaWordmark, buttonClass } from '@orbita/ui';
import { Gallery } from '@/components/design/gallery';
import { ThemeToggleStandalone } from '@/components/design/theme-toggle';
import { navigationFor } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Design system' };

/** Public gallery of the Orbita components, to compare side by side with the prototype. */
export default function DesignPage() {
  const sample = defineAbilityFor({
    userId: '00000000-0000-4000-8000-000000000000',
    grants: [{ role: 'category_checker', scopeType: 'global', scopeId: null }],
  });
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 h-[60px] glass border-b border-line flex items-center gap-3 px-4 sm:px-6">
        <OrbitaWordmark />
        <span className="text-sm text-mute hidden sm:inline">Design system</span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggleStandalone />
          <Link href="/" className={buttonClass('secondary', 'sm')}>
            Open the app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Orbita design system</h1>
        <p className="text-sm text-mute mt-1 mb-8 max-w-2xl">
          Tokens and components from <code>packages/ui</code>, extracted from the Orbita prototype. Toggle dark mode to check
          both themes.
        </p>
        <Gallery previewSections={navigationFor(sample)} />
      </main>
    </div>
  );
}
