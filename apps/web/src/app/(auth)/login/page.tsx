'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogin } from '@/hooks/use-auth';

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState('admin@demo-spa.com');
  const [password, setPassword] = useState('password123');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => router.replace('/overview') });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Đăng nhập</CardTitle>
        <CardDescription>MarketingSpa — quản lý marketing spa</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {login.isError && (
            <p className="text-sm text-destructive">
              {(login.error as Error).message || 'Đăng nhập thất bại'}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="text-primary hover:underline">
            Đăng ký spa mới
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
