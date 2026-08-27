'use client';

import { useCallback, useMemo, useState } from 'react';
import { Facebook, Loader2, RefreshCw, Send } from 'lucide-react';
import { FacebookFanpagePreview } from '@/components/auto-post/facebook-fanpage-preview';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ErrorState, LoadingState } from '@/components/shared/page-state';
import { useMetaFanpageMutations, useMetaFanpageStatus } from '@/hooks/use-meta-fanpage';
import { formatMutationError } from '@/lib/format-mutation-error';
import { useT } from '@/i18n/i18n-provider';

export function MetaFanpageAutoPostPanel() {
  const t = useT();
  const { data: status, isLoading, refetch, isFetching } = useMetaFanpageStatus();
  const { checkConnection, publishNow } = useMetaFanpageMutations();

  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const connected = Boolean(status?.connected);
  const pageName = status?.pageName || 'Fanpage';

  const canPublish = useMemo(() => {
    if (!connected) return false;
    if (!message.trim()) return false;
    if (link.trim() && imageUrl.trim()) return false;
    return true;
  }, [connected, message, link, imageUrl]);

  const handleCheck = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    try {
      const data = await checkConnection.mutateAsync();
      setMsg(data.message);
      if (!data.connected) setErrorMsg(data.message);
    } catch (error) {
      setErrorMsg(formatMutationError(error, t('facebookFlow.cannotCheckConnection')));
    }
  }, [checkConnection, t]);

  const handlePublish = useCallback(async () => {
    setMsg('');
    setErrorMsg('');
    if (link.trim() && imageUrl.trim()) {
      setErrorMsg(t('facebookFlow.pickLinkOrImage'));
      return;
    }
    const ok = window.confirm(t('facebookFlow.confirmPublishPublic'));
    if (!ok) return;

    try {
      const result = await publishNow.mutateAsync({
        message: message.trim(),
        link: link.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      });
      setMsg(t('facebookFlow.publishedOkWithId', { id: result.facebookPostId }));
      setMessage('');
      setLink('');
      setImageUrl('');
      await refetch();
    } catch (error) {
      setErrorMsg(formatMutationError(error, t('facebookFlow.publishFailed')));
    }
  }, [publishNow, message, link, imageUrl, refetch, t]);

  if (isLoading) {
    return <LoadingState message={t('facebookFlow.checkingConnection')} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Facebook className="h-5 w-5 text-[#1877F2]" />
              {t('facebookFlow.connectTitle')}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t('facebookFlow.tokenOnServer')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleCheck}
            disabled={checkConnection.isPending || isFetching}
          >
            {checkConnection.isPending || isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('facebookFlow.checkConnection')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">{t('facebookFlow.statusLabel')}</p>
            <p className={connected ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>
              {connected ? t('facebookFlow.connected') : t('facebookFlow.notConnected')}
            </p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">{t('facebookFlow.fanpageName')}</p>
            <p className="font-medium truncate">{status?.pageName || '—'}</p>
          </div>
          <div className="rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs">{t('facebookFlow.pageId')}</p>
            <p className="font-medium font-mono">{status?.pageIdMasked || '—'}</p>
          </div>
        </div>

        {!status?.configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('facebookFlow.envConfigPrefix')} <code>META_PAGE_ID</code>,{' '}
            <code>META_PAGE_ACCESS_TOKEN</code>, <code>META_GRAPH_VERSION</code>{' '}
            {t('facebookFlow.envConfigSuffix')}
          </div>
        )}

        {msg && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {errorMsg && <ErrorState message={errorMsg} onRetry={() => setErrorMsg('')} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5 shadow-sm space-y-4">
          <h3 className="font-semibold">{t('facebookFlow.postToFanpage')}</h3>
          {!connected ? (
            <p className="text-xs text-amber-700">
              {t('facebookFlow.composeWhileDisconnected')}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="meta-fp-message">{t('facebookFlow.content')}</Label>
            <Textarea
              id="meta-fp-message"
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('facebookFlow.contentPlaceholderShort')}
              disabled={publishNow.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meta-fp-link">{t('facebookFlow.linkOptional')}</Label>
            <Input
              id="meta-fp-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              disabled={publishNow.isPending || Boolean(imageUrl.trim())}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meta-fp-image">{t('facebookFlow.imageUrl')}</Label>
            <Input
              id="meta-fp-image"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://.../image.jpg"
              disabled={publishNow.isPending || Boolean(link.trim())}
            />
          </div>
          <Button
            type="button"
            className="w-full"
            onClick={handlePublish}
            disabled={!canPublish || publishNow.isPending}
          >
            {publishNow.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {t('facebookFlow.publishNow')}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t('facebookFlow.preview')}</p>
          <FacebookFanpagePreview
            pageName={pageName}
            caption={message}
            imageUrl={imageUrl}
            linkUrl={link}
          />
        </div>
      </div>
    </div>
  );
}
