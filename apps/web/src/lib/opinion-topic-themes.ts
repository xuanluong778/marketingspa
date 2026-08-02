/**
 * Nhóm chủ đề lớn + chủ đề con cho “Góc nhìn & Chính kiến”.
 * Không hardcode danh sách trong component — import từ file này.
 */

export const OPINION_TOPIC_GROUP_IDS = [
  'clip_life_comment',
  'raise_children',
  'parents_filial',
  'sibling_bond',
  'couple_family',
  'overcome_adversity',
  'fate_choice',
  'human_kindness',
  'gratitude',
  'forgive_let_go',
  'faith_hope',
  'money_feelings',
  'success_failure',
  'old_age_loneliness',
  'friendship_loyalty',
  'social_conduct',
] as const;

export type OpinionTopicGroupId = (typeof OPINION_TOPIC_GROUP_IDS)[number];

export type OpinionQuickAngleId =
  | 'agree_handling'
  | 'disagree_handling'
  | 'no_side'
  | 'insider_view'
  | 'community_view'
  | 'behavior_analysis'
  | 'life_lesson'
  | 'custom_stance'
  | 'tell_story'
  | 'personal_view'
  | 'multi_angle'
  | 'encourage';

export interface OpinionQuickAngle {
  id: OpinionQuickAngleId;
  label: string;
  stanceHint?: 'agree' | 'disagree' | 'neutral' | 'multi' | 'custom';
  angleHint?: string;
}

export interface OpinionTopicGroup {
  id: OpinionTopicGroupId;
  label: string;
  description: string;
  /** ≥10 chủ đề con */
  subtopics: string[];
  quickAngles: OpinionQuickAngle[];
  styleHints: string[];
  structureHints: string[];
  sourcePlaceholder: string;
  /** Cần URL / caption video (nhóm bình luận clip) */
  requiresSource?: boolean;
}

const CLIP_QUICK_ANGLES: OpinionQuickAngle[] = [
  {
    id: 'agree_handling',
    label: 'Đồng tình với cách xử lý',
    stanceHint: 'agree',
    angleHint: 'Đồng tình với cách xử lý trong clip',
  },
  {
    id: 'disagree_handling',
    label: 'Không đồng tình với cách xử lý',
    stanceHint: 'disagree',
    angleHint: 'Không đồng tình với cách xử lý trong clip',
  },
  {
    id: 'no_side',
    label: 'Không đứng về phía nào',
    stanceHint: 'neutral',
    angleHint: 'Không đứng về phía nào — nhìn nhiều chiều',
  },
  {
    id: 'insider_view',
    label: 'Nhìn từ góc độ người trong cuộc',
    stanceHint: 'multi',
    angleHint: 'Góc nhìn người trong cuộc',
  },
  {
    id: 'community_view',
    label: 'Nhìn từ góc độ cộng đồng',
    stanceHint: 'multi',
    angleHint: 'Góc nhìn cộng đồng / dư luận',
  },
  {
    id: 'behavior_analysis',
    label: 'Phân tích cách ứng xử',
    stanceHint: 'multi',
    angleHint: 'Phân tích cách ứng xử',
  },
  {
    id: 'life_lesson',
    label: 'Rút ra bài học cuộc sống',
    stanceHint: 'multi',
    angleHint: 'Bài học cuộc sống từ clip',
  },
  {
    id: 'custom_stance',
    label: 'Nhập chính kiến riêng',
    stanceHint: 'custom',
    angleHint: 'Chính kiến riêng',
  },
];

const LIFE_QUICK_ANGLES: OpinionQuickAngle[] = [
  {
    id: 'tell_story',
    label: 'Kể chuyện đời thường',
    stanceHint: 'multi',
    angleHint: 'Kể tình huống đời thường, dân dã',
  },
  {
    id: 'personal_view',
    label: 'Nêu chính kiến cá nhân',
    stanceHint: 'custom',
    angleHint: 'Chính kiến cá nhân rõ ràng',
  },
  {
    id: 'multi_angle',
    label: 'Nhìn nhiều góc',
    stanceHint: 'multi',
    angleHint: 'Phân tích nhiều góc nhìn, không phán tuyệt đối',
  },
  {
    id: 'life_lesson',
    label: 'Rút ra bài học cuộc sống',
    stanceHint: 'multi',
    angleHint: 'Bài học cuộc sống chân thật',
  },
  {
    id: 'encourage',
    label: 'Truyền động lực nhẹ',
    stanceHint: 'agree',
    angleHint: 'Động viên, không giảng đạo',
  },
  {
    id: 'custom_stance',
    label: 'Nhập chính kiến riêng',
    stanceHint: 'custom',
    angleHint: 'Chính kiến riêng',
  },
];

const CLIP_STYLE_HINTS = [
  'Mấy hôm nay tôi thấy một đoạn video…',
  'Nói thật với các bạn, xem xong tôi có một suy nghĩ…',
  'Tôi không biết mọi người thấy sao, nhưng theo quan điểm của tôi…',
  'Điều tôi quan tâm ở đây không phải ai thắng ai thua…',
  'Ngẫm lại câu chuyện này, tôi nhận ra rằng…',
  'Đó là suy nghĩ của tôi, còn mọi người thấy thế nào?',
];

const CLIP_STRUCTURE = [
  'Hook tự nhiên',
  'Kể lại clip trong 2–4 câu',
  'Nêu vấn đề đáng bàn',
  'Quan điểm cá nhân',
  'Giải thích lý do',
  'Nhìn nhận thêm phía còn lại',
  'Bài học cuộc sống',
  'Câu hỏi thảo luận',
];

/** Văn phong dân dã cho nhóm đời sống / gia đình / số phận… */
export const LIFE_STORY_STYLE_HINTS = [
  'Nói thật, chuyện này khiến tôi phải nghĩ…',
  'Tôi nghĩ…',
  'Nhưng ngẫm lại…',
  'Có một điều…',
  'Thực ra…',
  'Còn mọi người thì sao?',
];

export const LIFE_STORY_STRUCTURE_HINTS = [
  'Mở câu chuyện (ẩn)',
  'Tình huống đời thường (ẩn)',
  'Điều đáng suy nghĩ (ẩn)',
  'Chính kiến cá nhân (ẩn)',
  'Nhìn thêm các phía (ẩn)',
  'Lời khuyên thực tế (ẩn)',
  'Thông điệp cuối (ẩn)',
  'Câu hỏi tương tác (ẩn)',
];

const lifeGroup = (
  id: OpinionTopicGroupId,
  label: string,
  description: string,
  subtopics: string[],
): OpinionTopicGroup => ({
  id,
  label,
  description,
  subtopics,
  quickAngles: LIFE_QUICK_ANGLES,
  styleHints: LIFE_STORY_STYLE_HINTS,
  structureHints: LIFE_STORY_STRUCTURE_HINTS,
  sourcePlaceholder:
    'Dán câu chuyện / tình huống bạn muốn kể (không bịa trải nghiệm nếu chưa có). Có thể để trống và chỉ chọn chủ đề con.',
  requiresSource: false,
});

export const OPINION_TOPIC_GROUPS: OpinionTopicGroup[] = [
  {
    id: 'clip_life_comment',
    label: 'Bình luận clip đời sống',
    description:
      'Người dùng nhập link Reel, video Facebook, TikTok, YouTube hoặc dán nội dung một tình huống đang được quan tâm. Hệ thống kể lại sự việc ngắn gọn, nêu quan điểm cá nhân và rút ra bài học theo văn phong nói chuyện tự nhiên.',
    subtopics: [
      'Chuyện đang gây tranh luận trên mạng',
      'Một hành động khiến tôi phải suy nghĩ',
      'Ai đúng, ai sai trong tình huống này?',
      'Cách ứng xử của người trong cuộc',
      'Hành động đẹp hay chỉ để gây chú ý?',
      'Khi lòng tốt bị đem ra so sánh',
      'Bài học về cách đối nhân xử thế',
      'Một câu nói gây nhiều ý kiến trái chiều',
      'Góc nhìn phía sau một video viral',
      'Điều đáng bàn không nằm ở thắng hay thua',
      'Người nổi tiếng và trách nhiệm phát ngôn',
      'Câu chuyện nhỏ nhưng bài học lớn',
    ],
    quickAngles: CLIP_QUICK_ANGLES,
    styleHints: CLIP_STYLE_HINTS,
    structureHints: CLIP_STRUCTURE,
    sourcePlaceholder:
      'Dán caption / transcript video. Nếu không lấy được nội dung từ link, bắt buộc dán thủ công.',
    requiresSource: true,
  },

  lifeGroup(
    'raise_children',
    'Dạy con và đồng hành cùng con',
    'Góc nhìn về nuôi dạy, kỳ vọng, thời gian và trách nhiệm của cha mẹ với con.',
    [
      'Không so sánh con với con nhà người ta',
      'Khi kỳ vọng của cha mẹ quá mức',
      'Dạy con trách nhiệm từ việc nhỏ',
      'Dành thời gian cho con quan trọng hơn quà',
      'Nói chuyện với con thay vì chỉ ra lệnh',
      'Khi con phạm lỗi — phạt hay dạy?',
      'Bảo vệ con hay để con tự trải nghiệm?',
      'Áp lực thành tích học đường lên trẻ',
      'Cha mẹ cũng cần xin lỗi con',
      'Đồng hành chứ không sống hộ cuộc đời con',
      'Khi con không chọn nghề cha mẹ muốn',
      'Yêu con bằng sự kiên nhẫn hàng ngày',
    ],
  ),

  lifeGroup(
    'parents_filial',
    'Cha mẹ và lòng hiếu thảo',
    'Báo hiếu, quan tâm cha mẹ già, và những điều dễ trì hoãn đến khi muộn.',
    [
      'Đừng chờ thành công mới báo hiếu',
      'Quan tâm cha mẹ già bằng việc nhỏ mỗi ngày',
      'Gọi điện về nhà — chuyện nhỏ nhưng ý nghĩa',
      'Khi cha mẹ không nói nhưng vẫn nhớ mình',
      'Báo hiếu không chỉ là tiền',
      'Nuôi cha mẹ già và áp lực cuộc sống',
      'Xin lỗi cha mẹ vì những lần nóng giận',
      'Cha mẹ cũng từng trẻ và từng sai',
      'Khi khoảng cách địa lý làm xa tình cảm',
      'Hiếu thảo trong thời buổi bận rộn',
      'Chăm sóc sức khỏe cha mẹ trước khi quá muộn',
      'Những lời chưa kịp nói với cha mẹ',
    ],
  ),

  lifeGroup(
    'sibling_bond',
    'Tình nghĩa anh em',
    'Tiền bạc, chia sẻ, xung đột và sự gắn kết giữa anh chị em.',
    [
      'Tiền bạc làm rạn nứt tình anh em',
      'Chia tài sản — giữ tình hay giữ phần?',
      'Giúp nhau khi khó khăn mới là anh em',
      'Anh chị em lớn lên rồi mỗi người một nẻo',
      'Ghen tị trong nhà và cách hóa giải',
      'Khi một người gánh nhiều hơn trong gia đình',
      'Anh em khác mẹ khác cha vẫn có thể thân',
      'Xung đột vì chăm sóc cha mẹ già',
      'Không cần giống nhau để vẫn thương nhau',
      'Nói thẳng với anh chị em trước khi giận lâu',
      'Tình anh em sau biến cố gia đình',
      'Nhường nhịn không có nghĩa là yếu',
    ],
  ),

  lifeGroup(
    'couple_family',
    'Vợ chồng và gia đình',
    'Hôn nhân, chia sẻ gánh nặng, tôn trọng và xây tổ ấm.',
    [
      'Vợ chồng cần nói chuyện trước khi giận quá lâu',
      'Chia sẻ việc nhà không phải chuyện nhỏ',
      'Tiền lương ai giữ — và lòng tin',
      'Khi hai bên nội ngoại can thiệp quá nhiều',
      'Yêu sau hôn nhân khó hơn yêu trước cưới',
      'Tôn trọng khác biệt tính cách của nhau',
      'Nuôi con cùng nhau chứ không đổ lỗi',
      'Khi một bên mệt mỏi vì gánh cả nhà',
      'Xin lỗi trong hôn nhân không làm mất mặt',
      'Giữ lửa bằng sự quan tâm nhỏ hàng ngày',
      'Ngoại tình bắt đầu từ khoảng trống nào?',
      'Gia đình hạnh phúc không cần hoàn hảo',
    ],
  ),

  lifeGroup(
    'overcome_adversity',
    'Vượt qua nghịch cảnh',
    'Mất mát, bắt đầu lại, và sức bền sau biến cố.',
    [
      'Mất tất cả và bắt đầu lại từ số không',
      'Không bỏ cuộc khi cuộc đời đẩy vào góc',
      'Sống tiếp sau biến cố lớn',
      'Khi thất bại công khai trên mạng',
      'Ốm đau và cách nhìn lại những gì còn lại',
      'Nợ nần và lòng tự trọng',
      'Bị phản bội rồi vẫn chọn đứng dậy',
      'Ngày tồi tệ nhất dạy tôi điều gì',
      'Sức mạnh đến từ việc xin giúp đỡ',
      'Không cần mạnh mẽ mọi lúc',
      'Bắt đầu chậm vẫn hơn không bắt đầu',
      'Nghịch cảnh không định nghĩa cả đời người',
    ],
  ),

  lifeGroup(
    'fate_choice',
    'Số phận và sự lựa chọn',
    'Sinh ra nghèo, bất hạnh, và quyền thay đổi cuộc đời bằng lựa chọn.',
    [
      'Số phận hay sự lựa chọn quyết định đời người?',
      'Sinh ra nghèo — có đổi được số không?',
      'Người tốt gặp bất hạnh thì sao?',
      'Thay đổi cuộc đời bắt đầu từ quyết định nhỏ',
      'Có những cánh cửa mình tự đóng',
      'Tin vào số hay tin vào nỗ lực?',
      'Khi cơ hội đến mà mình chưa sẵn sàng',
      'Lựa chọn sai cũng là một bài học',
      'Đừng đổ hết cho số phận khi mình chưa cố',
      'Người khác giàu hơn — mình vẫn có đường đi',
      'Số phận đưa tới, lựa chọn giữ lại',
      'Viết lại câu chuyện đời mình được không?',
    ],
  ),

  lifeGroup(
    'human_kindness',
    'Tình người trong cuộc sống',
    'Lòng tốt, sự giúp đỡ vô tư và những khoảnh khắc ấm áp đời thường.',
    [
      'Một cử chỉ nhỏ cứu cả ngày của ai đó',
      'Giúp người không cần khoe',
      'Khi người lạ tử tế với mình',
      'Lòng tốt bị lợi dụng thì sao?',
      'Tình người nơi công sở và ngoài đường',
      'Chia sẻ khi mình cũng đang khó',
      'Thấy khổ mà quay đi — mình nghĩ gì?',
      'Lòng tốt không cần hoàn hảo',
      'Những người thầm lặng nâng đỡ mình',
      'Lan tỏa tử tế bằng hành động nhỏ',
      'Khi xã hội lạnh đi vì thiếu tin tưởng',
      'Tình người còn lại trong thời buổi vội',
    ],
  ),

  lifeGroup(
    'gratitude',
    'Lòng biết ơn',
    'Biết ơn người đã giúp, biết ơn những gì đang có, và sống chậm lại để nhận ra.',
    [
      'Biết ơn những người đã giúp mình lúc khó',
      'Đừng quên người dìu mình đi những bước đầu',
      'Biết ơn chính bản thân vì đã không bỏ cuộc',
      'Những điều bình thường mình hay coi nhẹ',
      'Nói lời cảm ơn trước khi quá muộn',
      'Biết ơn không có nghĩa là nợ cả đời',
      'Khi thành công quên mất điểm xuất phát',
      'Gia đình — chỗ mình hay quên cảm ơn',
      'Biết ơn khách hàng / đồng nghiệp thầm lặng',
      'Sống chậm để nhận ra mình đang có gì',
      'Biết ơn cả những lần bị từ chối',
      'Lòng biết ơn nuôi dưỡng cách sống nhẹ hơn',
    ],
  ),

  lifeGroup(
    'forgive_let_go',
    'Tha thứ và buông bỏ',
    'Buông giận, tha thứ cho người và cho chính mình để đi tiếp.',
    [
      'Tha thứ không có nghĩa là đồng ý với sai lầm',
      'Buông bỏ để nhẹ người, không phải để thua',
      'Khi mình chưa sẵn sàng tha thứ',
      'Tha thứ cho chính mình sau sai lầm',
      'Giữ giận lâu hại ai hơn?',
      'Cắt bỏ mối quan hệ độc hại có phải ích kỷ?',
      'Xin lỗi thật lòng khó hơn biện minh',
      'Buông quá khứ để không mang vào tương lai',
      'Người làm tổn thương mình cũng từng tổn thương',
      'Tha thứ công khai hay trong lòng cũng được',
      'Không gặp lại vẫn có thể buông',
      'Đi tiếp sau đổ vỡ lòng tin',
    ],
  ),

  lifeGroup(
    'faith_hope',
    'Niềm tin và hy vọng',
    'Giữ hy vọng khi khó, tin vào bản thân và vào điều tốt còn lại.',
    [
      'Hy vọng khi mọi thứ đang tối',
      'Tin vào bản thân khi chẳng ai tin',
      'Niềm tin nhỏ nuôi hành động lớn',
      'Đừng để thất bại cướp hết hy vọng',
      'Hy vọng không phải ngồi chờ',
      'Khi mệt — chỉ cần tin vào ngày mai một chút',
      'Niềm tin vào người khác và rủi ro bị phụ lòng',
      'Hy vọng chân thật khác với ảo tưởng',
      'Tìm ánh sáng trong chuyện đời thường',
      'Giữ lửa khi kết quả chưa thấy',
      'Hy vọng giúp mình đối xử tốt hơn với người khác',
      'Tin rằng mình vẫn còn đường đi',
    ],
  ),

  lifeGroup(
    'money_feelings',
    'Tiền bạc và tình cảm',
    'Tiền trong tình bạn, tình yêu, gia đình — ranh giới và lòng tin.',
    [
      'Tiền có làm mất tình cảm không?',
      'Cho mượn tiền bạn bè — giữ tình hay mất bạn?',
      'Vợ chồng bàn chuyện tiền sao cho không tổn thương',
      'Khi tình cảm bị đo bằng quà và chi tiêu',
      'Nghèo có đáng xấu hổ không?',
      'Giàu mà cô đơn và nghèo mà ấm',
      'Tiền công sức và sự công nhận trong nhà',
      'Không vì tiền mà đánh mất lòng tự trọng',
      'Chia sẻ tài chính với người thân thế nào cho lành',
      'Tiền không mua được tôn trọng',
      'Khi áp lực kiếm tiền làm lạnh tình cảm',
      'Nói chuyện tiền sớm để tránh giận về sau',
    ],
  ),

  lifeGroup(
    'success_failure',
    'Thành công và thất bại',
    'Định nghĩa thành công, thất bại công khai, và cách đứng dậy.',
    [
      'Thành công không phải lúc nào cũng ồn ào',
      'Thất bại dạy nhiều hơn lời khen',
      'Đừng so thành công của mình với highlight người khác',
      'Khi thành công đến muộn',
      'Thất bại công khai và lòng tự trọng',
      'Thành công bằng sự tử tế được không?',
      'Bài học từ lần suýt bỏ cuộc',
      'Thành công của người khác không lấy mất phần mình',
      'Định nghĩa lại thành công theo giá trị của mình',
      'Sau thất bại — bắt đầu lại khác trước',
      'Thành công nhỏ mỗi ngày vẫn đáng kể',
      'Đừng để thành công làm mình quên gốc',
    ],
  ),

  lifeGroup(
    'old_age_loneliness',
    'Tuổi già và sự cô đơn',
    'Cha mẹ già, cô đơn tuổi già, và sự hiện diện của con cháu.',
    [
      'Tuổi già sợ nhất là sự quên lãng',
      'Cha mẹ già cần sự hiện diện hơn quà',
      'Cô đơn giữa thành phố đông người',
      'Khi con cháu bận quá và ông bà ngồi chờ',
      'Sống vui ở tuổi xế chiều được không?',
      'Chăm sóc sức khỏe tinh thần người già',
      'Nghe cha mẹ kể chuyện cũ — món quà nhỏ',
      'Nhà dưỡng lão và nỗi day dứt của con',
      'Kết nối thế hệ trước khi quá muộn',
      'Cô đơn không chỉ ở người già',
      'Tôn trọng quyền tự quyết của người lớn tuổi',
      'Một cuộc gọi ngắn làm ấm cả buổi chiều',
    ],
  ),

  lifeGroup(
    'friendship_loyalty',
    'Tình bạn và lòng trung thành',
    'Bạn thật, bạn lúc khó, và lòng trung thành bị thử thách.',
    [
      'Bạn lúc khó mới là bạn',
      'Lòng trung thành bị thử khi có lợi ích',
      'Mất bạn vì hiểu lầm nhỏ',
      'Bạn online và bạn đời thực',
      'Khi bạn thành công còn mình thì chậm',
      'Nói thẳng với bạn trước khi mất nhau',
      'Tình bạn sau nhiều năm im lặng',
      'Bạn lợi dụng và cách nhận ra sớm',
      'Trung thành không có nghĩa là bao che sai',
      'Giữ bạn bằng sự tôn trọng, không bằng nợ nần',
      'Bạn khác quan điểm vẫn có thể thân',
      'Một người bạn đủ để không thấy cô đơn',
    ],
  ),

  lifeGroup(
    'social_conduct',
    'Đối nhân xử thế',
    'Cách cư xử, giữ lễ, nói năng và sống tử tế với người quanh mình.',
    [
      'Nói lời phải giữ, làm việc phải đến nơi',
      'Tôn trọng người khác bắt đầu từ việc nhỏ',
      'Khi nóng giận — im một nhịp trước đã',
      'Đừng hạ người khác để mình nổi',
      'Biết đủ và biết dừng trong giao tiếp',
      'Xin lỗi và cảm ơn — phép lịch sự bị quên',
      'Ứng xử nơi công sở và ngoài đời',
      'Giữ uy tín bằng sự nhất quán',
      'Không cần thắng mọi cuộc tranh cãi',
      'Đối nhân xử thế với người không thích mình',
      'Lễ phép không phải yếu đuối',
      'Sống sao để người khác gặp mình không mệt',
    ],
  ),
];

export const OPINION_TOPIC_GROUP_LABELS: Record<OpinionTopicGroupId, string> =
  Object.fromEntries(OPINION_TOPIC_GROUPS.map((g) => [g.id, g.label])) as Record<
    OpinionTopicGroupId,
    string
  >;

export function getOpinionTopicGroup(id?: string | null): OpinionTopicGroup | null {
  if (!id) return null;
  return OPINION_TOPIC_GROUPS.find((g) => g.id === id) ?? null;
}

export function isOpinionTopicGroupId(id: string): id is OpinionTopicGroupId {
  return (OPINION_TOPIC_GROUP_IDS as readonly string[]).includes(id);
}

export function isClipLifeTheme(id?: string | null): boolean {
  return id === 'clip_life_comment';
}

export function isLifeStoryTheme(id?: string | null): boolean {
  if (!id) return false;
  const g = getOpinionTopicGroup(id);
  return Boolean(g && !g.requiresSource);
}

export function getOpinionQuickAngle(
  groupId: string | undefined,
  angleId: string | undefined,
): OpinionQuickAngle | null {
  const group = getOpinionTopicGroup(groupId);
  if (!group || !angleId) return null;
  return group.quickAngles.find((a) => a.id === angleId) ?? null;
}

/**
 * Random 5–8 chủ đề con không trùng trong nhóm.
 */
export function pickRandomOpinionSubtopics(
  groupId: string,
  options?: { count?: number; minCount?: number; maxCount?: number; exclude?: string[] },
): string[] {
  const group = getOpinionTopicGroup(groupId);
  if (!group) return [];
  const min = options?.minCount ?? 5;
  const max = options?.maxCount ?? 8;
  const exclude = new Set((options?.exclude ?? []).map((t) => t.trim()).filter(Boolean));
  const pool = group.subtopics.filter((t) => !exclude.has(t));
  const source = pool.length >= min ? pool : group.subtopics.slice();
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

/** Gợi ý 5–10 tiêu đề / góc nhìn từ chủ đề con (fallback local). */
export function suggestOpinionTitlesLocal(input: {
  subtopicLabel: string;
  topicGroupLabel?: string;
  count?: number;
}): string[] {
  const sub = input.subtopicLabel.trim() || 'Chuyện đời thường';
  const group = input.topicGroupLabel?.trim();
  const count = Math.min(10, Math.max(5, input.count ?? 8));
  const patterns = [
    `${sub} — góc nhìn tôi muốn giữ`,
    `Hôm nay tôi muốn nói về: ${sub}`,
    `${sub}: chuyện nhỏ, suy nghĩ lớn`,
    `Theo quan điểm của tôi về ${sub.toLowerCase()}`,
    `Ngẫm lại về ${sub.toLowerCase()}`,
    `${sub} — không phán tuyệt đối`,
    `Điều tôi nhận ra từ: ${sub}`,
    `${sub}: nhiều phía cần được lắng nghe`,
    `Chân thật về ${sub.toLowerCase()}`,
    `${sub} — bài học cuộc sống`,
    `Khi nghĩ về ${sub.toLowerCase()}`,
    `${sub}: tôi chọn nhìn vậy`,
  ];
  if (group) {
    patterns.push(`${group}: ${sub}`, `${sub} — trong mạch ${group}`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of patterns) {
    const key = t.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= count) break;
  }
  let i = 1;
  while (out.length < count) {
    const t = `${sub} — góc nhìn ${i + 1}`;
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
    i += 1;
  }
  return out;
}
