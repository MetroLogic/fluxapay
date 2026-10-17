'use client';

import React, { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/Button';
import { RecurringScheduleModal } from './RecurringScheduleModal';

/** "Create Recurring Schedule" trigger that owns its modal state. */
export function RecurringScheduleButton({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Repeat className="h-4 w-4" />
        Create Recurring Schedule
      </Button>
      <RecurringScheduleModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onCreated={(_, state) => state !== 'optimistic' && onChanged?.()}
      />
    </>
  );
}
