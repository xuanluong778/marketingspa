'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGoogleLogin, useLogin } from '@/hooks/use-auth';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { BrandLogo } from '@/components/brand/brand-logo';
import { useT } from '@/i18n/i18n-provider';

export default function LoginPage() {
  const t = useT();
  const router = useRouter();
  const login = useLogin();
  const googleLogin = useGoogleLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => router.replace('/overview') });
  }

  const pending = login.isPending || googleLogin.isPending;
  const errorMsg =
    (login.isError && (login.error as Error).message) ||
    (googleLogin.isError && (googleLogin.error as Error).message) ||
    null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <BrandLogo href={null} size={56} showWordmark={false} priority />
        </div>
        <CardTitle>{t('auth.login')}</CardTitle>
        <CardDescription>{t('auth.loginDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleSignInButton
          disabled={pending}
          onCredential={(idToken) => {
            googleLogin.mutate({ idToken }, { onSuccess: () => router.replace('/overview') });
          }}
        />
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">{t('auth.orEmail')}</span>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.email')}</Label>
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
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {login.isPending ? t('auth.loggingIn') : t('auth.login')}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="text-primary hover:underline">
            {t('auth.registerSpa')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
