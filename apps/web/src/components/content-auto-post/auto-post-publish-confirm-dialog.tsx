'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFacebookCopy } from '@/lib/use-facebook-copy';

/** Reviewer-friendly publish confirmation — custom labels (not browser OK/Cancel). */
export function useAutoPostPublishConfirm() {
  const { autoPost: fb } = useFacebookCopy();
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const resolve = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const confirmPublish = useCallback(() => {
    return new Promise<boolean>((resolvePromise) => {
      resolverRef.current = resolvePromise;
      setOpen(true);
    });
  }, []);

  const PublishConfirmDialog = (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resolve(false);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        data-auto-post-publish-confirm="true"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{fb.publishNow}</DialogTitle>
          <DialogDescription>{fb.publishConfirm}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => resolve(false)}>
            {fb.publishConfirmCancel}
          </Button>
          <Button type="button" onClick={() => resolve(true)}>
            {fb.publishNow}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { confirmPublish, PublishConfirmDialog };
}
