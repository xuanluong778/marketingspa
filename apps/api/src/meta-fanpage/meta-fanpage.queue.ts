/** Job name chuẩn bị cho hẹn giờ đăng Fanpage (env token) — chưa bật processor lịch. */
export const META_FANPAGE_PUBLISH_JOB = 'meta-fanpage-publish';

export type MetaFanpagePublishJobData = {
  userId: string;
  organizationId: string;
  message: string;
  link?: string;
  imageUrl?: string;
  /** ISO string — dùng khi hỗ trợ schedule */
  scheduledAt?: string;
  historyPostId?: string;
};
