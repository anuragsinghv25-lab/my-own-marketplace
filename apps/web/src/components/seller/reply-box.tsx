'use client';

import { useState } from 'react';
import { MessageSquareReply } from 'lucide-react';
import { Button, Card, Textarea } from '@orbita/ui';
import { useRunner } from '@/components/common/use-runner';
import type { ActionState } from '@/lib/action-state';
import { FilePicker, type PickedFile } from './file-picker';

/** The reviewer asked for more: what they said, and a reply with files. */
export function ReplyBox({ orgId, question, send }: { orgId: string; question: { by: string | null; reason: string | null; note: string }; send: (note: string, fileIds: string[]) => Promise<ActionState> }) {
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const { pending, run } = useRunner();
  return (
    <Card className="p-5 border-warn/40">
      <div className="flex gap-3">
        <MessageSquareReply size={18} className="text-warn shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <div className="font-medium">{question.by ?? 'The reviewer'} needs more information{question.reason ? `: ${question.reason}` : ''}</div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{question.note}</p>
          </div>
          <Textarea aria-label="Your reply" rows={3} placeholder="Your answer" value={note} onChange={(e) => setNote(e.target.value)} />
          <FilePicker orgId={orgId} value={files} onChange={setFiles} />
          <div className="flex justify-end">
            <Button loading={pending} disabled={note.trim().length < 2 && !files.length} onClick={() => run(() => send(note, files.map((f) => f.id)), () => { setNote(''); setFiles([]); })}>
              Send reply
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
