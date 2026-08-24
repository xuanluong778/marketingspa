'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Trash2, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { resolveDisplayStatus } from '@/lib/marketing-autopilot-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import { PaginationBar } from '@/components/crm/pagination-bar';
import { formatDateTime, formatVnd } from '@/lib/format';
import { formatMutationError } from '@/lib/format-mutation-error';
import {
  useArchiveMarketingAutopilotProject,
  useUpdateMarketingAutopilotProject,
} from '@/hooks/use-marketing-autopilot';
import type { MarketingAutopilotProject } from '@/types/marketing-autopilot';
import { cn } from '@/lib/utils';

const GOAL_CHIPS = [
  { id: 'tang-lead', label: 'Tăng Lead' },
  { id: 'tang-booking', label: 'Tăng Booking' },
  { id: 'tang-doanh-thu', label: 'Tăng doanh thu' },
];

type EditFormState = {
  projectName: string;
  productName: string;
  productPrice: number;
  customerProfile: string;
  targetArea: string;
  monthlyBudget: number;
  primaryGoal: string;
  goals: string[];
  channelsText: string;
};

function parseChannels(snapshot: MarketingAutopilotProject['inputSnapshot'], analysisJson: unknown): string {
  const snap = snapshot as { channels?: string[] } | undefined;
  if (Array.isArray(snap?.channels) && snap.channels.length) return snap.channels.join(', ');
  const analysis = analysisJson as { suggestedChannels?: string[] } | null;
  if (Array.isArray(analysis?.suggestedChannels) && analysis.suggestedChannels.length) {
    return analysis.suggestedChannels.join(', ');
  }
  return '';
}

function toEditForm(project: MarketingAutopilotProject): EditFormState {
  const snap = project.inputSnapshot as { goals?: string[]; projectName?: string } | undefined;
  const goalsFromSnap = Array.isArray(snap?.goals) ? snap.goals : [];
  return {
    projectName: snap?.projectName ?? project.name ?? '',
    productName: project.productName ?? '',
    productPrice: Number(project.productPrice) || 0,
    customerProfile: project.customerProfile ?? '',
    targetArea: project.targetArea ?? '',
    monthlyBudget: Number(project.monthlyBudget) || 0,
    primaryGoal: project.primaryGoal ?? '',
    goals: goalsFromSnap.length ? goalsFromSnap : project.primaryGoal ? [project.primaryGoal] : [],
    channelsText: parseChannels(project.inputSnapshot, project.analysisJson),
  };
}

function parseMoneyDigits(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyInput(amount: number): string {
  if (!amount || amount <= 0) return '';
  return new Intl.NumberFormat('vi-VN').format(Math.round(amount));
}

export function ProjectHistoryPanel({
  items,
  isLoading,
  isError,
  onRetry,
  selectedProjectId,
  onSelectProject,
  onViewProject,
  page = 1,
  totalPages = 1,
  total = 0,
  onPageChange,
  hasActiveFilters = false,
}: {
  items: MarketingAutopilotProject[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  selectedProjectId?: string | null;
  onSelectProject: (projectId: string) => void;
  onViewProject?: (projectId: string) => void;
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  hasActiveFilters?: boolean;
}) {
  const updateProject = useUpdateMarketingAutopilotProject();
  const archiveProject = useArchiveMarketingAutopilotProject();
  const [editProject, setEditProject] = useState<MarketingAutopilotProject | null>(null);
  const [deleteProject, setDeleteProject] = useState<MarketingAutopilotProject | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (editProject) setEditForm(toEditForm(editProject));
  }, [editProject]);

  const editFrozen = useMemo(() => {
    if (!editProject) return false;
    return editProject.status === 'RUNNING' || editProject.mission?.status === 'RUNNING';
  }, [editProject]);

  const toggleGoal = (id: string, label: string) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const nextGoals = prev.goals.includes(id)
        ? prev.goals.filter((g) => g !== id)
        : [...prev.goals, id];
      const labels = GOAL_CHIPS.filter((g) => nextGoals.includes(g.id)).map((g) => g.label);
      const extra = nextGoals.filter((g) => !GOAL_CHIPS.some((c) => c.id === g));
      return {
        ...prev,
        goals: nextGoals,
        primaryGoal: [...labels, ...extra].join(', '),
      };
    });
  };

  const handleSaveEdit = () => {
    if (!editProject || !editForm) return;
    const channels = editForm.channelsText
      .split(/[,;\n]/)
      .map((c) => c.trim())
      .filter(Boolean);
    updateProject.mutate(
      {
        projectId: editProject.id,
        body: {
          projectName: editForm.projectName,
          productName: editForm.productName,
          productPrice: editForm.productPrice,
          customerProfile: editForm.customerProfile,
          targetArea: editForm.targetArea,
          monthlyBudget: editForm.monthlyBudget,
          primaryGoal: editForm.primaryGoal,
          goals: editForm.goals,
          channels,
        },
      },
      {
        onSuccess: (data) => {
          setEditProject(null);
          onSelectProject(editProject.id);
          setToast({
            type: 'success',
            message: data.message ?? 'Đã lưu brief project.',
          });
        },
        onError: (err) => {
          setToast({
            type: 'error',
            message: formatMutationError(err, 'Không lưu được project.'),
          });
        },
      },
    );
  };

  const handleConfirmDelete = () => {
    if (!deleteProject) return;
    archiveProject.mutate(deleteProject.id, {
      onSuccess: (data) => {
        setDeleteProject(null);
        setToast({
          type: 'success',
          message: data.message ?? 'Đã lưu trữ project.',
        });
      },
      onError: (err) => {
        setToast({
          type: 'error',
          message: formatMutationError(err, 'Không xóa được project.'),
        });
      },
    });
  };

  if (isLoading && !items.length) return <LoadingState message="Đang tải lịch sử project..." />;
  if (isError) return <ErrorState message="Không tải được lịch sử project." onRetry={onRetry} />;
  if (!items.length) {
    return (
      <EmptyState
        title={hasActiveFilters ? 'Không có project phù hợp' : 'Chưa có project'}
        description={
          hasActiveFilters
            ? 'Thử đổi bộ lọc hoặc xóa lọc để xem thêm kết quả.'
            : 'Project Autopilot đầu tiên sẽ xuất hiện tại đây.'
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {toast ? (
        <Alert variant={toast.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{toast.message}</AlertDescription>
        </Alert>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Sản phẩm</TableHead>
            <TableHead>Ngân sách</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Tạo lúc</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const selected = selectedProjectId === item.id;
            return (
              <TableRow
                key={item.id}
                className={cn('cursor-pointer', selected && 'bg-muted/50')}
                onClick={() => onSelectProject(item.id)}
              >
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.primaryGoal}</div>
                </TableCell>
                <TableCell>{item.productName}</TableCell>
                <TableCell>{formatVnd(Number(item.monthlyBudget))}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {resolveDisplayStatus({
                      missionStatus: item.mission?.status,
                      projectStatus: item.status,
                    })}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        (onViewProject ?? onSelectProject)(item.id);
                      }}
                    >
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      Xem
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditProject(item);
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Chỉnh sửa
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteProject(item);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Xóa
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {onPageChange ? (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={onPageChange}
        />
      ) : null}

      <Dialog open={Boolean(editProject)} onOpenChange={(open) => !open && setEditProject(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa brief project</DialogTitle>
            <DialogDescription>
              {editFrozen
                ? 'Project đang RUNNING — chỉ cập nhật brief trong DB, không thay đổi mission/tài sản đã tạo.'
                : 'Cập nhật thông tin brief và lưu vào database.'}
            </DialogDescription>
          </DialogHeader>
          {editForm ? (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label htmlFor="edit-project-name">Tên project</Label>
                <Input
                  id="edit-project-name"
                  value={editForm.projectName}
                  onChange={(e) => setEditForm({ ...editForm, projectName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-product">Sản phẩm</Label>
                <Input
                  id="edit-product"
                  value={editForm.productName}
                  onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-price">Giá sản phẩm (VND)</Label>
                  <Input
                    id="edit-price"
                    value={formatMoneyInput(editForm.productPrice)}
                    onChange={(e) =>
                      setEditForm({ ...editForm, productPrice: parseMoneyDigits(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-budget">Ngân sách/tháng</Label>
                  <Input
                    id="edit-budget"
                    value={formatMoneyInput(editForm.monthlyBudget)}
                    onChange={(e) =>
                      setEditForm({ ...editForm, monthlyBudget: parseMoneyDigits(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-customer">Khách hàng mục tiêu</Label>
                <Textarea
                  id="edit-customer"
                  rows={2}
                  value={editForm.customerProfile}
                  onChange={(e) => setEditForm({ ...editForm, customerProfile: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-area">Khu vực</Label>
                <Input
                  id="edit-area"
                  value={editForm.targetArea}
                  onChange={(e) => setEditForm({ ...editForm, targetArea: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Mục tiêu</Label>
                <div className="flex flex-wrap gap-2">
                  {GOAL_CHIPS.map((g) => (
                    <Button
                      key={g.id}
                      type="button"
                      size="sm"
                      variant={editForm.goals.includes(g.id) ? 'default' : 'outline'}
                      onClick={() => toggleGoal(g.id, g.label)}
                    >
                      {g.label}
                    </Button>
                  ))}
                </div>
                <Input
                  className="mt-2"
                  value={editForm.primaryGoal}
                  onChange={(e) => setEditForm({ ...editForm, primaryGoal: e.target.value })}
                  placeholder="Mục tiêu chính (có thể chỉnh tay)"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-channels">Kênh (phân cách bằng dấu phẩy)</Label>
                <Input
                  id="edit-channels"
                  value={editForm.channelsText}
                  onChange={(e) => setEditForm({ ...editForm, channelsText: e.target.value })}
                  placeholder="Facebook, Instagram, Zalo, Email"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProject(null)}>
              Hủy
            </Button>
            <Button disabled={updateProject.isPending || !editForm?.productName.trim()} onClick={handleSaveEdit}>
              {updateProject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Lưu brief
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteProject)} onOpenChange={(open) => !open && setDeleteProject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận lưu trữ project?</DialogTitle>
            <DialogDescription>
              Project <strong>{deleteProject?.name}</strong> sẽ được lưu trữ (soft delete). Mission,
              campaign, automation và tài sản đang chạy <strong>không bị xóa</strong>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProject(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={archiveProject.isPending}
              onClick={handleConfirmDelete}
            >
              {archiveProject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Lưu trữ project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
