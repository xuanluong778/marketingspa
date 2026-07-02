import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      <header className="container mx-auto flex items-center justify-between py-6 px-4">
        <div className="flex items-center gap-2 font-bold text-xl text-primary">
          <Sparkles className="h-6 w-6" />
          MarketingSpa
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/login">Đăng nhập</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Đăng ký</Link>
          </Button>
        </div>
      </header>
      <main className="container mx-auto px-4 py-20 text-center max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Marketing thông minh cho spa của bạn
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Quản lý lead, lịch hẹn, chiến dịch ads và doanh thu — tất cả trong một nền tảng.
        </p>
        <Button size="lg" asChild>
          <Link href="/register">Bắt đầu miễn phí</Link>
        </Button>
      </main>
    </div>
  );
}
