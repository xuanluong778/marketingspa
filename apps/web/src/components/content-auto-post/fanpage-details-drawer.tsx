'use client';

import { CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useFanpageDetails } from '@/hooks/use-auto-post';
import { useCurrentUser } from '@/hooks/use-auth';
import { formatMutationError } from '@/lib/format-mutation-error';
import type { AutoPostFacebookPage } from '@/types/auto-post';

const EMPTY = 'Chưa có thông tin';

function displayText(value: string | null | undefined): string {
  const t = typeof value === 'string' ? value.trim() : '';
  return t || EMPTY;
}

function displayCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EMPTY;
  return value.toLocaleString('vi-VN');
}

function formatPostTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return d.toLocaleString('vi-VN');
}

function PageAvatar({
  name,
  pictureUrl,
  size = 'md',
}: {
  name: string;
  pictureUrl: string | null | undefined;
  size?: 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';
  return (
    <div className={`${dim} shrink-0 overflow-hidden rounded-full bg-[#F97316]/20`}>
      {pictureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pictureUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-lg font-bold text-[#F97316]">
          {(name || '?').slice(0, 1)}
        </span>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="w-36 shrink-0 text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-white/90">{value}</dd>
    </div>
  );
}

export function FanpageDetailsDrawer({
  open,
  onOpenChange,
  page,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: AutoPostFacebookPage | null;
}) {
  const { data: user } = useCurrentUser();
  const fanpageId = open && page ? page.id : null;
  const details = useFanpageDetails(fanpageId, Boolean(fanpageId), user?.organizationId);

  const summaryName = details.data?.page.name || page?.pageName || 'Fanpage';
  const summaryPicture = details.data?.page.pictureUrl ?? page?.pagePictureUrl ?? null;
  const summaryPageId = details.data?.page.pageId || page?.pageId || '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex !w-1/2 !max-w-none flex-col gap-0 border-l border-white/10 bg-[#0A3D30] p-0 text-white max-sm:!w-full [&>button]:text-white [&>button]:hover:text-[#F97316]"
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-white/10 px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-lg font-bold tracking-tight text-[#F97316]">
            Chi tiết Fanpage
          </SheetTitle>
          <p className="mt-1 text-sm text-white/65">Thông tin và bài đăng gần nhất từ Facebook</p>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {/* Header summary — luôn hiện từ list trong lúc load */}
          <div className="mb-5 flex items-start gap-3">
            <PageAvatar name={summaryName} pictureUrl={summaryPicture} size="lg" />
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-white">{summaryName}</h3>
              <p className="mt-0.5 break-all text-xs text-white/55">
                Page ID: {summaryPageId || EMPTY}
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                Đã kết nối
              </span>
            </div>
          </div>

          {details.isLoading || details.isFetching ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-white/80">
              <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
              <p className="text-sm">Đang tải thông tin Fanpage từ Facebook...</p>
            </div>
          ) : details.isError ? (
            <div className="space-y-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-5">
              <p className="text-sm text-red-100">
                {formatMutationError(details.error, 'Không tải được chi tiết Fanpage')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-[#F97316] text-white hover:bg-[#ea6a0c]"
                  onClick={() => details.refetch()}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Thử lại
                </Button>
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/25 bg-transparent text-white hover:bg-white/10"
                  >
                    Đóng
                  </Button>
                </SheetClose>
              </div>
            </div>
          ) : details.data ? (
            <div className="space-y-6">
              {details.data.warnings?.length > 0 && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {details.data.warnings[0]}
                </div>
              )}

              <section>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#F97316]">
                  Thông tin trang
                </h4>
                <dl className="space-y-3 rounded-lg border border-white/10 bg-[#083028] p-4">
                  <MetaRow label="Danh mục" value={displayText(details.data.page.category)} />
                  <MetaRow label="Website" value={displayText(details.data.page.website)} />
                  <MetaRow
                    label="Người theo dõi"
                    value={displayCount(details.data.page.followersCount)}
                  />
                  <MetaRow label="Lượt thích" value={displayCount(details.data.page.fanCount)} />
                  <MetaRow label="Mô tả" value={displayText(details.data.page.about)} />
                </dl>
              </section>

              <section>
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#F97316]">
                  Bài đăng gần nhất
                  {details.data.recentPosts.length > 0
                    ? ` (${Math.min(details.data.recentPosts.length, 10)})`
                    : ''}
                </h4>

                {details.data.recentPosts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-[#083028]/60 px-4 py-10 text-center text-sm text-white/65">
                    Chưa có bài đăng gần đây để hiển thị.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {details.data.recentPosts.slice(0, 10).map((post) => (
                      <li
                        key={post.id}
                        className="overflow-hidden rounded-lg border border-white/10 bg-[#083028]"
                      >
                        {post.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={post.thumbnailUrl}
                            alt=""
                            className="h-40 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-24 items-center justify-center bg-white/5 text-xs text-white/40">
                            Không có ảnh
                          </div>
                        )}
                        <div className="space-y-2 p-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                            {displayText(post.message)}
                          </p>
                          <p className="text-xs text-white/50">{formatPostTime(post.createdTime)}</p>
                          {post.permalinkUrl ? (
                            <a
                              href={post.permalinkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F97316] hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Mở bài trên Facebook
                            </a>
                          ) : (
                            <p className="text-xs text-white/45">{EMPTY}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/15 px-4 py-10 text-center text-sm text-white/65">
              Chưa có thông tin chi tiết.
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-white/10 px-5 py-3">
          <SheetClose asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/25 bg-transparent text-white hover:bg-white/10"
            >
              Đóng
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
