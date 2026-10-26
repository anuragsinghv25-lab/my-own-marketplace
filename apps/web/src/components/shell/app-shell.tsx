'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Bell, LogOut, Menu as MenuIcon, Moon, Palette, Search, Sun, X } from 'lucide-react';
import * as React from 'react';
import {
  Avatar,
  Badge,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  OrbitaWordmark,
  cn,
} from '@orbita/ui';
import type { NavSection } from '@/lib/navigation';
import { NAV_ICONS } from './icons';

export interface ShellUser {
  name: string;
  email: string;
  roleLabels: string[];
}

export function AppShell({
  marketplace,
  user,
  sections,
  children,
  preview = false,
}: {
  marketplace: string;
  user: ShellUser;
  sections: NavSection[];
  children: React.ReactNode;
  /** Design-gallery preview: no navigation side effects. */
  preview?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // The mobile menu stays open only on the page where it was opened, so navigating closes it.
  const [mobileOpenOn, setMobileOpenOn] = React.useState<string | null>(null);
  const mobileOpen = mobileOpenOn === pathname;
  const setMobileOpen = (open: boolean) => setMobileOpenOn(open ? pathname : null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((section) => (
        <div key={section.area}>
          <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-mute">{section.label}</div>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = !item.release && (pathname === item.href || (item.href.split('/').length > 2 && pathname.startsWith(item.href + '/')));
              if (item.release) {
                return (
                  <li key={item.href}>
                    <span
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-mute/70 cursor-default"
                      title={`Arrives in ${item.release}`}
                    >
                      <Icon size={17} className="shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="text-[10px] rounded-full bg-soft text-mute px-1.5 py-0.5 font-semibold">{item.release}</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
                      active ? 'bg-accent/10 text-accent font-medium' : 'text-ink hover:bg-soft',
                    )}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className={cn('bg-bg text-ink', preview ? '' : 'min-h-screen')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:bg-card focus:px-3 focus:py-2 focus:rounded-lg"
      >
        Skip to content
      </a>

      {/* Top bar */}
      <header className="sticky top-0 z-40 h-[60px] glass border-b border-line flex items-center gap-2 px-4 sm:px-6">
        <button
          type="button"
          className="lg:hidden shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={18} /> : <MenuIcon size={18} />}
        </button>
        <Link href="/" className="shrink-0">
          <OrbitaWordmark name={marketplace} />
        </Link>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-4 hidden md:flex h-9 w-full max-w-sm items-center gap-2 rounded-xl border border-line bg-card/60 px-3 text-sm text-mute hover:border-accent/40"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search or jump to…</span>
          <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px]">⌘K</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="md:hidden shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
            aria-label="Search"
          >
            <Search size={18} />
          </button>
          <ThemeToggle />
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
                aria-label="Notifications"
              >
                <Bell size={18} />
              </button>
            </MenuTrigger>
            <MenuContent>
              <div className="w-72 px-3 py-6 text-center">
                <div className="mx-auto mb-3 h-11 w-11 rounded-2xl bg-accent/10 text-accent grid place-items-center">
                  <Bell size={18} />
                </div>
                <div className="text-sm font-semibold">You&apos;re all caught up</div>
                <p className="text-xs text-mute mt-1">Review assignments and approvals will appear here.</p>
              </div>
            </MenuContent>
          </Menu>
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="ml-1 rounded-full" aria-label="Account menu">
                <Avatar name={user.name || user.email} />
              </button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>
                <div className="text-sm font-semibold text-ink">{user.name || user.email}</div>
                <div className="text-xs text-mute">{user.email}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {user.roleLabels.map((r) => (
                    <Badge key={r} tone="accent" className="px-2 py-0.5 text-[11px]">
                      {r}
                    </Badge>
                  ))}
                </div>
              </MenuLabel>
              <MenuSeparator />
              <MenuItem icon={<Palette size={15} />} onSelect={() => !preview && router.push('/design')}>
                Design system
              </MenuItem>
              <MenuItem icon={<LogOut size={15} />} danger onSelect={() => !preview && signOut()}>
                Sign out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <div className="flex">
        <aside className="hidden lg:block sticky top-[60px] h-[calc(100vh-60px)] w-64 shrink-0 border-r border-line bg-card/40">
          {sidebar}
        </aside>
        {mobileOpen ? (
          <div className="lg:hidden fixed inset-0 top-[60px] z-30">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="relative h-full w-72 bg-card border-r border-line shadow-lift animate-slide-in">{sidebar}</aside>
          </div>
        ) : null}
        <main id="main" className="min-w-0 flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="mx-auto max-w-6xl animate-fade-in">{children}</div>
        </main>
      </div>

      {preview ? null : <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} sections={sections} />}
    </div>
  );
}

function signOut() {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/auth/signout';
  document.body.appendChild(form);
  form.submit();
}

/* ------------------------------------------------------------------ Theme */

export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  document.cookie = `theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
const readTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function ThemeToggle() {
  const theme = React.useSyncExternalStore(subscribeTheme, readTheme, () => null);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
      aria-label={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/* ------------------------------------------------------------------ Command palette (⌘K) */

function CommandPalette({
  open,
  onOpenChange,
  sections,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sections: NavSection[];
}) {
  const router = useRouter();
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-card shadow-lift animate-toast-in"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search size={16} className="text-mute" />
        <Command.Input placeholder="Jump to a page or run a command…" className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mute" />
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-mute">No matches.</Command.Empty>
        {sections.map((s) => (
          <Command.Group
            key={s.area}
            heading={s.label}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-mute"
          >
            {s.items
              .filter((i) => !i.release)
              .map((i) => {
                const Icon = NAV_ICONS[i.icon];
                return (
                  <Command.Item
                    key={i.href}
                    value={`${s.label} ${i.label}`}
                    onSelect={() => go(i.href)}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm cursor-pointer data-[selected=true]:bg-soft"
                  >
                    <Icon size={16} className="text-mute" />
                    {i.label}
                  </Command.Item>
                );
              })}
          </Command.Group>
        ))}
        <Command.Group
          heading="Commands"
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-mute"
        >
          <Command.Item
            value="Toggle dark mode theme"
            onSelect={() => {
              setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
              onOpenChange(false);
            }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm cursor-pointer data-[selected=true]:bg-soft"
          >
            <Moon size={16} className="text-mute" /> Toggle dark mode
          </Command.Item>
          <Command.Item
            value="Design system gallery"
            onSelect={() => go('/design')}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm cursor-pointer data-[selected=true]:bg-soft"
          >
            <Palette size={16} className="text-mute" /> Design system
          </Command.Item>
          <Command.Item
            value="Sign out log out"
            onSelect={signOut}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm cursor-pointer data-[selected=true]:bg-soft"
          >
            <LogOut size={16} className="text-mute" /> Sign out
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
