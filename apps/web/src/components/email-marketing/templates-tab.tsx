'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { EmailEditor } from '@/components/email-marketing/email-editor';
import {
  useEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
} from '@/hooks/use-email-marketing';
import type { EmailTemplate } from '@/types/email-marketing';
import { formatDateTime } from '@/lib/format';
import { useT } from '@/i18n/i18n-provider';
import {
  compileEmailHtml,
  defaultEmailBlocks,
  parseEmailHtml,
  type EmailBlock,
} from '@/lib/email-editor';

type TemplateForm = {
  name: string;
  subject: string;
  previewText: string;
  blocks: EmailBlock[];
};

export function EmailTemplatesTab() {
  const t = useT();
  const templates = useEmailTemplates({ pageSize: '50' });
  const create = useCreateEmailTemplate();
  const update = useUpdateEmailTemplate();
  const remove = useDeleteEmailTemplate();
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setForm({
      name: '',
      subject: '',
      previewText: '',
      blocks: defaultEmailBlocks(),
    });
  }

  function openEdit(row: EmailTemplate) {
    setEditing(row);
    setForm({
      name: row.name,
      subject: row.subject,
      previewText: row.previewText ?? '',
      blocks: parseEmailHtml(row.htmlBody),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> {t('emailMarketing.createTemplateShort')}
        </Button>
      </div>
      <DataTable
        getRowKey={(r) => r.id}
        data={(templates.data?.items ?? []).filter((row) => row.category !== 'campaign')}
        isLoading={templates.isLoading}
        isError={templates.isError}
        onRetry={() => templates.refetch()}
        emptyTitle={t('emailMarketing.emptyTemplates')}
        columns={[
          { key: 'name', header: 'Tên', cell: (r) => r.name },
          { key: 'subject', header: 'Tiêu đề', cell: (r) => r.subject },
          {
            key: 'active',
            header: 'Trạng thái',
            cell: (r) => <StatusBadge status={r.isActive ? 'Đang dùng' : 'Tắt'} />,
          },
          { key: 'updated', header: 'Cập nhật', cell: (r) => formatDateTime(r.updatedAt) },
          {
            key: 'actions',
            header: '',
            cell: (r) => (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-4 overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('emailMarketing.editTemplate') : t('emailMarketing.createTemplate')}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <form
              className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
              onSubmit={(e) => {
                e.preventDefault();
                const payload = {
                  name: form.name,
                  subject: form.subject,
                  previewText: form.previewText || undefined,
                  htmlBody: compileEmailHtml(form.blocks, form.previewText),
                };
                const done = () => setForm(null);
                if (editing) update.mutate({ id: editing.id, ...payload }, { onSuccess: done });
                else create.mutate(payload, { onSuccess: done });
              }}
            >
              <div className="space-y-1">
                <Label>Tên mẫu</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <EmailEditor
                subject={form.subject}
                previewText={form.previewText}
                blocks={form.blocks}
                onSubjectChange={(subject) => setForm((f) => (f ? { ...f, subject } : f))}
                onPreviewTextChange={(previewText) =>
                  setForm((f) => (f ? { ...f, previewText } : f))
                }
                onBlocksChange={(blocks) => setForm((f) => (f ? { ...f, blocks } : f))}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={create.isPending || update.isPending}>
                  Lưu
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Xóa mẫu email?"
        description="Mẫu sẽ bị xóa khỏi tổ chức hiện tại."
        destructive
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          remove.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
}
