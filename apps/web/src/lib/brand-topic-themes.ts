/**
 * Nhóm chủ đề lớn + chủ đề nhỏ cho tab Xây dựng thương hiệu.
 * Tối thiểu 10 chủ đề nhỏ / nhóm. Không hardcode trong component.
 */

export const BRAND_TOPIC_GROUP_IDS = [
  'personal_journey',
  'failure_lessons',
  'motivation',
  'life_views',
  'professional_experience',
  'milestones',
  'customer_stories',
  'discipline_growth',
  'leadership_business',
  'real_life_people',
] as const;

export type BrandTopicGroupId = (typeof BRAND_TOPIC_GROUP_IDS)[number];

export interface BrandTopicGroup {
  id: BrandTopicGroupId;
  label: string;
  /** ≥10 chủ đề nhỏ */
  topics: string[];
}

export const BRAND_TOPIC_GROUPS: BrandTopicGroup[] = [
  {
    id: 'personal_journey',
    label: 'Hành trình cá nhân',
    topics: [
      'Ngày tôi quyết định thay đổi cuộc đời mình',
      'Hành trình tìm lại bản thân sau khi mất phương hướng',
      'Từ chỗ chưa biết mình muốn gì đến khi tìm được lối đi',
      'Những năm đầu tự lập và bài học xương máu',
      'Chuyến đi ngắn làm tôi nhìn lại cả cuộc đời',
      'Tôi từng sống vì người khác như thế nào',
      'Khoảnh khắc nhận ra mình đã trưởng thành',
      'Hành trình chữa lành những tổn thương cũ',
      'Từ vùng an toàn đến bước nhảy đầu tiên',
      'Câu chuyện “tôi hôm nay” và “tôi ngày ấy”',
      'Khi tôi học cách nói “không” với chính mình trước đây',
      'Con đường dài hơn tôi nghĩ — và vì sao tôi vẫn đi',
    ],
  },
  {
    id: 'failure_lessons',
    label: 'Bài học từ thất bại',
    topics: [
      'Lần thất bại lớn nhất tôi từng trải qua',
      'Sai lầm khiến tôi mất thời gian quý nhất',
      'Khi kế hoạch đẹp đẽ sụp đổ trong một đêm',
      'Bài học từ lần bị phản bội lòng tin',
      'Tôi từng bỏ cuộc — và vì sao tôi quay lại',
      'Thất bại im lặng không ai biết đến',
      'Khi tự tin quá đà trở thành cú ngã',
      'Lỗi nhỏ dẫn đến hậu quả lớn',
      'Tôi đã học được gì từ việc “làm sai hết”',
      'Thất bại dạy tôi khiêm tốn thế nào',
      'Ngày tôi thừa nhận mình không đủ giỏi',
      'Từ đổ vỡ đến cách đứng dậy khác trước',
    ],
  },
  {
    id: 'motivation',
    label: 'Truyền động lực',
    topics: [
      'Một câu nói đổi cách tôi nhìn cuộc sống',
      'Khi mệt mỏi cũng là lúc cần bắt đầu lại',
      'Động lực không đến từ ồn ào — đến từ quyết tâm nhỏ',
      'Bạn không cần hoàn hảo để bắt đầu',
      'Sức mạnh của việc làm đúng một việc mỗi ngày',
      'Tin vào bản thân khi chẳng ai tin',
      'Lý do tôi vẫn cố dù kết quả chưa thấy',
      'Động lực thật sự đến sau kỷ luật',
      'Khi bạn nghĩ mình chậm — bạn đang tích lũy',
      'Một buổi sáng thay đổi cả tuần của tôi',
      'Truyền lửa cho người khác bằng chính trải nghiệm mình',
      'Không cần động lực lớn — cần hành động nhỏ bền',
    ],
  },
  {
    id: 'life_views',
    label: 'Quan điểm sống',
    topics: [
      'Tôi nghĩ thế nào về “thành công”',
      'Sống chậm không có nghĩa là lười',
      'Quan điểm của tôi về tiền bạc và giá trị',
      'Vì sao tôi chọn chân thật thay vì hoàn hảo',
      'Ranh giới giữa ích kỷ và tự trọng',
      'Tôi không tin vào shortcut cuộc đời',
      'Quan điểm về tình yêu và sự trưởng thành',
      'Sống vì ai — và sống vì điều gì',
      'Điều tôi không còn chấp nhận ở tuổi này',
      'Hạnh phúc đơn giản theo cách tôi hiểu',
      'Vì sao im lặng đôi khi là sức mạnh',
      'Quan điểm của tôi về việc “đủ là đủ”',
    ],
  },
  {
    id: 'professional_experience',
    label: 'Kinh nghiệm chuyên môn',
    topics: [
      'Bài học nghề nghiệp tôi ước được biết sớm hơn',
      'Sai lầm chuyên môn và cách tôi sửa',
      'Kỹ năng mềm quan trọng hơn tôi nghĩ',
      'Cách tôi học nghề khi không có mentor',
      'Ngày đầu tiên trong nghề và nỗi sợ không ai thấy',
      'Kinh nghiệm làm việc với người khó tính',
      'Khi chuyên môn không đủ — cần thái độ',
      'Cách tôi giữ chuẩn mực khi áp lực cao',
      'Bài học từ khách hàng / đối tác khó quên',
      'Tôi xây dựng uy tín nghề nghiệp thế nào',
      'Những việc “không nằm trong JD” dạy tôi nhiều nhất',
      'Kinh nghiệm chuyển ngành / đổi hướng nghề',
    ],
  },
  {
    id: 'milestones',
    label: 'Thành tựu và dấu mốc',
    topics: [
      'Dấu mốc tôi tự hào nhất (và vì sao)',
      'Ngày tôi đạt mục tiêu từng nghĩ là bất khả thi',
      'Thành tựu nhỏ nhưng thay đổi cách tôi nhìn mình',
      'Kỷ niệm cột mốc một năm đầy thử thách',
      'Lần đầu tiên được công nhận đúng nghĩa',
      'Dấu mốc không có pháo hoa — chỉ có nước mắt',
      'Thành tựu đến sau nhiều lần gần bỏ cuộc',
      'Tôi đo thành công bằng gì ngoài con số',
      'Cột mốc trong gia đình / mối quan hệ',
      'Ngày tôi dám gọi đó là “thành công của mình”',
      'Thành tựu chung với đội nhóm / người đồng hành',
      'Nhìn lại 5 năm — điều gì đáng kể nhất',
    ],
  },
  {
    id: 'customer_stories',
    label: 'Câu chuyện khách hàng',
    topics: [
      'Khách hàng dạy tôi bài học lớn nhất',
      'Câu chuyện khách hàng khiến tôi im lặng rất lâu',
      'Khi lắng nghe khách hơn là “bán”',
      'Phản hồi khó nghe và cách tôi trưởng thành',
      'Khách hàng quay lại sau một lần thất vọng',
      'Câu chuyện biến đổi thật của một khách hàng',
      'Ngày tôi hiểu “phục vụ” nghĩa là gì',
      'Khách hàng không chỉ mua sản phẩm — họ mua niềm tin',
      'Một lời cảm ơn giản dị làm tôi nhớ mãi',
      'Xử lý khiếu nại và giữ được mối quan hệ',
      'Câu chuyện khách hàng phản ánh giá trị thương hiệu',
      'Bài học từ việc đặt khách hàng vào trung tâm',
    ],
  },
  {
    id: 'discipline_growth',
    label: 'Kỷ luật và phát triển bản thân',
    topics: [
      'Thói quen nhỏ tạo thay đổi lớn',
      'Tôi xây kỷ luật khi không có động lực',
      'Buổi sáng kỷ luật và vì sao tôi giữ nó',
      'Bỏ thói quen xấu — hành trình không đẹp',
      'Kỷ luật đọc / học mỗi ngày của tôi',
      'Khi lười biếng đội lốt “nghỉ ngơi”',
      'Phát triển bản thân không cần ồn ào',
      'Tôi đo tiến bộ thế nào thay vì so sánh',
      'Kỷ luật với sức khỏe và tinh thần',
      'Học một kỹ năng mới ở tuổi không còn “trẻ”',
      'Hệ thống cá nhân giúp tôi không bỏ cuộc',
      'Kỷ luật mềm — nghiêm nhưng tử tế với mình',
    ],
  },
  {
    id: 'leadership_business',
    label: 'Lãnh đạo và kinh doanh',
    topics: [
      'Bài học lãnh đạo từ lần quản lý sai',
      'Xây đội ngũ khi chưa có kinh nghiệm',
      'Quyết định kinh doanh khó nhất tôi từng đưa ra',
      'Khi phải sa thải / nói lời thật với nhân sự',
      'Lãnh đạo bằng gương hơn bằng lời',
      'Bài học dòng tiền và kỷ luật kinh doanh',
      'Văn hóa làm việc tôi muốn xây',
      'Đối mặt cạnh tranh mà không mất bản sắc',
      'Khởi nghiệp / mở rộng và những đêm không ngủ',
      'Lãnh đạo khi đội nhóm mất động lực',
      'Bài học từ đối tác và thương lượng',
      'Kinh doanh có lương tâm theo cách tôi hiểu',
    ],
  },
  {
    id: 'real_life_people',
    label: 'Cuộc sống và con người thật',
    topics: [
      'Người thật việc thật xung quanh tôi tuần này',
      'Một cuộc trò chuyện tình cờ chạm đến tôi',
      'Con người sau lớp mặt nạ mạng xã hội',
      'Những người lặng lẽ nâng đỡ tôi',
      'Câu chuyện đời thường ở quán cà phê / xe buýt',
      'Khi tôi học cách nhìn người khác bằng sự tử tế',
      'Mối quan hệ thật trong thời đại ồn ào',
      'Người tôi từng hiểu lầm — và bài học',
      'Sự chân thật của những người “không nổi”',
      'Cuộc sống thật sau ánh đèn thành công',
      'Người thân dạy tôi điều không có trong sách',
      'Tôi thấy mình trong câu chuyện của người khác',
    ],
  },
];

export const BRAND_TOPIC_GROUP_LABELS: Record<BrandTopicGroupId, string> = Object.fromEntries(
  BRAND_TOPIC_GROUPS.map((g) => [g.id, g.label]),
) as Record<BrandTopicGroupId, string>;

/** Audience gợi ý cố định (không phụ thuộc ngành). */
export const BRAND_AUDIENCE_PRESETS = [
  'Người đang tìm động lực thay đổi',
  'Người từng trải thất bại / khởi đầu lại',
  'Người làm nghề muốn xây thương hiệu cá nhân',
  'Chủ doanh nghiệp / lãnh đạo nhỏ',
  'Người trẻ 22–35 đang định hướng cuộc sống',
  'Phụ nữ bận rộn muốn sống thật với bản thân',
  'Người theo dõi fanpage muốn câu chuyện chân thật',
  'Đồng nghiệp / cộng đồng nghề nghiệp',
] as const;

export function getBrandTopicGroup(id: string | null | undefined): BrandTopicGroup | null {
  if (!id) return null;
  return BRAND_TOPIC_GROUPS.find((g) => g.id === id) ?? null;
}

/**
 * Random `count` chủ đề không trùng trong nhóm.
 * count mặc định random trong [minCount, maxCount].
 */
export function pickRandomTopicsFromGroup(
  groupId: string,
  options?: { count?: number; minCount?: number; maxCount?: number; exclude?: string[] },
): string[] {
  const group = getBrandTopicGroup(groupId);
  if (!group) return [];
  const min = options?.minCount ?? 5;
  const max = options?.maxCount ?? 8;
  const exclude = new Set((options?.exclude ?? []).map((t) => t.trim()).filter(Boolean));
  const pool = group.topics.filter((t) => !exclude.has(t));
  const source = pool.length >= min ? pool : group.topics.slice();
  const n =
    options?.count ??
    Math.min(source.length, Math.max(min, Math.floor(Math.random() * (max - min + 1)) + min));
  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const t of shuffled) {
    if (seen.has(t)) continue;
    seen.add(t);
    picked.push(t);
    if (picked.length >= n) break;
  }
  return picked;
}

export function isBrandTopicGroupId(id: string): id is BrandTopicGroupId {
  return (BRAND_TOPIC_GROUP_IDS as readonly string[]).includes(id);
}

/** ID ổn định từ nhãn chủ đề nhỏ (không cần sửa config topics). */
export function toSubtopicId(label: string): string {
  const s = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || 'subtopic';
}
