import type { PersonalIdeasSuggestion, PersonalTitlesSuggestion } from '@/types/content-marketing';

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
  realistic_view: ['Sự thật "không ai nói" về cuộc sống và công việc'],
  personal_trend: ['Cách bạn bắt trend mà vẫn giữ chất riêng'],
  failure_lesson: ['Dự án sai lầm và bài học rút ra'],
  success_experience: ['Bước ngoặt giúp bạn đạt kết quả đầu tiên'],
  community_engagement: ['Câu hỏi mở để cộng đồng cùng thảo luận'],
};

/** Fallback khi API lỗi / mạng */
export function suggestPersonalTitlesLocal(input: {
  subtopicLabel: string;
  topicGroupLabel?: string;
  count: 5 | 10 | 20;
  audience?: string;
}): PersonalTitlesSuggestion {
  const sub = input.subtopicLabel.trim() || 'Hành trình cá nhân';
  const group = input.topicGroupLabel?.trim();
  const audience = input.audience?.trim();
  const patterns = [
    `${sub} — góc nhìn tôi muốn giữ`,
    `Điều tôi học được từ: ${sub}`,
    `${sub}: câu chuyện chưa kể hết`,
    `Khi ${sub.toLowerCase()} trở thành bài học`,
    `${sub} — không hoàn hảo, nhưng thật`,
    `Tôi từng nghĩ khác về ${sub.toLowerCase()}`,
    `${sub}: lần đứng dậy sau khó khăn`,
    `Chân thật về ${sub.toLowerCase()}`,
    `${sub} — điều tôi muốn nói với chính mình`,
    `Bài học nhỏ từ ${sub.toLowerCase()}`,
    `${sub}: khoảnh khắc tôi thay đổi cách nhìn`,
    `Không phải tip hay — chỉ là ${sub.toLowerCase()}`,
    `${sub} và điều tôi sẽ không làm lại`,
    `Một lần ${sub.toLowerCase()} đủ để tôi nhớ mãi`,
    `${sub} — viết cho người đang cùng hành trình`,
    `Điều mạng xã hội bỏ quên về ${sub.toLowerCase()}`,
    `${sub}: chậm nhưng bền`,
    `Tôi kể ${sub.toLowerCase()} vì ai đó cần nghe`,
    `${sub} — không giật tít, chỉ thật`,
    `Sau ${sub.toLowerCase()}, tôi chọn đi tiếp như thế này`,
  ];
  if (group) {
    patterns.push(`${group}: ${sub}`, `${sub} — trong mạch ${group.toLowerCase()}`);
  }
  if (audience) {
    patterns.push(`${sub} — gửi tới ${audience}`);
  }
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const t of patterns) {
    const key = t.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(t);
    if (titles.length >= input.count) break;
  }
  let i = 1;
  while (titles.length < input.count) {
    const t = `${sub} — góc nhìn ${i + 1}`;
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      titles.push(t);
    }
    i += 1;
    if (i > 40) break;
  }
  return { titles: titles.slice(0, input.count), source: 'template' };
}

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
