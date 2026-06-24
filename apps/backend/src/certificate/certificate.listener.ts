import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CertificateService } from './certificate.service';

/**
 * Khi học viên hoàn thành 100% khóa học (`course.completed`) → cấp chứng chỉ.
 * Lỗi được nuốt để không phá luồng tính tiến độ.
 */
@Injectable()
export class CertificateListener {
  private readonly logger = new Logger(CertificateListener.name);

  constructor(private certificates: CertificateService) {}

  @OnEvent('course.completed')
  async onCourseCompleted(event: { studentId: string; courseId: string }) {
    try {
      await this.certificates.issueForCompletion(
        event.studentId,
        event.courseId,
      );
    } catch (err) {
      this.logger.warn(
        `Không thể cấp chứng chỉ cho học viên ${event.studentId} (khóa ${event.courseId}): ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
