'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IntegrationsPanel } from '@/components/settings/integrations-panel';
import { useChatbotOpenAiStatus } from '@/hooks/use-chatbot-cskh';
import { Badge } from '@/components/ui/badge';

/**
 * Tab API: tái sử dụng IntegrationsPanel (credentials mã hóa backend, test connection).
 * Key chỉ nhập khi connect — không log / không localStorage trong panel.
 */
export function SettingsApiPanel() {
  const [testOpenAi, setTestOpenAi] = useState(false);
  const openAi = useChatbotOpenAiStatus(testOpenAi);
  // when test toggled false→true, query refetches because key changes

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Kết nối dịch vụ ngoài</h2>
        <p className="text-sm text-muted-foreground mb-3">
          API key / credentials chỉ gửi lên server khi kết nối, được mã hóa lưu backend. Không lưu
          full key trên trình duyệt. Test connection phản ánh trạng thái và lỗi gần nhất từ server.
        </p>
        <IntegrationsPanel />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Provider (OpenAI / server env)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Provider AI dùng cho Chatbot CSKH & Knowledge Base. Key cấu hình trên server (env),
            không hiện plaintext trên UI.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTestOpenAi(true)}>
              Test connection
            </Button>
            {openAi.isFetching && <span className="text-muted-foreground">Đang kiểm tra…</span>}
            {openAi.data && (
              <Badge variant={openAi.data.configured ? 'default' : 'secondary'}>
                {openAi.data.configured
                  ? openAi.data.ok
                    ? 'CONNECTED'
                    : 'ERROR'
                  : 'NOT_CONFIGURED'}
              </Badge>
            )}
          </div>
          {openAi.data?.error ? (
            <p className="text-xs text-muted-foreground">Lỗi gần nhất: {openAi.data.error}</p>
          ) : null}
          {openAi.isError ? (
            <p className="text-xs text-destructive">Không gọi được openai/status.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Webhook nhận tin (Messenger Fanpage, Zalo, payment) do hệ thống đăng ký theo từng kênh
            đã kết nối — không cấu hình key public trên client.
          </p>
          <p>
            Endpoint công khai (ví dụ):{' '}
            <code className="text-xs">/api/v1/chatbot-cskh/facebook/webhook</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
