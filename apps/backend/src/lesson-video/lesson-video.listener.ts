import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LessonVideoService } from './lesson-video.service';

/** Khi khóa được duyệt xuất bản → tự sinh video ngắn cho mọi bài đọc. */
@Injectable()
export class LessonVideoListener {
  private readonly logger = new Logger(LessonVideoListener.name);

  constructor(private lessonVideo: LessonVideoService) {}

  @OnEvent('course.published')
  async onCoursePublished(payload: { courseId: string }) {
    this.logger.log(`course.published → tạo video cho khóa ${payload.courseId}`);
    await this.lessonVideo
      .enqueueForCourse(payload.courseId)
      .catch((err) =>
        this.logger.error(`enqueue video cho khóa lỗi: ${(err as Error).message}`),
      );
  }
}
