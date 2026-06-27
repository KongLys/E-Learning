/**
 * Bài kiểm tra cuối khóa LUÔN nằm ở dưới cùng khóa học.
 *
 * Chương chứa bài `isFinalQuiz` được tạo ở cuối, nhưng giảng viên vẫn có thể thêm
 * chương mới (nhận orderIndex lớn hơn) hoặc sắp xếp lại — khiến orderIndex của
 * chương quiz không còn lớn nhất. Vì vậy mọi nơi ĐỌC danh sách chương đều cưỡng
 * bức đưa các chương chứa bài kiểm tra cuối khóa xuống cuối, giữ nguyên thứ tự
 * tương đối (đã sắp theo orderIndex) của các chương còn lại.
 */
export function sortFinalQuizSectionsLast<
  T extends { lessons?: { isFinalQuiz?: boolean | null }[] },
>(sections: T[]): T[] {
  const isFinal = (s: T) => (s.lessons ?? []).some((l) => l.isFinalQuiz);
  return [...sections.filter((s) => !isFinal(s)), ...sections.filter(isFinal)];
}
