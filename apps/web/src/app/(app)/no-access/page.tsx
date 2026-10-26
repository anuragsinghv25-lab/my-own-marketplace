import { UserX } from 'lucide-react';
import { Card, EmptyState } from '@orbita/ui';

export default function NoAccessPage() {
  return (
    <Card>
      <EmptyState
        icon={<UserX size={22} />}
        title="No roles yet"
        description="Your account exists but has no roles. A platform admin needs to grant you one before you can use the platform."
      />
    </Card>
  );
}
