import type { Metadata } from 'next';
import { getDb } from '@orbita/db';
import { PageHeader } from '@orbita/ui';
import { listDefinitions } from '@orbita/reviews';
import { RulesForm } from '@/components/review/rules-form';
import { plain } from '@/lib/plain';
import { requirePermission } from '@/server/session';

export const metadata: Metadata = { title: 'Review rules' };

export default async function ReviewRulesPage() {
  const session = await requirePermission('read', 'ReviewDefinition');
  const defs = await listDefinitions(getDb(), session.ability);
  const editable = session.ability.can('update', 'ReviewDefinition');
  return (
    <>
      <PageHeader
        eyebrow="Admin console"
        title="Review rules"
        description="How each kind of request is reviewed: who decides at each stage, how long they have, and the reasons they can give. Changes apply to tasks opened after saving. Brand and catalog reviews arrive with R4 and R5."
      />
      <div className="space-y-4">
        {defs.map((d) => (
          <RulesForm key={d.id} def={plain(d) as never} editable={editable} />
        ))}
      </div>
    </>
  );
}
