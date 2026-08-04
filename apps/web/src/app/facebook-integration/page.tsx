import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ChevronRight,
  Facebook,
  Link2,
  ListChecks,
  Lock,
  Shield,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/brand/brand-logo';

const SITE_URL = 'https://marketingautoaz.com';

export const metadata: Metadata = {
  title: 'Facebook Fanpage Integration | MarketingAutoAZ',
  description:
    'How MarketingAutoAZ uses Facebook Login for Business and pages_show_list to list and connect Fanpages you manage for Auto Post.',
  alternates: {
    canonical: `${SITE_URL}/facebook-integration`,
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'Facebook Fanpage Integration | MarketingAutoAZ',
    description:
      'MarketingAutoAZ connects Fanpages you manage via Facebook Login for Business (pages_show_list) for scheduled publishing.',
    url: `${SITE_URL}/facebook-integration`,
    siteName: 'MarketingAutoAZ',
    type: 'website',
    locale: 'en_US',
    images: [
      { url: `${SITE_URL}/brand/logo.png`, width: 1024, height: 1024, alt: 'MarketingAutoAZ' },
    ],
  },
};

const sections = [
  { id: 'purpose', title: '1. Purpose of pages_show_list' },
  { id: 'how-it-works', title: '2. How connection works' },
  { id: 'select-disconnect', title: '3. Select & disconnect Fanpages' },
  { id: 'reviewer', title: '4. App Review test path' },
  { id: 'privacy', title: '5. Privacy & data deletion' },
];

export default function FacebookIntegrationPage() {
  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6">
          <BrandLogo size={32} wordmark="MarketingAutoAZ" wordmarkClassName="text-xl" />
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:inline"
            >
              Privacy
            </Link>
            <Link
              href="/facebook/data-deletion"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-white sm:inline"
            >
              Data deletion
            </Link>
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-white/5 bg-gradient-to-b from-[#1A6B52]/30 to-transparent py-12 md:py-16">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#F97316]">
            <Facebook className="h-4 w-4" />
            Meta · Facebook Login for Business
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
            Facebook Fanpage integration
          </h1>
          <p className="mt-4 max-w-3xl text-base text-muted-foreground">
            MarketingAutoAZ uses Facebook Login for Business so spa / business owners can connect
            Fanpages they manage and schedule posts from Content Studio. We request{' '}
            <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm text-white">
              pages_show_list
            </code>{' '}
            only to list Pages the signed-in Facebook user administers — never to discover or
            connect Pages they do not manage.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="bg-[#F97316] text-white hover:bg-[#ea6a0c]" asChild>
              <Link href="/content?tab=channels">
                Open Connect Fanpage
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
              asChild
            >
              <Link href="/login">Reviewer login</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto grid gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[240px_1fr]">
        <nav className="hidden lg:block">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            On this page
          </p>
          <ul className="space-y-2 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-white">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <article className="max-w-3xl space-y-12 text-[15px] leading-relaxed text-muted-foreground">
          <section id="purpose" className="scroll-mt-24 space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <ListChecks className="h-5 w-5 text-[#F97316]" />
              1. Purpose of <span className="text-[#F97316]">pages_show_list</span>
            </h2>
            <p>
              After Facebook Login for Business, MarketingAutoAZ calls Meta Graph{' '}
              <code className="rounded bg-white/10 px-1 text-white">/me/accounts</code> to retrieve
              Fanpages the user manages. <strong className="text-white">pages_show_list</strong>{' '}
              is required for that listing step.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Show only Pages the user administers (with Page access token from Meta).</li>
              <li>Let the user choose which Fanpages to save for Auto Post.</li>
              <li>We do not scrape public Pages, paste tokens manually, or attach Pages the user does not manage.</li>
            </ul>
            <p className="text-sm">
              Related publishing scopes (configured on the same Login Configuration):{' '}
              <code className="text-white">pages_read_engagement</code>,{' '}
              <code className="text-white">pages_manage_posts</code>.
            </p>
          </section>

          <section id="how-it-works" className="scroll-mt-24 space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Link2 className="h-5 w-5 text-[#F97316]" />
              2. How connection works
            </h2>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Sign in to MarketingAutoAZ → Content Studio →{' '}
                <Link className="text-[#F97316] hover:underline" href="/content?tab=channels">
                  Kết nối Fanpage
                </Link>
                .
              </li>
              <li>Click <strong className="text-white">Kết nối Facebook</strong>.</li>
              <li>
                Complete Facebook Login for Business (App ID{' '}
                <code className="text-white">1045516051171576</code>, Login Configuration{' '}
                <code className="text-white">2006772376877449</code>).
              </li>
              <li>
                Meta redirects to our HTTPS callback; we exchange the authorization{' '}
                <code className="text-white">code</code> server-side. Access tokens are never shown
                in the browser URL or UI.
              </li>
              <li>Pick Fanpages → Save. Tokens are encrypted at rest per organization.</li>
            </ol>
          </section>

          <section id="select-disconnect" className="scroll-mt-24 space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Unplug className="h-5 w-5 text-[#F97316]" />
              3. Select & disconnect Fanpages
            </h2>
            <p>
              After OAuth, the picker lists managed Fanpages only. Select one or more, then save.
              Reload (F5) or sign in again — connected Fanpages remain for that organization.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-white">Ngắt kết nối</strong> on a single Page removes that
                Page only.
              </li>
              <li>
                <strong className="text-white">Ngắt tất cả</strong> disconnects Facebook for the
                workspace and clears saved Page tokens.
              </li>
            </ul>
          </section>

          <section id="reviewer" className="scroll-mt-24 space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Lock className="h-5 w-5 text-[#F97316]" />
              4. App Review test path
            </h2>
            <p>
              Meta reviewers: log in at{' '}
              <Link className="text-[#F97316] hover:underline" href="/login">
                {SITE_URL}/login
              </Link>{' '}
              with the credentials in the App Review notes (no payment gate, no SMS OTP for this
              test account). Then open Connect Fanpage and complete Facebook Login for Business
              with a Facebook user that manages at least one Fanpage.
            </p>
          </section>

          <section id="privacy" className="scroll-mt-24 space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Shield className="h-5 w-5 text-[#F97316]" />
              5. Privacy & data deletion
            </h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <Link className="text-[#F97316] hover:underline" href="/privacy">
                  Privacy Policy
                </Link>{' '}
                — how we collect and protect Facebook connection data.
              </li>
              <li>
                <Link className="text-[#F97316] hover:underline" href="/facebook/data-deletion">
                  Facebook data deletion instructions
                </Link>{' '}
                — how users revoke access and request deletion.
              </li>
              <li>
                <Link className="text-[#F97316] hover:underline" href="/terms">
                  Terms of Service
                </Link>
              </li>
            </ul>
            <p className="text-sm">
              Operator: <strong className="text-white">CÔNG TY TNHH THẾ GIỚI DIGI</strong> · Contact:{' '}
              <a
                className="text-[#F97316] hover:underline"
                href="mailto:thegioimarketingdigi@gmail.com"
              >
                thegioimarketingdigi@gmail.com
              </a>
            </p>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/5 p-5">
            <h3 className="mb-2 text-lg font-semibold text-white">Tiếng Việt (tóm tắt)</h3>
            <p>
              MarketingAutoAZ dùng Facebook Login for Business và quyền{' '}
              <strong className="text-white">pages_show_list</strong> để liệt kê Fanpage mà bạn
              quản lý, rồi cho phép chọn/lưu Fanpage để Auto Post. Không kết nối Page bạn không
              quản trị. Vào{' '}
              <Link className="text-[#F97316] hover:underline" href="/content?tab=channels">
                Content → Kết nối Fanpage
              </Link>
              , bấm Kết nối Facebook, chọn Page, có thể ngắt từng Page hoặc ngắt tất cả. Xem thêm{' '}
              <Link className="text-[#F97316] hover:underline" href="/privacy">
                Chính sách bảo mật
              </Link>{' '}
              và{' '}
              <Link className="text-[#F97316] hover:underline" href="/facebook/data-deletion">
                Hướng dẫn xóa dữ liệu
              </Link>
              .
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
