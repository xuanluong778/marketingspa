'use client';

import { useMemo, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, RefreshCw, Download, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, StatusBadge } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import {
  useEmailContacts,
  useEmailContactFacets,
  useCreateEmailContact,
  useUpdateEmailContact,
  useDeleteEmailContact,
  useSyncEmailCrm,
  useImportEmailFile,
  useCreateEmailList,
  useDeleteEmailList,
} from '@/hooks/use-email-marketing';
import {
  CONTACT_STATUS_LABELS,
  type EmailContact,
  type EmailContactStatus,
} from '@/types/email-marketing';
import { useT } from '@/i18n/i18n-provider';

const SAMPLE_CSV = `Tên,Email,Điện thoại,Nguồn,Tag,Nhóm
Nguyễn An,an@example.com,0901234567,Facebook,VIP,Khách mới
`;

function emptyForm() {
  return {
    name: '',
    email: '',
    phone: '',
    source: '',
    tags: '',
    listId: '',
    status: 'SUBSCRIBED' as EmailContactStatus,
  };
}

export function EmailAudienceTab() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [listId, setListId] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = { page: String(page), pageSize: '20' };
    if (searchApplied) p.search = searchApplied;
    if (listId) p.listId = listId;
    if (status) p.status = status;
    if (tag) p.tag = tag;
    if (source) p.source = source;
    return p;
  }, [page, searchApplied, listId, status, tag, source]);

  const contacts = useEmailContacts(params);
  const facets = useEmailContactFacets();
  const createContact = useCreateEmailContact();
  const updateContact = useUpdateEmailContact();
  const deleteContact = useDeleteEmailContact();
  const syncCrm = useSyncEmailCrm();
  const importFile = useImportEmailFile();
  const createList = useCreateEmailList();
  const deleteList = useDeleteEmailList();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmailContact | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importListId, setImportListId] = useState('');
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const lists = facets.data?.lists ?? [];
  const total = contacts.data?.total ?? 0;
  const totalPages = contacts.data?.totalPages ?? 1;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(row: EmailContact) {
    setEditing(row);
    setForm({
      name: row.name ?? '',
      email: row.email,
      phone: row.phone ?? '',
      source: row.source ?? '',
      tags: (row.tags ?? []).join(', '),
      listId: row.listMembers?.[0]?.list.id ?? '',
      status: row.status,
    });
    setFormOpen(true);
  }

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearchApplied(search.trim());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Danh bạ email</h2>
          <p className="text-sm text-muted-foreground">
            Thêm khách, nhập Excel, hoặc lấy từ CRM / Funnel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Nhập Excel / CSV
          </Button>
          <Button
            variant="outline"
            disabled={syncCrm.isPending}
            onClick={() =>
              syncCrm.mutate(undefined, {
                onSuccess: (r) =>
                  setImportMsg(
                    `Đồng bộ xong: thêm ${r.imported}, cập nhật ${r.updated}, bỏ qua ${r.skipped}.`,
                  ),
              })
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Đồng bộ CRM / Funnel
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Thêm liên hệ
          </Button>
        </div>
      </div>

      {importMsg && <p className="text-sm text-muted-foreground">{importMsg}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Button
          size="sm"
          variant={!listId ? 'default' : 'outline'}
          onClick={() => {
            setListId('');
            setPage(1);
          }}
        >
          Tất cả
        </Button>
        {lists.map((g) => (
          <Button
            key={g.id}
            size="sm"
            variant={listId === g.id ? 'default' : 'outline'}
            onClick={() => {
              setListId(g.id);
              setPage(1);
            }}
          >
            {g.name}
            <span className="ml-1 text-xs opacity-70">{g._count?.members ?? 0}</span>
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setGroupOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Tạo nhóm
        </Button>
        {listId && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => deleteList.mutate(listId, { onSuccess: () => setListId('') })}
          >
            Xóa nhóm
          </Button>
        )}
      </div>

      <form onSubmit={applySearch} className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Tìm tên, email, SĐT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={status || '__all__'}
          onValueChange={(v) => {
            setStatus(v === '__all__' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Mọi trạng thái</SelectItem>
            <SelectItem value="SUBSCRIBED">Nhận email</SelectItem>
            <SelectItem value="UNSUBSCRIBED">Đã hủy</SelectItem>
            <SelectItem value="BOUNCED">Email lỗi</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={tag || '__all__'}
          onValueChange={(v) => {
            setTag(v === '__all__' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Mọi tag</SelectItem>
            {(facets.data?.tags ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={source || '__all__'}
          onValueChange={(v) => {
            setSource(v === '__all__' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Nguồn" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Mọi nguồn</SelectItem>
            {(facets.data?.sources ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">
          Tìm
        </Button>
      </form>

      <DataTable
        getRowKey={(r) => r.id}
        data={contacts.data?.items}
        isLoading={contacts.isLoading}
        isError={contacts.isError}
        onRetry={() => contacts.refetch()}
        emptyTitle={t('emailMarketing.emptyAudience')}
        columns={[
          { key: 'name', header: 'Tên', cell: (r) => r.name || '—' },
          { key: 'email', header: 'Email', cell: (r) => r.email },
          { key: 'phone', header: 'Điện thoại', cell: (r) => r.phone || '—' },
          { key: 'source', header: 'Nguồn', cell: (r) => r.source || '—' },
          {
            key: 'tags',
            header: 'Tag',
            cell: (r) =>
              r.tags?.length ? (
                <div className="flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <Badge key={t} variant="secondary" className="font-normal">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                '—'
              ),
          },
          {
            key: 'groups',
            header: 'Nhóm',
            cell: (r) =>
              r.listMembers?.length
                ? r.listMembers.map((m) => m.list.name).join(', ')
                : '—',
          },
          { key: 'stage', header: 'CRM Stage', cell: (r) => r.crmStage || '—' },
          {
            key: 'status',
            header: 'Email',
            cell: (r) => <StatusBadge status={CONTACT_STATUS_LABELS[r.status]} />,
          },
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

      {total > 20 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} khách · trang {page}/{totalPages}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Trước
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa liên hệ' : 'Thêm liên hệ'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const tags = form.tags
                .split(/[,;]/)
                .map((t) => t.trim())
                .filter(Boolean);
              const payload = {
                name: form.name || undefined,
                phone: form.phone || undefined,
                source: form.source || undefined,
                tags,
                listId: form.listId || undefined,
              };
              const done = () => setFormOpen(false);
              if (editing) {
                updateContact.mutate({ id: editing.id, ...payload, status: form.status }, { onSuccess: done });
              } else {
                createContact.mutate({ email: form.email, ...payload }, { onSuccess: done });
              }
            }}
          >
            <div className="space-y-1">
              <Label>Tên</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                required={!editing}
                disabled={!!editing}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Điện thoại</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Nguồn</Label>
              <Input
                placeholder="Facebook, Website..."
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Tag (cách nhau bằng dấu phẩy)</Label>
              <Input
                placeholder="VIP, chăm sóc"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Nhóm</Label>
              <Select
                value={form.listId || '__none__'}
                onValueChange={(v) => setForm({ ...form, listId: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Không gán nhóm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không gán nhóm</SelectItem>
                  {lists.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editing && (
              <div className="space-y-1">
                <Label>Trạng thái email</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v as EmailContactStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SUBSCRIBED">Nhận email</SelectItem>
                    <SelectItem value="UNSUBSCRIBED">Đã hủy</SelectItem>
                    <SelectItem value="BOUNCED">Email lỗi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={createContact.isPending || updateContact.isPending}>
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo nhóm khách hàng</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createList.mutate(
                { name: groupName },
                {
                  onSuccess: () => {
                    setGroupOpen(false);
                    setGroupName('');
                  },
                },
              );
            }}
          >
            <Input
              placeholder="Ví dụ: Khách mới, VIP"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            <DialogFooter>
              <Button type="submit" disabled={createList.isPending}>
                Tạo nhóm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nhập từ Excel / CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Cột nhận diện: Tên, Email, Điện thoại, Nguồn, Tag, Nhóm. Email là bắt buộc.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'mau-danh-ba-email.csv';
                a.click();
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Tải file mẫu
            </Button>
            <div className="space-y-1">
              <Label>Thêm vào nhóm (tuỳ chọn)</Label>
              <Select
                value={importListId || '__none__'}
                onValueChange={(v) => setImportListId(v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không gán nhóm</SelectItem>
                  {lists.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.txt"
              className="block w-full text-sm"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Đóng
            </Button>
            <Button
              disabled={importFile.isPending}
              onClick={() => {
                const file = fileRef.current?.files?.[0];
                if (!file) return;
                importFile.mutate(
                  { file, listId: importListId || undefined },
                  {
                    onSuccess: (r) => {
                      setImportOpen(false);
                      setImportMsg(
                        `Nhập file xong: thêm ${r.imported}, cập nhật ${r.updated}, bỏ qua ${r.skipped}.`,
                      );
                    },
                  },
                );
              }}
            >
              Nhập
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Xóa liên hệ?"
        description="Khách này sẽ ra khỏi danh bạ email của tổ chức."
        destructive
        isPending={deleteContact.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          deleteContact.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
        }}
      />
    </div>
  );
}
