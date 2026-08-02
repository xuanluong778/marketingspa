'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useGoogleLogin,
  useResendRegistrationOtp,
  useSendRegistrationOtp,
  useVerifyRegistrationOtp,
} from '@/hooks/use-auth';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { OtpVerifyForm } from '@/components/auth/otp-verify-form';
import { BrandLogo } from '@/components/brand/brand-logo';

export default function RegisterPage() {
  const router = useRouter();
  const sendOtp = useSendRegistrationOtp();
  const resendOtp = useResendRegistrationOtp();
  const verifyOtp = useVerifyRegistrationOtp();
  const googleLogin = useGoogleLogin();

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [resendAfter, setResendAfter] = useState(60);
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
    sendOtp.mutate(form, {
      onSuccess: (data) => {
        setRegistrationId(data.registrationId);
        setResendAfter(data.resendAfterSeconds || 60);
        setStep('otp');
      },
    });
  }

  const formPending = sendOtp.isPending || googleLogin.isPending;
  const otpPending = verifyOtp.isPending || resendOtp.isPending;
  const formError =
    (sendOtp.isError && (sendOtp.error as Error).message) ||
    (googleLogin.isError && (googleLogin.error as Error).message) ||
    null;
  const otpError =
    (verifyOtp.isError && (verifyOtp.error as Error).message) ||
    (resendOtp.isError && (resendOtp.error as Error).message) ||
    null;

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
          <BrandLogo href={null} size={56} showWordmark={false} priority />
        </div>
        <CardTitle>{step === 'otp' ? 'Xác minh email' : 'Đăng ký spa mới'}</CardTitle>
        <CardDescription>
          {step === 'otp'
            ? 'Nhập mã OTP 6 số gửi về Gmail để hoàn tất đăng ký'
            : 'Tạo tài khoản — xác minh OTP qua email trước khi kích hoạt'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'form' ? (
          <>
            <GoogleSignInButton
              disabled={formPending}
              label="Tiếp tục với Google"
              onCredential={(idToken) => {
                googleLogin.mutate(
                  { idToken },
                  { onSuccess: () => router.replace('/overview') },
                );
              }}
            />
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">hoặc email</span>
              </div>
            </div>
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
              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <Button type="submit" className="w-full" disabled={formPending}>
                {sendOtp.isPending ? 'Đang gửi OTP...' : 'Đăng ký'}
              </Button>
            </form>
          </>
        ) : (
          registrationId && (
            <OtpVerifyForm
              email={form.email}
              resendAfterSeconds={resendAfter}
              pending={otpPending}
              error={otpError}
              onVerify={(otp) => {
                verifyOtp.mutate(
                  { registrationId, otp },
                  { onSuccess: () => router.replace('/overview') },
                );
              }}
              onResend={() => {
                resendOtp.mutate(
                  { registrationId },
                  {
                    onSuccess: (data) => {
                      setRegistrationId(data.registrationId);
                      setResendAfter(data.resendAfterSeconds || 60);
                      verifyOtp.reset();
                    },
                  },
                );
              }}
              onBack={() => {
                setStep('form');
                setRegistrationId(null);
                sendOtp.reset();
                verifyOtp.reset();
                resendOtp.reset();
              }}
            />
          )
        )}
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
