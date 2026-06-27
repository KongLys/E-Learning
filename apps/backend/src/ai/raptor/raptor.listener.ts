import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RaptorService } from './raptor.service';

/**
 * Khi khóa được duyệt xuất bản → đảm bảo cây RAPTOR sẵn sàng. `ensureReady` tự dựng
 * khi chưa có cây (xuất bản lần đầu) hoặc khi nội dung khóa đổi (sourceHash theo
 * course_chunks thay đổi); nếu không đổi thì bỏ qua, tránh dựng lại thừa.
 */
@Injectable()
export class RaptorListener {
  private readonly logger = new Logger(RaptorListener.name);

  constructor(private raptor: RaptorService) {}

  @OnEvent('course.published')
  async onCoursePublished(payload: { courseId: string }) {
    this.logger.log(
      `course.published → đảm bảo cây RAPTOR cho khóa ${payload.courseId}`,
    );
    await this.raptor
      .ensureReady(payload.courseId)
      .catch((err) =>
        this.logger.error(
          `ensureReady RAPTOR cho khóa lỗi: ${(err as Error).message}`,
        ),
      );
  }
}
