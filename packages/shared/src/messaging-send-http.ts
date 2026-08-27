import { isPermanentMessagingError, parseRetryAfterSeconds } from './messaging-send-errors';

export type MessagingHttpSendResult = {
  success: boolean;
  messageId?: string;
  message: string;
  estimatedCost?: number;
  httpStatus?: number;
  retryAfterSeconds?: number;
  retryable: boolean;
  reasonCode?: string;
};

export type MessengerAttachmentType = 'image' | 'video' | 'audio' | 'file';

function classifyHttpFailure(
  httpStatus: number,
  message: string,
  retryAfterHeader?: string | null,
): MessagingHttpSendResult {
  const permanent = isPermanentMessagingError({ httpStatus, message });
  if (httpStatus === 429) {
    return {
      success: false,
      message,
      httpStatus,
      retryAfterSeconds: parseRetryAfterSeconds(retryAfterHeader ?? null),
      retryable: true,
      reasonCode: 'RATE_LIMITED',
    };
  }
  if (httpStatus >= 500) {
    return {
      success: false,
      message,
      httpStatus,
      retryable: true,
      reasonCode: 'PROVIDER_ERROR',
    };
  }
  return {
    success: false,
    message,
    httpStatus,
    retryable: !permanent,
    reasonCode: permanent ? 'POLICY_VIOLATION' : 'PROVIDER_ERROR',
  };
}

function isOutsideMessagingWindow(message: string, subcode?: number): boolean {
  if (subcode === 2018278) return true;
  return /ngoài khoảng thời gian|outside.*allowed|outside.*window/i.test(message || '');
}

async function postMessengerGraph(params: {
  pageAccessToken: string;
  pageId?: string;
  body: Record<string, unknown>;
}): Promise<MessagingHttpSendResult & { subcode?: number }> {
  const token = params.pageAccessToken?.trim();
  if (!token) {
    return {
      success: false,
      message: 'Thiếu token',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  const endpoint = params.pageId?.trim()
    ? `https://graph.facebook.com/v19.0/${encodeURIComponent(params.pageId.trim())}/messages`
    : 'https://graph.facebook.com/v19.0/me/messages';
  const url = `${endpoint}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params.body),
  });

  const data = (await res.json()) as {
    message_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number; type?: string };
  };

  if (!res.ok || data.error) {
    const message = data.error?.message ?? 'Gửi Messenger thất bại';
    return {
      ...classifyHttpFailure(res.status, message, res.headers.get('retry-after')),
      subcode: data.error?.error_subcode,
    };
  }

  return {
    success: true,
    messageId: data.message_id,
    message: 'Đã gửi Messenger',
    estimatedCost: 0,
    httpStatus: res.status,
    retryable: false,
  };
}

async function sendMessengerWithWindowFallback(params: {
  pageAccessToken: string;
  pageId?: string;
  recipientId: string;
  message: Record<string, unknown>;
}): Promise<MessagingHttpSendResult> {
  const base = {
    recipient: { id: params.recipientId },
    message: params.message,
  };
  const first = await postMessengerGraph({
    pageAccessToken: params.pageAccessToken,
    pageId: params.pageId,
    body: { ...base, messaging_type: 'RESPONSE' },
  });
  if (first.success) return first;

  if (isOutsideMessagingWindow(first.message, (first as { subcode?: number }).subcode)) {
    const retry = await postMessengerGraph({
      pageAccessToken: params.pageAccessToken,
      pageId: params.pageId,
      body: {
        ...base,
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
      },
    });
    if (retry.success) return retry;
    return retry;
  }

  return first;
}

async function uploadMessengerAttachmentFromUrl(params: {
  pageAccessToken: string;
  pageId?: string;
  type: MessengerAttachmentType;
  url: string;
}): Promise<MessagingHttpSendResult & { attachmentId?: string }> {
  const token = params.pageAccessToken.trim();
  let mediaUrl = params.url.trim();

  // URL nội bộ /uploads/... → fetch qua API local (không dùng node:fs — shared cũng bundle web)
  if (mediaUrl.startsWith('/uploads/')) {
    const port = process.env.PORT || '4000';
    mediaUrl = `http://127.0.0.1:${port}${mediaUrl}`;
  } else {
    try {
      const u = new URL(mediaUrl);
      if (
        u.pathname.startsWith('/uploads/') &&
        (u.hostname === 'localhost' ||
          u.hostname === '127.0.0.1' ||
          u.hostname.endsWith('marketingautoaz.com'))
      ) {
        const port = process.env.PORT || '4000';
        mediaUrl = `http://127.0.0.1:${port}${u.pathname}`;
      }
    } catch {
      /* keep original */
    }
  }

  let bytes: Uint8Array;
  let contentType = params.type === 'video' ? 'video/mp4' : 'image/jpeg';
  try {
    const res = await fetch(mediaUrl);
    if (!res.ok) {
      return {
        success: false,
        message: `Không tải được media (${res.status})`,
        retryable: true,
        reasonCode: 'PROVIDER_ERROR',
        httpStatus: res.status,
      };
    }
    contentType = res.headers.get('content-type') || contentType;
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return {
      success: false,
      message: e instanceof Error ? e.message : 'Tải media thất bại',
      retryable: true,
      reasonCode: 'PROVIDER_ERROR',
    };
  }

  const filename =
    params.type === 'video' ? 'campaign-video.mp4' : 'campaign-image.jpg';
  const form = new FormData();
  form.append(
    'message',
    JSON.stringify({
      attachment: { type: params.type, payload: { is_reusable: true } },
    }),
  );
  form.append('filedata', new Blob([bytes], { type: contentType }), filename);

  const endpoint = params.pageId?.trim()
    ? `https://graph.facebook.com/v19.0/${encodeURIComponent(params.pageId.trim())}/message_attachments`
    : 'https://graph.facebook.com/v19.0/me/message_attachments';
  const uploadRes = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: form,
  });
  const uploadData = (await uploadRes.json()) as {
    attachment_id?: string;
    error?: { message?: string };
  };
  if (!uploadRes.ok || !uploadData.attachment_id) {
    const message = uploadData.error?.message ?? 'Upload attachment Meta thất bại';
    return classifyHttpFailure(uploadRes.status, message, uploadRes.headers.get('retry-after'));
  }

  return {
    success: true,
    attachmentId: uploadData.attachment_id,
    message: 'Đã upload attachment',
    retryable: false,
    httpStatus: uploadRes.status,
  };
}

export async function sendMessengerHttp(params: {
  pageAccessToken: string;
  recipientId: string;
  text?: string;
  pageId?: string;
  messagingType?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
  attachment?: { type: MessengerAttachmentType; url: string };
}): Promise<MessagingHttpSendResult> {
  const token = params.pageAccessToken?.trim();
  const text = params.text?.trim() ?? '';
  const attachmentUrl = params.attachment?.url?.trim();
  if (!token || (!text && !attachmentUrl)) {
    return {
      success: false,
      message: 'Thiếu token hoặc nội dung',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  let lastSuccess: MessagingHttpSendResult | null = null;

  if (attachmentUrl && params.attachment) {
    // Ưu tiên URL payload; nếu Meta không tải được → upload file qua Graph rồi gửi attachment_id
    let mediaResult = await sendMessengerWithWindowFallback({
      pageAccessToken: token,
      pageId: params.pageId,
      recipientId: params.recipientId,
      message: {
        attachment: {
          type: params.attachment.type,
          payload: { url: attachmentUrl, is_reusable: true },
        },
      },
    });

    if (!mediaResult.success) {
      const uploaded = await uploadMessengerAttachmentFromUrl({
        pageAccessToken: token,
        pageId: params.pageId,
        type: params.attachment.type,
        url: attachmentUrl,
      });
      if (!uploaded.success || !uploaded.attachmentId) {
        return uploaded;
      }
      mediaResult = await sendMessengerWithWindowFallback({
        pageAccessToken: token,
        pageId: params.pageId,
        recipientId: params.recipientId,
        message: {
          attachment: {
            type: params.attachment.type,
            payload: { attachment_id: uploaded.attachmentId },
          },
        },
      });
    }

    if (!mediaResult.success) return mediaResult;
    lastSuccess = mediaResult;
  }

  if (text) {
    const textResult = await sendMessengerWithWindowFallback({
      pageAccessToken: token,
      pageId: params.pageId,
      recipientId: params.recipientId,
      message: { text: text.slice(0, 2000) },
    });
    if (!textResult.success) return textResult;
    lastSuccess = textResult;
  }

  return (
    lastSuccess ?? {
      success: false,
      message: 'Không có nội dung gửi',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    }
  );
}

export type ZaloOaMessageKind = 'cs' | 'promotion' | 'transaction';

/**
 * Official Zalo OA v3 message APIs (per user_id):
 * - Tin tư vấn: POST /v3.0/oa/message/cs
 * - Broadcast / truyền thông: POST /v3.0/oa/message/promotion
 * - Giao dịch: POST /v3.0/oa/message/transaction
 * Auth: header access_token (OA access token). Không hard-code v2 message/cs.
 */
async function postZaloOaMessage(params: {
  accessToken: string;
  recipientId: string;
  kind: ZaloOaMessageKind;
  message: Record<string, unknown>;
}): Promise<MessagingHttpSendResult> {
  const token = params.accessToken.trim();
  const recipientId = params.recipientId.trim();
  const url = `https://openapi.zalo.me/v3.0/oa/message/${params.kind}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      access_token: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { user_id: recipientId },
      message: params.message,
    }),
  });

  const data = (await res.json()) as {
    data?: { message_id?: string };
    message?: string;
    error?: number;
  };

  const errCode = data.error != null ? Number(data.error) : null;
  if (res.ok && (errCode == null || errCode === 0)) {
    return {
      success: true,
      messageId: data.data?.message_id,
      message:
        params.kind === 'promotion'
          ? 'Đã gửi Zalo Broadcast'
          : params.kind === 'transaction'
            ? 'Đã gửi Zalo Transaction'
            : 'Đã gửi Zalo tin tư vấn',
      estimatedCost: 0,
      httpStatus: res.status,
      retryable: false,
    };
  }

  const messageText = data.message ?? 'Gửi Zalo OA thất bại';
  if (errCode === -224 || /upgrade OA Tier/i.test(messageText)) {
    const kindLabel =
      params.kind === 'promotion'
        ? 'Broadcast (promotion)'
        : params.kind === 'transaction'
          ? 'transaction'
          : 'tin tư vấn (cs)';
    return {
      success: false,
      message: `OA chưa đủ gói Zalo (error -224) để dùng API ${kindLabel}. Nâng gói trên zalo.cloud/oa/pricing rồi thử lại.`,
      retryable: false,
      reasonCode: 'PROVIDER_ERROR',
      httpStatus: res.status,
    };
  }

  return classifyHttpFailure(res.status, messageText, res.headers.get('retry-after'));
}

async function sendZaloOaPayloads(params: {
  accessToken: string;
  recipientId: string;
  kind: ZaloOaMessageKind;
  text?: string;
  imageUrl?: string;
  fileUrl?: string;
  /** Optional CTA buttons for list/template messages */
  buttons?: Array<{ title: string; url?: string }>;
}): Promise<MessagingHttpSendResult> {
  const token = params.accessToken?.trim();
  const recipientId = params.recipientId?.trim();
  const text = params.text?.trim();
  const imageUrl = params.imageUrl?.trim();
  const fileUrl = params.fileUrl?.trim();
  const buttons = (params.buttons ?? []).filter((b) => b.title?.trim()).slice(0, 5);

  if (!token || !recipientId || (!text && !imageUrl && !fileUrl)) {
    return {
      success: false,
      message: 'Thiếu token, recipient hoặc nội dung',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  let lastSuccess: MessagingHttpSendResult | null = null;

  if (imageUrl) {
    const mediaResult = await postZaloOaMessage({
      accessToken: token,
      recipientId,
      kind: params.kind,
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'media',
            elements: [{ media_type: 'image', url: imageUrl }],
          },
        },
      },
    });
    if (!mediaResult.success) return mediaResult;
    lastSuccess = mediaResult;
  }

  if (fileUrl) {
    const fileResult = await postZaloOaMessage({
      accessToken: token,
      recipientId,
      kind: params.kind,
      message: {
        attachment: {
          type: 'file',
          payload: { url: fileUrl },
        },
      },
    });
    if (!fileResult.success) return fileResult;
    lastSuccess = fileResult;
  }

  if (text) {
    if (buttons.length > 0) {
      const btnResult = await postZaloOaMessage({
        accessToken: token,
        recipientId,
        kind: params.kind,
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'list',
              elements: [
                {
                  title: text.slice(0, 100),
                  subtitle: text.slice(0, 500),
                },
              ],
              buttons: buttons.map((b) => ({
                title: b.title.slice(0, 35),
                type: 'oa.open.url',
                payload: { url: (b.url || 'https://zalo.me').trim() },
              })),
            },
          },
        },
      });
      if (!btnResult.success) {
        // Fallback text-only nếu OA không hỗ trợ list+CTA
        const textResult = await postZaloOaMessage({
          accessToken: token,
          recipientId,
          kind: params.kind,
          message: { text: text.slice(0, 2000) },
        });
        if (!textResult.success) return textResult;
        lastSuccess = textResult;
      } else {
        lastSuccess = btnResult;
      }
    } else {
      const textResult = await postZaloOaMessage({
        accessToken: token,
        recipientId,
        kind: params.kind,
        message: { text: text.slice(0, 2000) },
      });
      if (!textResult.success) return textResult;
      lastSuccess = textResult;
    }
  }

  return (
    lastSuccess ?? {
      success: false,
      message: 'Không có nội dung gửi',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    }
  );
}

/** Tin tư vấn — chỉ trong cửa sổ tương tác / policy Zalo */
export async function sendZaloOaHttp(params: {
  accessToken: string;
  recipientId: string;
  text?: string;
  /** Public HTTPS image URL */
  imageUrl?: string;
  /** Public HTTPS file URL */
  fileUrl?: string;
  buttons?: Array<{ title: string; url?: string }>;
}): Promise<MessagingHttpSendResult> {
  return sendZaloOaPayloads({ ...params, kind: 'cs' });
}

/** Broadcast / tin truyền thông tới người đang quan tâm OA */
export async function sendZaloBroadcastHttp(params: {
  accessToken: string;
  recipientId: string;
  text?: string;
  imageUrl?: string;
  fileUrl?: string;
  buttons?: Array<{ title: string; url?: string }>;
}): Promise<MessagingHttpSendResult> {
  return sendZaloOaPayloads({ ...params, kind: 'promotion' });
}

export async function sendZbsTemplateHttp(params: {
  accessToken: string;
  phone?: string;
  userId?: string;
  templateId: string;
  templateData?: Record<string, string>;
}): Promise<MessagingHttpSendResult> {
  const token = params.accessToken?.trim();
  const phone = params.phone?.trim();
  const userId = params.userId?.trim();
  if (!token || !params.templateId || (!phone && !userId)) {
    return {
      success: false,
      message: 'Thiếu token, template hoặc SĐT/UID',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  const payload: Record<string, unknown> = {
    template_id: params.templateId,
    template_data: params.templateData ?? {},
  };
  if (phone) payload.phone = phone;
  if (userId) payload.user_id = userId;

  const res = await fetch('https://business.openapi.zalo.me/message/template', {
    method: 'POST',
    headers: {
      access_token: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as {
    data?: { msg_id?: string };
    message?: string;
    error?: number;
  };

  if (!res.ok || data.error) {
    const message = data.message ?? 'Gửi ZBS template thất bại';
    return classifyHttpFailure(res.status, message, res.headers.get('retry-after'));
  }

  return {
    success: true,
    messageId: data.data?.msg_id,
    message: 'Đã gửi ZBS template',
    estimatedCost: 200,
    httpStatus: res.status,
    retryable: false,
  };
}
