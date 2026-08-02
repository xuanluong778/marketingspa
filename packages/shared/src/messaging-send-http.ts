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

export async function sendMessengerHttp(params: {
  pageAccessToken: string;
  recipientId: string;
  text: string;
  messagingType?: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG';
}): Promise<MessagingHttpSendResult> {
  const token = params.pageAccessToken?.trim();
  const text = params.text?.trim();
  if (!token || !text) {
    return {
      success: false,
      message: 'Thiếu token hoặc nội dung',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: params.recipientId },
      message: { text },
      messaging_type: params.messagingType ?? 'RESPONSE',
    }),
  });

  const data = (await res.json()) as {
    message_id?: string;
    error?: { message?: string; code?: number; type?: string };
  };

  if (!res.ok || data.error) {
    const message = data.error?.message ?? 'Gửi Messenger thất bại';
    return classifyHttpFailure(res.status, message, res.headers.get('retry-after'));
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

export async function sendZaloOaHttp(params: {
  accessToken: string;
  recipientId: string;
  text: string;
}): Promise<MessagingHttpSendResult> {
  const token = params.accessToken?.trim();
  const text = params.text?.trim();
  if (!token || !text) {
    return {
      success: false,
      message: 'Thiếu token hoặc nội dung',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  const res = await fetch('https://openapi.zalo.me/v2.0/oa/message/cs', {
    method: 'POST',
    headers: {
      access_token: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { user_id: params.recipientId },
      message: { text },
    }),
  });

  const data = (await res.json()) as {
    data?: { message_id?: string };
    message?: string;
    error?: number;
  };

  if (!res.ok || data.error) {
    const message = data.message ?? 'Gửi Zalo OA thất bại';
    return classifyHttpFailure(res.status, message, res.headers.get('retry-after'));
  }

  return {
    success: true,
    messageId: data.data?.message_id,
    message: 'Đã gửi Zalo OA',
    estimatedCost: 0,
    httpStatus: res.status,
    retryable: false,
  };
}

export async function sendZbsTemplateHttp(params: {
  accessToken: string;
  phone: string;
  templateId: string;
  templateData?: Record<string, string>;
}): Promise<MessagingHttpSendResult> {
  const token = params.accessToken?.trim();
  if (!token || !params.templateId || !params.phone) {
    return {
      success: false,
      message: 'Thiếu token, template hoặc SĐT',
      retryable: false,
      reasonCode: 'INVALID_RECIPIENT',
    };
  }

  const res = await fetch('https://business.openapi.zalo.me/message/template', {
    method: 'POST',
    headers: {
      access_token: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone: params.phone,
      template_id: params.templateId,
      template_data: params.templateData ?? {},
    }),
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
