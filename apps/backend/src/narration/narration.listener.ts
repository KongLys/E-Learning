import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NarrationService } from './narration.service';

/** Khi khóa được duyệt xuất bản → tự sinh giọng đọc cho mọi bài đọc. */
@Injectable()
export class NarrationListener {
  private readonly logger = new Logger(NarrationListener.name);

  constructor(private narration: NarrationService) {}

  @OnEvent('course.published')
  async onCoursePublished(payload: { courseId: string }) {
    this.logger.log(`course.published → tạo giọng đọc cho khóa ${payload.courseId}`);
    await this.narration
      .enqueueForCourse(payload.courseId)
      .catch((err) =>
        this.logger.error(`enqueue narration cho khóa lỗi: ${(err as Error).message}`),
      );
  }
}
