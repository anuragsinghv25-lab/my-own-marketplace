'use client';

import { useState } from 'react';
import { FolderTree, Inbox, Sparkles } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  CheckItem,
  Checkbox,
  ConfidenceChip,
  Dialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  Radio,
  Select,
  Skeleton,
  Stepper,
  Switch,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  Tooltip,
  toast,
} from '@orbita/ui';
import { AppShell } from '@/components/shell/app-shell';
import type { NavSection } from '@/lib/navigation';

const TOKENS = ['bg', 'card', 'ink', 'mute', 'line', 'soft', 'accent', 'ai', 'ok', 'warn', 'bad', 'onaccent'] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function Gallery({ previewSections }: { previewSections: NavSection[] }) {
  const [sw, setSw] = useState(true);
  return (
    <div className="space-y-10">
      <Section id="colours" title="Colour tokens">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {TOKENS.map((t) => (
            <div key={t} className="rounded-2xl border border-line bg-card p-2">
              <div className="h-14 rounded-xl border border-line" style={{ background: `rgb(var(--${t}))` }} />
              <div className="mt-2 px-1 text-xs font-medium">--{t}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-mute mt-2">The AI colour is separate on purpose: anything machine-suggested uses it.</p>
      </Section>

      <Section id="type" title="Typography">
        <Card className="p-5 space-y-2">
          <div className="text-3xl font-semibold tracking-tight">Page title, text-3xl</div>
          <div className="text-2xl font-semibold tracking-tight">Section title, text-2xl</div>
          <div className="text-xl font-semibold tracking-tight">Card title, text-xl</div>
          <p className="text-sm">Body text is text-sm: dense and calm, like the prototype.</p>
          <p className="text-sm text-mute">Secondary text uses the mute token and explains every field.</p>
          <p className="text-xs text-mute">Meta and chips use text-xs.</p>
        </Card>
      </Section>

      <Section id="buttons" title="Buttons">
        <Card className="p-5 flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="ai">
            <Sparkles size={16} /> Ask Orbit AI
          </Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
        </Card>
      </Section>

      <Section id="forms" title="Form controls">
        <Card className="p-5 grid md:grid-cols-2 gap-4">
          <Field label="Product title" htmlFor="g-title" hint="Shown to buyers. Keep it under 120 characters." required>
            <Input id="g-title" placeholder="e.g. Steel almirah, 4 shelves" />
          </Field>
          <Field label="Unit of measure" htmlFor="g-uom">
            <Select id="g-uom" defaultValue="pc">
              <option value="pc">Piece</option>
              <option value="kg">Kilogram</option>
              <option value="l">Litre</option>
            </Select>
          </Field>
          <Field label="Model number" htmlFor="g-model" error="This model already exists in the category. Pair with it instead?">
            <Input id="g-model" defaultValue="AX-200" aria-invalid />
          </Field>
          <Field label="Description" htmlFor="g-desc">
            <Textarea id="g-desc" placeholder="What makes this product different" />
          </Field>
          <div className="space-y-2.5 text-sm">
            <label className="flex items-center gap-2.5">
              <Checkbox defaultChecked /> Show MRP to buyers
            </label>
            <label className="flex items-center gap-2.5">
              <Radio name="g-r" defaultChecked /> Offer price with MRP
            </label>
            <label className="flex items-center gap-2.5">
              <Radio name="g-r" /> Offer price only
            </label>
          </div>
          <div className="space-y-2.5">
            <Switch checked={sw} onCheckedChange={setSw} label="Amber lane enabled" />
            <Tabs defaultValue="a">
              <TabsList>
                <TabsTrigger value="a">Flags</TabsTrigger>
                <TabsTrigger value="b">Specs</TabsTrigger>
                <TabsTrigger value="c">Rules</TabsTrigger>
              </TabsList>
              <TabsContent value="a" className="text-xs text-mute mt-2">
                Tabs switch views inside a card.
              </TabsContent>
              <TabsContent value="b" className="text-xs text-mute mt-2">
                Specifications.
              </TabsContent>
              <TabsContent value="c" className="text-xs text-mute mt-2">
                Rules.
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      </Section>

      <Section id="chips" title="Badges, chips and checks">
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Category manager</Badge>
            <Badge tone="ok">Approved</Badge>
            <Badge tone="warn">Needs attention</Badge>
            <Badge tone="bad">Rejected</Badge>
            <Badge tone="ai" icon={<Sparkles size={12} />}>
              AI suggested
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <ConfidenceChip value={0.92} />
            <ConfidenceChip value={0.71} />
            <ConfidenceChip value={0.4} />
          </div>
          <div className="grid md:grid-cols-3 gap-2">
            <CheckItem severity="blocking" title="BIS certificate missing">
              Required for this category. Upload it to submit.
            </CheckItem>
            <CheckItem severity="recommended" title="Add a second image">
              Listings with 3+ images are reviewed faster.
            </CheckItem>
            <CheckItem severity="passed" title="Price within band">
              ₹4,250 is inside the live band.
            </CheckItem>
          </div>
          <Stepper steps={['Evidence', 'Product facts', 'Offer', 'Submit']} current={1} />
        </Card>
      </Section>

      <Section id="data" title="Cards, tables and empty states">
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title="Review queue" description="Amber lane, oldest first" actions={<Badge tone="warn">3 due today</Badge>} />
            <Table>
              <THead>
                <TH>Request</TH>
                <TH>Seller</TH>
                <TH>Age</TH>
              </THead>
              <TBody>
                {[
                  ['Brand · Aurelia', 'Northwind Supplies', '2 d'],
                  ['Catalog · AX-200', 'Lakeside Traders', '5 h'],
                  ['Brand · Corvo', 'Blue Harbour', '1 h'],
                ].map(([a, b, c]) => (
                  <TR key={a}>
                    <TD className="font-medium">{a}</TD>
                    <TD className="text-mute">{b}</TD>
                    <TD className="text-mute">{c}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <EmptyState
              icon={<Inbox size={22} />}
              title="Nothing to review"
              description="When something lands in your queue it shows up here."
              action={<Button variant="secondary">Refresh</Button>}
            />
          </Card>
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar name="Asha Rao" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
          </Card>
          <Card className="p-5 flex flex-wrap items-center gap-2">
            <Dialog
              trigger={<Button variant="secondary">Open dialog</Button>}
              title="Send back to drafter"
              description="They will see your reason on the draft."
              footer={<Button>Send back</Button>}
            >
              <Field label="Reason" htmlFor="g-reason">
                <Textarea id="g-reason" placeholder="What needs to change" />
              </Field>
            </Dialog>
            <Drawer
              trigger={<Button variant="secondary">Open drawer</Button>}
              title="Category · Office chairs"
              description="Version 3 · Draft"
              footer={<Button>Submit for review</Button>}
            >
              <EmptyState icon={<FolderTree size={22} />} title="Side panel" description="Details open beside the list, as in the prototype." />
            </Drawer>
            <Button variant="secondary" onClick={() => toast.success('Saved', { description: 'Your changes are live.' })}>
              Show toast
            </Button>
            <Tooltip content="Tooltips explain icons and disabled actions">
              <Button variant="ghost">Hover me</Button>
            </Tooltip>
          </Card>
        </div>
      </Section>

      <Section id="shell" title="App shell">
        <p className="text-sm text-mute mb-3">
          The real shell, rendered with a sample category manager. Menus are generated from the signed-in user&apos;s
          roles.
        </p>
        <div className="overflow-hidden rounded-2xl border border-line shadow-lift [&_header]:!static [&_aside]:!static [&_aside]:!h-auto [&_main]:!py-6">
          <AppShell
            preview
            marketplace="Orbita"
            user={{ name: 'Asha Rao', email: 'asha@example.com', roleLabels: ['Category manager'] }}
            sections={previewSections}
          >
            <div className="text-2xl font-semibold tracking-tight">Welcome, Asha</div>
            <p className="text-sm text-mute mt-1">Category workbench home.</p>
          </AppShell>
        </div>
      </Section>
    </div>
  );
}
