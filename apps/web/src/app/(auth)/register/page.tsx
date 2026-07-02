'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegister } from '@/hooks/use-auth';

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    organizationName: '',
  });

  function update(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    register.mutate(form, { onSuccess: () => router.replace('/overview') });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Đăng ký spa mới</CardTitle>
        <CardDescription>Tạo tài khoản và organization trong 1 bước</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org">Tên spa</Label>
            <Input
              id="org"
              value={form.organizationName}
              onChange={(e) => update('organizationName', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Họ tên</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu (tối thiểu 8 ký tự)</Label>
            <Input
              id="password"
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              required
            />
          </div>
          {register.isError && (
            <p className="text-sm text-destructive">
              {(register.error as Error).message || 'Đăng ký thất bại'}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? 'Đang tạo...' : 'Đăng ký'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
