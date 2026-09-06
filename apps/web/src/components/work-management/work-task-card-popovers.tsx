'use client';

import { useMemo, useState, forwardRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import {
  Calendar,
  Check,
  CheckSquare,
  Clock,
  FormInput,
  Paperclip,
  Pencil,
  Plus,
  Tag,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  buildLabelCatalog,
  encodeWorkLabel,
  filterByQuery,
  parseWorkLabel,
  renameLabelToken,
  toggleToken,
  WORK_LABEL_COLORS,
  type WorkLabelToken,
} from '@/lib/work-task-detail';
import type { HrmEmployee } from '@/types/hrm';

const lightInput =
  'border-slate-200 bg-white text-black placeholder:text-slate-400 focus-visible:ring-slate-300 focus-visible:ring-offset-0 focus-visible:ring-offset-white';

export type CardPopoverKey = 'add' | 'labels' | 'dates' | 'checklist' | 'members' | null;

function PopoverShell({
  title,
  children,
  onClose,
  className,
  bodyClassName,
  headerClassName,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div
        className={cn(
          'relative border-b border-slate-200/80 px-10 py-3 dark:border-slate-800',
          headerClassName,
        )}
      >
        <p className="text-center text-[13px] font-semibold leading-none text-slate-800 dark:text-slate-100">
          {title}
        </p>
        <button
          type="button"
          aria-label="Đóng"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={onClose}
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
      <div className={cn('p-2', bodyClassName)}>{children}</div>
    </div>
  );
}

/** Must forward ref — required by Radix PopoverTrigger `asChild`. */
const ActionChip = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function ActionChip({ active, className, children, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium shadow-sm transition-colors',
        active
          ? 'border-[#172b4d] bg-[#172b4d] text-white hover:bg-[#0c1f3d]'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/** Menu row for "Thêm vào thẻ" — matches sample (icon square + title + subtitle). */
function AddMenuItem({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:hover:bg-slate-800',
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-[0_0_0_1px_rgba(9,30,66,0.02)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
        {icon}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[13px] font-semibold leading-tight text-slate-900 dark:text-slate-50">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-slate-500 dark:text-slate-400">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

export function WorkTaskActionPopovers({
  popover,
  onPopoverChange,
  labels,
  onLabelsChange,
  startDate,
  deadline,
  onStartDateChange,
  onDeadlineChange,
  onSaveDates,
  checklistTitle,
  onChecklistTitleChange,
  onAddChecklist,
  employees,
  assigneeIds,
  onAssigneesChange,
  onOpenFiles,
  onOpenCustomFields,
}: {
  popover: CardPopoverKey;
  onPopoverChange: (key: CardPopoverKey) => void;
  labels: string[];
  onLabelsChange: (next: string[]) => void;
  startDate: string;
  deadline: string;
  onStartDateChange: (v: string) => void;
  onDeadlineChange: (v: string) => void;
  onSaveDates: () => void;
  checklistTitle: string;
  onChecklistTitleChange: (v: string) => void;
  onAddChecklist: () => void;
  employees: HrmEmployee[];
  assigneeIds: string[];
  onAssigneesChange: (next: string[]) => void;
  onOpenFiles: () => void;
  onOpenCustomFields?: () => void;
}) {
  const [labelQuery, setLabelQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [editingToken, setEditingToken] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editColor, setEditColor] = useState<string>('green');
  const [newLabelTitle, setNewLabelTitle] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('green');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [colorblind, setColorblind] = useState(false);
  const [catalogExtras, setCatalogExtras] = useState<string[]>([]);

  const catalog = useMemo(() => buildLabelCatalog(labels, catalogExtras), [labels, catalogExtras]);
  const filteredLabels = useMemo(
    () => filterByQuery(catalog, labelQuery, (l) => `${l.title || l.token} ${l.colorId}`.trim()),
    [catalog, labelQuery],
  );
  const filteredEmployees = useMemo(
    () => filterByQuery(employees, memberQuery, (e) => e.name),
    [employees, memberQuery],
  );

  function open(key: Exclude<CardPopoverKey, null>) {
    onPopoverChange(key);
  }

  function close() {
    onPopoverChange(null);
    setCreatingLabel(false);
    setEditingToken(null);
  }

  /** Avoid race when closing one popover while opening another (Add → Nhãn). */
  function onKeyOpenChange(key: Exclude<CardPopoverKey, null>, nextOpen: boolean) {
    if (nextOpen) {
      onPopoverChange(key);
      return;
    }
    // Only clear if this key is still the active one
    if (popover === key) onPopoverChange(null);
  }

  function selectLabel(token: string) {
    onLabelsChange(toggleToken(labels, token));
  }

  function startEdit(row: WorkLabelToken) {
    setEditingToken(row.token);
    setEditTitle(row.title || (row.colorId === 'custom' ? row.token : ''));
    setEditColor(row.colorId === 'custom' ? 'green' : row.colorId);
  }

  function commitEdit() {
    if (!editingToken) return;
    const next = renameLabelToken(labels, editingToken, editColor, editTitle);
    // If renamed color-only base label title, also keep it selected
    const encoded = encodeWorkLabel(editColor, editTitle);
    setCatalogExtras((prev) =>
      Array.from(
        new Set([...prev, encoded].filter((t) => !WORK_LABEL_COLORS.some((c) => c.id === t))),
      ),
    );
    onLabelsChange(next.includes(encoded) ? next : toggleToken(next, encoded));
    setEditingToken(null);
  }

  function createLabel() {
    const token = encodeWorkLabel(newLabelColor, newLabelTitle || undefined);
    setCatalogExtras((prev) => Array.from(new Set([...prev, token])));
    if (!labels.includes(token)) onLabelsChange([...labels, token]);
    setNewLabelTitle('');
    setCreatingLabel(false);
  }

  function LabelBar({ row, dense }: { row: WorkLabelToken; dense?: boolean }) {
    return (
      <span
        className={cn(
          'block flex-1 rounded-md',
          dense ? 'h-7' : 'h-8',
          colorblind && 'ring-1 ring-inset ring-black/20',
        )}
        style={{
          backgroundColor: row.hex,
          backgroundImage: colorblind
            ? 'repeating-linear-gradient(45deg, rgba(0,0,0,.12) 0 4px, transparent 4px 8px)'
            : undefined,
        }}
        title={row.title || row.token}
      >
        {row.title ? (
          <span className="flex h-full items-center px-2 text-xs font-semibold text-white drop-shadow-sm">
            {row.title}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pl-9">
      {/* Thêm — “Thêm vào thẻ” (mẫu Trello) */}
      <Popover
        modal={false}
        open={popover === 'add'}
        onOpenChange={(o) => onKeyOpenChange('add', o)}
      >
        <PopoverTrigger asChild>
          <ActionChip
            active={popover === 'add'}
            className={cn('gap-1 px-3 text-[13px]', popover === 'add' && 'shadow-md')}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Thêm
          </ActionChip>
        </PopoverTrigger>
        <PopoverContent
          className="z-[300] w-[min(304px,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200 p-0 shadow-[0_8px_16px_-4px_rgba(9,30,66,0.25),0_0_1px_rgba(9,30,66,0.31)] dark:border-slate-700"
          align="start"
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <PopoverShell
            title="Thêm vào thẻ"
            onClose={close}
            bodyClassName="space-y-0 px-1 pb-2 pt-1"
            headerClassName="border-slate-200"
          >
            <AddMenuItem
              icon={<Tag className="h-4 w-4" strokeWidth={1.75} />}
              title="Nhãn"
              subtitle="Sắp xếp, phân loại và ưu tiên"
              onClick={() => open('labels')}
            />
            <AddMenuItem
              icon={<Clock className="h-4 w-4" strokeWidth={1.75} />}
              title="Ngày"
              subtitle="Ngày bắt đầu, ngày hết hạn và lời nhắc"
              onClick={() => open('dates')}
            />
            <AddMenuItem
              icon={<CheckSquare className="h-4 w-4" strokeWidth={1.75} />}
              title="Việc cần làm"
              subtitle="Thêm tác vụ con"
              onClick={() => open('checklist')}
            />
            <AddMenuItem
              icon={<User className="h-4 w-4" strokeWidth={1.75} />}
              title="Thành viên"
              subtitle="Chỉ định thành viên"
              onClick={() => open('members')}
            />
            <AddMenuItem
              icon={<Paperclip className="h-4 w-4" strokeWidth={1.75} />}
              title="Đính kèm"
              subtitle="Thêm liên kết, trang, hạng mục công việc, v.v."
              onClick={() => {
                close();
                onOpenFiles();
              }}
            />
            <AddMenuItem
              icon={<FormInput className="h-4 w-4" strokeWidth={1.75} />}
              title="Trường tùy chỉnh"
              subtitle="Tạo trường của riêng bạn"
              onClick={() => {
                close();
                onOpenCustomFields?.();
              }}
            />
          </PopoverShell>
        </PopoverContent>
      </Popover>

      {/* Nhãn */}
      <Popover
        modal={false}
        open={popover === 'labels'}
        onOpenChange={(o) => onKeyOpenChange('labels', o)}
      >
        <PopoverTrigger asChild>
          <ActionChip active={popover === 'labels'}>
            <Tag className="h-3.5 w-3.5" />
            Nhãn
            {labels.length > 0 && (
              <span
                className={cn(
                  'rounded px-1 text-[10px]',
                  popover === 'labels' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800',
                )}
              >
                {labels.length}
              </span>
            )}
          </ActionChip>
        </PopoverTrigger>
        <PopoverContent
          className="z-[300] w-[304px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <PopoverShell title="Nhãn" onClose={close}>
            {creatingLabel || editingToken ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-600">
                  {editingToken ? 'Sửa nhãn' : 'Tạo nhãn mới'}
                </p>
                <div
                  className="h-9 rounded-md"
                  style={{
                    backgroundColor: colorHex(editingToken ? editColor : newLabelColor),
                  }}
                />
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">Tiêu đề</p>
                  <Input
                    className={cn('h-9', lightInput)}
                    value={editingToken ? editTitle : newLabelTitle}
                    onChange={(e) =>
                      editingToken ? setEditTitle(e.target.value) : setNewLabelTitle(e.target.value)
                    }
                    placeholder="Tùy chọn"
                    autoFocus
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">Chọn màu</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {WORK_LABEL_COLORS.map((c) => {
                      const selected = (editingToken ? editColor : newLabelColor) === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={cn(
                            'h-8 rounded-md',
                            selected && 'ring-2 ring-sky-600 ring-offset-1',
                          )}
                          style={{ backgroundColor: c.hex }}
                          onClick={() =>
                            editingToken ? setEditColor(c.id) : setNewLabelColor(c.id)
                          }
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-sky-600 hover:bg-sky-700"
                    onClick={() => (editingToken ? commitEdit() : createLabel())}
                  >
                    {editingToken ? 'Lưu' : 'Tạo'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCreatingLabel(false);
                      setEditingToken(null);
                    }}
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  className={cn('h-9', lightInput)}
                  placeholder="Tìm nhãn..."
                  value={labelQuery}
                  onChange={(e) => setLabelQuery(e.target.value)}
                />
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Nhãn
                  </p>
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
                    {filteredLabels.map((row) => {
                      const checked = labels.includes(row.token);
                      return (
                        <li key={row.token} className="flex items-center gap-2">
                          <button
                            type="button"
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                              checked
                                ? 'border-sky-600 bg-sky-600 text-white'
                                : 'border-slate-300 bg-white',
                            )}
                            onClick={() => selectLabel(row.token)}
                            aria-pressed={checked}
                          >
                            {checked && <Check className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1"
                            onClick={() => selectLabel(row.token)}
                          >
                            <LabelBar row={row} />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Sửa nhãn"
                            onClick={() => startEdit(row)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                    {!filteredLabels.length && (
                      <li className="py-2 text-center text-xs text-slate-500">Không có nhãn</li>
                    )}
                  </ul>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-slate-200 text-slate-800"
                  onClick={() => setCreatingLabel(true)}
                >
                  Tạo nhãn mới
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-slate-200 text-xs text-slate-700"
                  onClick={() => setColorblind((v) => !v)}
                >
                  {colorblind
                    ? 'Tắt chế độ thân thiện với người mù màu'
                    : 'Bật chế độ thân thiện với người mù màu'}
                </Button>
              </div>
            )}
          </PopoverShell>
        </PopoverContent>
      </Popover>

      {/* Ngày */}
      <Popover
        modal={false}
        open={popover === 'dates'}
        onOpenChange={(o) => onKeyOpenChange('dates', o)}
      >
        <PopoverTrigger asChild>
          <ActionChip active={popover === 'dates'}>
            <Calendar className="h-3.5 w-3.5" />
            Ngày
            {(deadline || startDate) && (
              <span className="text-[10px] opacity-80">{deadline || startDate}</span>
            )}
          </ActionChip>
        </PopoverTrigger>
        <PopoverContent
          className="z-[300] w-[300px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <PopoverShell title="Ngày" onClose={close}>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Bắt đầu</p>
                <Input
                  type="date"
                  className={cn('h-9', lightInput)}
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Deadline</p>
                <Input
                  type="date"
                  className={cn('h-9', lightInput)}
                  value={deadline}
                  onChange={(e) => onDeadlineChange(e.target.value)}
                />
              </div>
              <Button
                className="w-full bg-sky-600 hover:bg-sky-700"
                onClick={() => {
                  onSaveDates();
                  close();
                }}
              >
                Lưu
              </Button>
            </div>
          </PopoverShell>
        </PopoverContent>
      </Popover>

      {/* Việc cần làm */}
      <Popover
        modal={false}
        open={popover === 'checklist'}
        onOpenChange={(o) => onKeyOpenChange('checklist', o)}
      >
        <PopoverTrigger asChild>
          <ActionChip active={popover === 'checklist'}>
            <CheckSquare className="h-3.5 w-3.5" />
            Việc cần làm
          </ActionChip>
        </PopoverTrigger>
        <PopoverContent
          className="z-[300] w-[300px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <PopoverShell title="Thêm danh sách công việc" onClose={close}>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">Tiêu đề</p>
                <Input
                  className={cn('h-9', lightInput)}
                  value={checklistTitle}
                  onChange={(e) => onChecklistTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAddChecklist();
                    }
                  }}
                  autoFocus
                />
              </div>
              <Button
                className="w-full bg-sky-600 font-semibold hover:bg-sky-700"
                onClick={onAddChecklist}
              >
                Thêm
              </Button>
            </div>
          </PopoverShell>
        </PopoverContent>
      </Popover>

      {/* Thành viên */}
      <Popover
        modal={false}
        open={popover === 'members'}
        onOpenChange={(o) => onKeyOpenChange('members', o)}
      >
        <PopoverTrigger asChild>
          <ActionChip active={popover === 'members'}>
            <UserPlus className="h-3.5 w-3.5" />
            Thành viên
            {assigneeIds.length > 0 && (
              <span
                className={cn(
                  'rounded px-1 text-[10px]',
                  popover === 'members' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800',
                )}
              >
                {assigneeIds.length}
              </span>
            )}
          </ActionChip>
        </PopoverTrigger>
        <PopoverContent
          className="z-[300] w-[300px] p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <PopoverShell title="Thành viên" onClose={close}>
            <div className="space-y-3">
              <Input
                className={cn('h-9', lightInput)}
                placeholder="Tìm kiếm các thành viên"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                autoFocus
              />
              <div>
                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">
                  Thành viên của bảng
                </p>
                <ul className="max-h-56 space-y-0.5 overflow-y-auto">
                  {filteredEmployees.map((emp) => {
                    const on = assigneeIds.includes(emp.id);
                    const initials =
                      emp.name
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(-2)
                        .map((p) => p[0])
                        .join('')
                        .toUpperCase() || '?';
                    return (
                      <li key={emp.id}>
                        <button
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800',
                            on && 'bg-slate-50 dark:bg-slate-900',
                          )}
                          onClick={() => onAssigneesChange(toggleToken(assigneeIds, emp.id))}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-semibold text-white">
                            {initials}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">
                            {emp.name}
                          </span>
                          {on && <Check className="h-4 w-4 shrink-0 text-sky-600" />}
                        </button>
                      </li>
                    );
                  })}
                  {!filteredEmployees.length && (
                    <li className="py-3 text-center text-xs text-slate-500">
                      Không tìm thấy thành viên
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </PopoverShell>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function colorHex(id: string): string {
  return WORK_LABEL_COLORS.find((c) => c.id === id)?.hex ?? '#22c55e';
}

export function SelectedLabelChips({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pl-9">
      {labels.map((token) => {
        const row = parseWorkLabel(token);
        return (
          <span
            key={token}
            className="inline-flex h-6 min-w-[48px] max-w-[180px] items-center rounded-md px-2 text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: row.hex }}
            title={row.title || token}
          >
            <span className="truncate">{row.title || ' '}</span>
          </span>
        );
      })}
    </div>
  );
}
