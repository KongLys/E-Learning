import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FinalQuizService } from './final-quiz.service';

/** Khi khóa được duyệt xuất bản → tự sinh quiz cuối khóa (nếu giảng viên chưa soạn). */
@Injectable()
export class FinalQuizListener {
  private readonly logger = new Logger(FinalQuizListener.name);

  constructor(private finalQuiz: FinalQuizService) {}

  @OnEvent('course.published')
  async onCoursePublished(payload: { courseId: string }) {
    this.logger.log(
      `course.published → kiểm tra/sinh quiz cuối khóa ${payload.courseId}`,
    );
    await this.finalQuiz
      .enqueueForCourse(payload.courseId)
      .catch((err) =>
        this.logger.error(
          `enqueue quiz cuối khóa lỗi: ${(err as Error).message}`,
        ),
      );
  }
}
