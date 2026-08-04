'use client';

type Props = {
  email: string;
  resendAfterSeconds: number;
  pending: boolean;
  error: string | null;
  onVerify: (otp: string) => void;
  onResend: () => void;
  onBack: () => void;
};

/** Keeps existing placeholder copy; props match register page contract. */
export function OtpVerifyForm(_props: Props) {
  return (
    <p className="text-sm text-muted-foreground">
      Form xác minh OTP tạm thời chưa khả dụng trên bản dựng này.
    </p>
  );
}

export default OtpVerifyForm;
