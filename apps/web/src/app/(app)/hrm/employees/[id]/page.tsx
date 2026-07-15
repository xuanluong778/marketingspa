'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingState, ErrorState, EmptyState } from '@/components/shared/page-state';
import {
  useHrmContracts,
  useHrmDocuments,
  useHrmEmployee,
  useHrmEmployeeMutations,
} from '@/hooks/use-hrm';
import {
  CONTRACT_TYPE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
} from '@/types/hrm';
import { ROLE_OPTIONS } from '@/types/appointments';

export default function HrmEmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, isLoading, isError, refetch } = useHrmEmployee(id);
  const { data: contracts } = useHrmContracts(id);
  const { data: documents } = useHrmDocuments(id);
  const mutations = useHrmEmployeeMutations();

  const [accountForm, setAccountForm] = useState({
    email: '',
    password: '',
    roleCode: 'TECHNICIAN',
  });
  const [contractForm, setContractForm] = useState({
    title: 'Hợp đồng lao động',
    contractType: 'FIXED',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    salaryBase: '',
  });
  const [docForm, setDocForm] = useState({
    title: '',
    type: 'OTHER',
    fileUrl: '',
  });
  const [resetPassword, setResetPassword] = useState('');

  if (isLoading) return <LoadingState />;
  if (isError || !data) {
    return <ErrorState message="Không tải được hồ sơ nhân viên" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/hrm/employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--heading))]">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.code ?? 'Chưa có mã'} ·{' '}
            {EMPLOYEE_STATUS_OPTIONS.find((s) => s.value === data.status)?.label ?? data.status}
          </p>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Hồ sơ</TabsTrigger>
          <TabsTrigger value="account">Tài khoản</TabsTrigger>
          <TabsTrigger value="contracts">Hợp đồng</TabsTrigger>
          <TabsTrigger value="documents">Tài liệu</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin nhân sự</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
              <Info label="Email" value={data.email} />
              <Info label="SĐT" value={data.phone} />
              <Info label="Chức vụ" value={data.position} />
              <Info label="Chi nhánh" value={data.branch?.name} />
              <Info label="Phòng ban" value={data.department?.name} />
              <Info label="Quản lý trực tiếp" value={data.manager?.name} />
              <Info
                label="Loại hình"
                value={
                  EMPLOYMENT_TYPE_OPTIONS.find((x) => x.value === data.employmentType)?.label
                }
              />
              <Info
                label="Ngày vào"
                value={data.startDate ? new Date(data.startDate).toLocaleDateString('vi-VN') : null}
              />
              <Info label="CCCD" value={data.legalIdNumber} />
              <Info label="Địa chỉ" value={data.address} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tài khoản đăng nhập</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {data.user ? (
                <>
                  <Info label="Email login" value={data.user.email} />
                  <Info
                    label="Vai trò"
                    value={
                      ROLE_OPTIONS.find((r) => r.value === data.user?.role?.code)?.label ??
                      data.user.role?.name
                    }
                  />
                  <div className="flex flex-wrap items-end gap-2 pt-2">
                    <div className="space-y-1">
                      <Label>Đặt lại mật khẩu</Label>
                      <Input
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        placeholder="Mật khẩu mới (≥ 6 ký tự)"
                      />
                    </div>
                    <Button
                      disabled={resetPassword.length < 6 || mutations.resetPassword.isPending}
                      onClick={() =>
                        mutations.resetPassword.mutate(
                          { employeeId: id, password: resetPassword },
                          { onSuccess: () => setResetPassword('') },
                        )
                      }
                    >
                      Lưu mật khẩu
                    </Button>
                  </div>
                </>
              ) : (
                <form
                  className="grid max-w-md gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutations.createAccount.mutate({
                      employeeId: id,
                      email: accountForm.email,
                      password: accountForm.password,
                      roleCode: accountForm.roleCode,
                      name: data.name,
                    });
                  }}
                >
                  <p className="text-muted-foreground">
                    Nhân viên chưa có tài khoản. Tạo login gắn 1:1 với hồ sơ này.
                  </p>
                  <div className="space-y-1">
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      required
                      value={accountForm.email}
                      onChange={(e) =>
                        setAccountForm((f) => ({ ...f, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Mật khẩu *</Label>
                    <Input
                      type="password"
                      required
                      minLength={6}
                      value={accountForm.password}
                      onChange={(e) =>
                        setAccountForm((f) => ({ ...f, password: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Vai trò</Label>
                    <Select
                      value={accountForm.roleCode}
                      onValueChange={(v) => setAccountForm((f) => ({ ...f, roleCode: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={mutations.createAccount.isPending}>
                    Tạo tài khoản
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hợp đồng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(contracts?.length ?? 0) === 0 ? (
                <EmptyState title="Chưa có hợp đồng" className="py-8 text-white [&_svg]:text-white" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {contracts!.map((c) => (
                    <li key={c.id} className="rounded-md border border-white/10 p-3">
                      <div className="font-medium">
                        {c.title} · v{c.version}
                      </div>
                      <div className="text-muted-foreground">
                        {c.status} · {c.contractType} ·{' '}
                        {new Date(c.startDate).toLocaleDateString('vi-VN')}
                        {c.salaryBase != null ? ` · Lương: ${c.salaryBase}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form
                className="grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutations.createContract.mutate({
                    employeeId: id,
                    title: contractForm.title,
                    contractType: contractForm.contractType,
                    startDate: contractForm.startDate,
                    endDate: contractForm.endDate || undefined,
                    salaryBase: contractForm.salaryBase
                      ? Number(contractForm.salaryBase)
                      : undefined,
                    status: 'ACTIVE',
                  });
                }}
              >
                <div className="space-y-1 sm:col-span-2">
                  <Label>Thêm hợp đồng</Label>
                  <Input
                    required
                    value={contractForm.title}
                    onChange={(e) => setContractForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <Select
                  value={contractForm.contractType}
                  onValueChange={(v) => setContractForm((f) => ({ ...f, contractType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Lương cơ bản"
                  value={contractForm.salaryBase}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, salaryBase: e.target.value }))
                  }
                />
                <Input
                  type="date"
                  required
                  value={contractForm.startDate}
                  onChange={(e) =>
                    setContractForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
                <Input
                  type="date"
                  value={contractForm.endDate}
                  onChange={(e) => setContractForm((f) => ({ ...f, endDate: e.target.value }))}
                />
                <Button type="submit" className="sm:col-span-2" disabled={mutations.createContract.isPending}>
                  Lưu hợp đồng
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tài liệu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(documents?.length ?? 0) === 0 ? (
                <EmptyState title="Chưa có tài liệu" className="py-8 text-white [&_svg]:text-white" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {documents!.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-white/10 p-3"
                    >
                      <div>
                        <div className="font-medium">{d.title}</div>
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary underline"
                        >
                          Mở file
                        </a>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => mutations.archiveDocument.mutate(d.id)}
                      >
                        Lưu trữ
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                className="grid gap-2 border-t border-white/10 pt-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutations.createDocument.mutate({
                    employeeId: id,
                    title: docForm.title,
                    type: docForm.type,
                    fileUrl: docForm.fileUrl,
                  });
                }}
              >
                <Label>Thêm tài liệu (URL file)</Label>
                <Input
                  required
                  placeholder="Tiêu đề"
                  value={docForm.title}
                  onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))}
                />
                <Select
                  value={docForm.type}
                  onValueChange={(v) => setDocForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  required
                  placeholder="https://... hoặc /uploads/..."
                  value={docForm.fileUrl}
                  onChange={(e) => setDocForm((f) => ({ ...f, fileUrl: e.target.value }))}
                />
                <Button type="submit" disabled={mutations.createDocument.isPending}>
                  Lưu tài liệu
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value?.trim() ? value : '—'}</p>
    </div>
  );
}
