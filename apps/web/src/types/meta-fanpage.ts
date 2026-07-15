export type MetaFanpageStatus = {
  connected: boolean;
  configured: boolean;
  pageId: string | null;
  pageIdMasked: string | null;
  pageName: string | null;
  graphVersion: string;
  message: string;
  errorCode?: string;
};

export type MetaFanpagePublishResult = {
  success: boolean;
  postId: string;
  facebookPostId: string;
  publishedAt: string | null;
  pageIdMasked: string;
  pageName: string;
  status: string;
};
