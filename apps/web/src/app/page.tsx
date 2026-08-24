import Link from 'next/link';
import {
  FileText,
  Mail,
  MessageCircle,
  Users,
  Zap,
  LayoutDashboard,
  TrendingUp,
  Calendar,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

export const dynamic = 'force-dynamic';

const BRAND_GREEN = '#0A3D30';
const BRAND_ORANGE = '#F97316';
const PAGE_BG = '#F7FBF9';

const FEATURES = [
  { label: 'Content AI', icon: FileText },
  { label: 'Email Marketing', icon: Mail },
  { label: 'Zalo Marketing', icon: MessageCircle },
  { label: 'CRM', icon: Users },
  { label: 'Automation', icon: Zap },
] as const;

function DashboardMockup() {
  const nav = [
    { icon: LayoutDashboard, label: 'Tổng quan', active: true },
    { icon: Users, label: 'CRM' },
    { icon: Mail, label: 'Email' },
    { icon: MessageCircle, label: 'Zalo' },
    { icon: Bot, label: 'AI' },
  ];

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex min-h-[340px] md:min-h-[400px]">
        <aside
          className="hidden w-[72px] shrink-0 flex-col gap-3 p-3 sm:flex md:w-[140px] md:p-4"
          style={{ backgroundColor: BRAND_GREEN }}
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg" style={{ backgroundColor: BRAND_ORANGE }} />
            <span className="hidden text-xs font-semibold text-white md:inline">AutoAZ</span>
          </div>
          {nav.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 rounded-xl px-2 py-2 text-[11px] md:px-2.5 ${
                item.active ? 'bg-white/15 text-white' : 'text-white/60'
              }`}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden truncate md:inline">{item.label}</span>
            </div>
          ))}
        </aside>

        <div className="flex flex-1 flex-col p-4 md:p-5" style={{ backgroundColor: PAGE_BG }}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Dashboard
              </p>
              <p className="text-sm font-semibold md:text-base" style={{ color: BRAND_GREEN }}>
                Hiệu suất marketing hôm nay
              </p>
            </div>
            <div
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{ backgroundColor: 'rgba(249,115,22,0.15)', color: BRAND_ORANGE }}
            >
              Live
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-3">
            {[
              { label: 'Lead mới', value: '128', delta: '+18%' },
              { label: 'Email mở', value: '42%', delta: '+6%' },
              { label: 'Booking', value: '36', delta: '+12%' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <p className="text-[10px] text-slate-500">{kpi.label}</p>
                <div className="mt-1 flex items-end justify-between gap-1">
                  <p className="text-lg font-bold md:text-xl" style={{ color: BRAND_GREEN }}>
                    {kpi.value}
                  </p>
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                    <TrendingUp className="h-3 w-3" />
                    {kpi.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid flex-1 gap-2.5 md:grid-cols-2 md:gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" style={{ color: BRAND_ORANGE }} />
                <p className="text-xs font-semibold" style={{ color: BRAND_GREEN }}>
                  Lịch hẹn hôm nay
                </p>
              </div>
              <div className="space-y-2">
                {['09:30 · Tư vấn trị nám', '14:00 · Follow-up lead Zalo', '16:30 · Review campaign'].map(
                  (row) => (
                    <div
                      key={row}
                      className="rounded-lg px-2.5 py-2 text-[11px] text-slate-600"
                      style={{ backgroundColor: PAGE_BG }}
                    >
                      {row}
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" style={{ color: BRAND_ORANGE }} />
                <p className="text-xs font-semibold" style={{ color: BRAND_GREEN }}>
                  Automation đang chạy
                </p>
              </div>
              <div className="space-y-2">
                {[
                  { name: 'Welcome Email', status: 'Active' },
                  { name: 'Zalo nurture 3 ngày', status: 'Active' },
                  { name: 'Remarketing Ads', status: 'Queued' },
                ].map((flow) => (
                  <div
                    key={flow.name}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2"
                    style={{ backgroundColor: PAGE_BG }}
                  >
                    <span className="text-[11px] text-slate-600">{flow.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        flow.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {flow.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen text-slate-900" style={{ backgroundColor: PAGE_BG }}>
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <BrandLogo
            size={36}
            wordmarkClassName="text-base font-bold tracking-tight text-[#0A3D30] md:text-lg"
            priority
          />
          <div className="flex items-center gap-2 md:gap-3">
            <Button variant="ghost" className="hover:bg-slate-100" style={{ color: BRAND_GREEN }} asChild>
              <Link href="/login">Đăng nhập</Link>
            </Button>
            <Button
              className="rounded-xl px-4 text-white hover:opacity-90 md:px-5"
              style={{ backgroundColor: BRAND_ORANGE }}
              asChild
            >
              <Link href="/register">Dùng miễn phí</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section id="tinh-nang" className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
              {FEATURES.map(({ label, icon: Icon }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2.5 rounded-2xl border border-slate-200 px-3 py-5 text-center shadow-sm md:px-4"
                  style={{ backgroundColor: PAGE_BG }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ backgroundColor: 'rgba(10,61,48,0.1)', color: BRAND_GREEN }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: BRAND_GREEN }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 pt-10 md:px-6 md:pb-16 md:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="max-w-xl">
              <p
                className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] md:text-[13px]"
                style={{ color: 'rgba(10,61,48,0.75)' }}
              >
                Nền tảng Marketing Automation bằng AI
              </p>
              <h1 className="mb-4 tracking-tight" style={{ color: BRAND_GREEN }}>
                <span className="block whitespace-nowrap text-2xl font-bold leading-tight sm:text-3xl md:text-4xl lg:text-5xl">
                  Tự động hóa Marketing.
                </span>
                <span className="mt-1 block whitespace-nowrap text-xl font-semibold leading-snug text-slate-700 sm:text-2xl md:text-3xl">
                  Tăng trưởng thông minh hơn.
                </span>
              </h1>
              <p className="mb-8 max-w-md text-base leading-relaxed text-slate-600 md:text-lg">
                Quản lý Content, Email, Zalo, Social và CRM trên một nền tảng duy nhất.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="rounded-xl px-6 text-base font-semibold text-white shadow-md hover:opacity-90"
                  style={{ backgroundColor: BRAND_ORANGE }}
                  asChild
                >
                  <Link href="/register">Dùng miễn phí 3 ngày</Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-xl border-slate-300 bg-white hover:bg-white"
                  style={{ color: BRAND_GREEN }}
                  asChild
                >
                  <Link href="#tinh-nang">Xem tính năng</Link>
                </Button>
              </div>
            </div>

            <div className="w-full">
              <DashboardMockup />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
