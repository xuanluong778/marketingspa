import type { PersonalIdeasSuggestion } from '@/types/content-marketing';

const ANGLE_BY_GOAL: Record<string, string[]> = {
  engagement: [
    'Đặt câu hỏi để người đọc muốn chia sẻ quan điểm',
    'Góc nhìn trái chiều với điều mọi người hay nghĩ',
  ],
  knowledge: ['Chia sẻ điều ít người nói thẳng — từ kinh nghiệm thực tế'],
  inspiration: ['Thành công không phải lúc nào cũng ồn ào'],
  humor: ['Kể chuyện hài nhưng vẫn có bài học nhỏ'],
  touching_story: ['Khoảnh khắc nhỏ thay đổi cách nhìn của bạn'],
  personal_view: ['Quan điểm cá nhân — không ai đúng tuyệt đối'],
  trend: ['Bắt trend nhưng thêm góc nhìn riêng'],
  personal_branding: ['Hành trình xây dựng uy tín từ con số 0'],
};

const STORY_BY_TYPE: Record<string, string[]> = {
  personal_story: ['Kể về lần thất bại đầu tiên khi khởi nghiệp'],
  motivational: ['Ngày tồi tệ nhất và điều giúp bạn đứng dậy'],
  touching: ['Khoảnh khắc một khách hàng nói câu khiến bạn xúc động'],
  knowledge_sharing: ['Một hiểu lầm phổ biến mà bạn từng mắc'],
  humor: ['Tình huống "dở khóc dở cười" trong ngày làm việc'],
  philosophy: ['Một câu hỏi bạn tự hỏi mỗi sáng'],
  realistic_view: ['Sự thật "không ai nói" về ngành spa / làm đẹp'],
  personal_trend: ['Cách bạn bắt trend mà vẫn giữ chất riêng'],
  failure_lesson: ['Dự án sai lầm và bài học rút ra'],
  success_experience: ['Bước ngoặt giúp bạn đạt kết quả đầu tiên'],
  community_engagement: ['Câu hỏi mở để cộng đồng cùng thảo luận'],
};

/** Fallback khi API chưa có endpoint hoặc lỗi mạng */
export function suggestPersonalIdeasLocal(input: {
  postTopic: string;
  targetAudience?: string;
  postGoal?: string;
  personalPostType?: string;
}): PersonalIdeasSuggestion {
  const topic = input.postTopic.trim();
  const audience = input.targetAudience?.trim() || 'người đọc mục tiêu';
  const goal = input.postGoal ?? 'engagement';
  const postType = input.personalPostType ?? 'personal_story';

  const angles = ANGLE_BY_GOAL[goal] ?? ANGLE_BY_GOAL.engagement ?? [];
  const stories = STORY_BY_TYPE[postType] ?? STORY_BY_TYPE.personal_story ?? [];

  return {
    personalAngle: `${angles[0] ?? 'Góc nhìn thực tế từ trải nghiệm cá nhân'} (chủ đề: ${topic})`,
    storyIdea: `${stories[0] ?? 'Kể một khoảnh khắc đời thường'} — gợi ý cho "${topic}", phù hợp ${audience}`,
    angleAlternatives: angles.slice(1).map((a) => `${a} — ${topic}`),
    storyAlternatives: stories.slice(1).map((s) => `${s} — hướng tới ${audience}`),
    source: 'template',
  };
}
