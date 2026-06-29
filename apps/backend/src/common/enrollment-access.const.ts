import { EnrollStatus } from '@prisma/client';

/**
 * Các trạng thái ghi danh vẫn cho học viên truy cập nội dung khóa học.
 * 'completed' giữ nguyên quyền (ôn lại bài, làm lại quiz, lấy chứng chỉ);
 * chỉ 'cancelled' (hủy/hoàn tiền) mới mất quyền.
 */
export const COURSE_ACCESS_STATUSES: EnrollStatus[] = ['active', 'completed'];
