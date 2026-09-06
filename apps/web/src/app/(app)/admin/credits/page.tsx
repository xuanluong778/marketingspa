import { redirect } from 'next/navigation';

/** Credit được quản lý trong tab Gói đăng ký. API Credit vẫn giữ nguyên. */
export default function AdminCreditsRedirectPage() {
  redirect('/admin/subscriptions');
}
