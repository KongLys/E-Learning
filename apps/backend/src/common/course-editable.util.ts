import { UnprocessableEntityException } from '@nestjs/common';

export const EDITABLE_STATUSES = ['draft', 'rejected'] as const;

/**
 * Throw if the course is not in a state that allows content edits.
 * Applies to ALL structural mutations: sections, lessons, video/document/quiz assets.
 */
export function assertCourseEditable(status: string): void {
  if (!(EDITABLE_STATUSES as readonly string[]).includes(status)) {
    throw new UnprocessableEntityException(
      'Khóa học đã xuất bản — vui lòng hủy xuất bản trước khi chỉnh sửa nội dung',
    );
  }
}
