import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#1A6B52]">
      <header className="container mx-auto flex items-center justify-between py-6 px-4">
        <div className="flex items-center gap-2 font-bold text-xl text-[#F97316]">
          <Sparkles className="h-6 w-6" />
          MarketingSpa
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            asChild
          >
            <Link href="/login">Đăng nhập</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Đăng ký</Link>
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-20 text-center max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold !text-white md:text-5xl">
          Marketing thông minh cho spa của bạn
        </h1>
        <p className="mb-8 text-lg text-white/85">
          Quản lý lead, lịch hẹn, chiến dịch ads và doanh thu — tất cả trong một nền tảng.
        </p>
        <Button size="lg" asChild>
          <Link href="/register">Bắt đầu miễn phí</Link>
        </Button>
      </main>
    </div>
  );
}
