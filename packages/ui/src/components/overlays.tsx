'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { Toaster as SonnerToaster, toast } from 'sonner';
import { cn } from '../cn';

/* ------------------------------------------------------------------ Dialog */

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 bg-card border border-line rounded-[22px] shadow-lift max-h-[90vh] flex flex-col outline-none animate-toast-in',
            className,
          )}
        >
          <div className="flex items-start gap-3 px-6 pt-5 pb-3 border-b border-line">
            <div className="flex-1 min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-mute mt-0.5">{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
              aria-label="Close"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="px-6 py-5 overflow-y-auto">{children}</div>
          {footer ? <div className="border-t border-line px-6 py-3 flex flex-wrap justify-end gap-2">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;

/* ------------------------------------------------------------------ Drawer (side panel) */

export function Drawer({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
  width = 480,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content
          style={{ width: `min(${width}px, 100vw)` }}
          className="fixed right-0 top-0 bottom-0 z-50 max-w-full bg-card border-l border-line shadow-lift animate-slide-in flex flex-col outline-none overflow-hidden"
        >
          <div className="shrink-0 flex items-start gap-3 px-5 sm:px-6 pt-4 pb-3 border-b border-line bg-card">
            <div className="flex-1 min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-mute mt-0.5">{description}</DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              className="shrink-0 h-9 w-9 rounded-full grid place-items-center text-mute hover:bg-soft"
              aria-label="Close"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-line bg-card px-5 sm:px-6 py-3 flex flex-wrap justify-end gap-2">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ Dropdown menu */

export const Menu = DropdownPrimitive.Root;
export const MenuTrigger = DropdownPrimitive.Trigger;

export function MenuContent({ children, align = 'end' }: { children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={8}
        className="z-50 min-w-56 bg-card border border-line rounded-2xl shadow-lift p-1.5 animate-toast-in"
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  danger,
  icon,
}: {
  children: React.ReactNode;
  onSelect?: (e: Event) => void;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      className={cn(
        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none cursor-pointer data-[highlighted]:bg-soft',
        danger ? 'text-bad' : 'text-ink',
      )}
    >
      {icon ? <span className="text-mute">{icon}</span> : null}
      {children}
    </DropdownPrimitive.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <DropdownPrimitive.Label className="px-3 pt-2 pb-1">{children}</DropdownPrimitive.Label>;
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1.5 h-px bg-line" />;
}

/* ------------------------------------------------------------------ Switch */

export function Switch({
  checked,
  onCheckedChange,
  label,
  id,
  name,
  defaultChecked,
}: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  label?: React.ReactNode;
  id?: string;
  name?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer">
      <SwitchPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        className="relative h-6 w-10 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-accent"
      >
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      {label}
    </label>
  );
}

/* ------------------------------------------------------------------ Tabs */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List className={cn('inline-flex gap-1 rounded-xl bg-soft p-1', className)}>{children}</TabsPrimitive.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className="h-8 rounded-lg px-3 text-sm text-mute transition-colors data-[state=active]:bg-card data-[state=active]:text-ink data-[state=active]:shadow-soft"
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export const TabsContent = TabsPrimitive.Content;

/* ------------------------------------------------------------------ Tooltip */

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={250}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-bg shadow-lift animate-fade-in"
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/* ------------------------------------------------------------------ Toast */

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex gap-3 items-start w-[min(380px,92vw)] rounded-2xl border border-line px-4 py-3 shadow-lift bg-card text-[14px] text-ink',
          title: 'font-semibold',
          description: 'text-mute text-[13px] mt-0.5',
          success: '[&_[data-icon]]:text-ok',
          error: '[&_[data-icon]]:text-bad',
          warning: '[&_[data-icon]]:text-warn',
        },
      }}
    />
  );
}

export { toast };
