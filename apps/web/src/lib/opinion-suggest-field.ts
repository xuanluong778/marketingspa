/**
 * Fallback local khi API gợi ý opinion field lỗi / offline.
 */
export function suggestOpinionFieldLocal(input: {
  field: 'summary' | 'debateIssue';
  themeLabel?: string;
  subtopic?: string;
  sourceText?: string;
  currentSummary?: string;
}): { options: string[]; source: 'template' } {
  const sub = (input.subtopic || '').trim() || 'một tình huống đời thường';
  const theme = (input.themeLabel || '').trim();
  const src = (input.sourceText || '').trim().slice(0, 120);

  if (input.field === 'summary') {
    return {
      source: 'template',
      options: [
        `Có một chuyện đang được nhiều người quan tâm xoay quanh “${sub}”.`,
        `Tình huống ngắn gọn: xung quanh chủ đề “${sub}”, mỗi bên nhìn một kiểu khác nhau.`,
        theme
          ? `Trong mạch ${theme.toLowerCase()}, câu chuyện về “${sub}” đang khiến nhiều người phải nghĩ lại.`
          : `Câu chuyện về “${sub}” đang được bàn khá nhiều — phần dữ kiện còn cần nhìn bình tĩnh.`,
        src
          ? `Theo nội dung đang chia sẻ: ${src}${src.length >= 120 ? '…' : ''} — điểm đáng chú ý là cách mọi người phản ứng.`
          : `Một tình huống liên quan “${sub}” được kể lại ngắn — phần còn lại là cách nhìn của từng người.`,
        `Sự việc xoay quanh “${sub}”: không phải drama thắng-thua, mà là cách ứng xử trong đời thường.`,
      ],
    };
  }

  const summary = (input.currentSummary || '').trim();
  return {
    source: 'template',
    options: [
      `Mọi người đang bất đồng về cách xử lý trong “${sub}” — nên cứng hay nên mềm?`,
      `Tranh luận nằm ở chỗ: quyền lợi cá nhân hay trách nhiệm với người xung quanh trong “${sub}”.`,
      `Có người bênh hành động, có người phản đối — điểm nóng là tiêu chuẩn đúng/sai đang dùng cho “${sub}”.`,
      summary
        ? `Từ tóm tắt đang có, dư luận phân hóa: nhìn theo cảm xúc hay theo dữ kiện trước?`
        : `Công chúng đang bất đồng: phán nhanh theo cảm xúc hay dừng lại để hiểu bối cảnh của “${sub}”?`,
      `Điều đáng bàn không phải “ai thắng”, mà là bài học ứng xử rút ra từ “${sub}”.`,
    ],
  };
}
