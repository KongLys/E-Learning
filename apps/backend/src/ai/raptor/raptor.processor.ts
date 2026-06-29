import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job, UnrecoverableError } from 'bullmq';
import { RaptorService } from './raptor.service';
import { RAPTOR_BUILD_QUEUE, BuildRaptorJob } from './raptor.queue';

/** Lỗi quota/hết token của LLM → cần chờ lâu trước khi thử lại (phút). */
function isQuotaError(err?: Error): boolean {
  const m = (err?.message ?? '').toLowerCase();
  return (
    m.includes('429') ||
    m.includes('resource_exhausted') ||
    m.includes('quota') ||
    m.includes('too many requests') ||
    m.includes('rate limit')
  );
}

/** Lỗi vĩnh viễn (retry vô ích) → khóa chưa có nội dung / không tồn tại. */
function isPermanentError(err?: Error): boolean {
  const m = err?.message ?? '';
  return (
    m.includes('không có chunk') ||
    m.includes('chưa có nội dung') ||
    m.includes('not found')
  );
}

const QUOTA_BACKOFF_MAX_MS = 5 * 60_000; // trần 5 phút cho lỗi quota
const TRANSIENT_BASE_MS = 8_000; // backoff mũ cho lỗi tạm thời

@Processor(RAPTOR_BUILD_QUEUE, {
  concurrency: 1,
  settings: {
    // Backoff 'custom': phân nhánh theo loại lỗi. Quota → chờ lâu dần (tới 5 phút);
    // còn lại (mạng/timeout) → mũ 8s, 16s, 32s…
    backoffStrategy: (attemptsMade: number, _type: string, err?: Error) => {
      if (isQuotaError(err)) {
        return Math.min(QUOTA_BACKOFF_MAX_MS, 60_000 * attemptsMade);
      }
      return TRANSIENT_BASE_MS * Math.pow(2, Math.max(0, attemptsMade - 1));
    },
  },
})
export class RaptorProcessor extends WorkerHost {
  private readonly logger = new Logger(RaptorProcessor.name);

  constructor(
    private raptor: RaptorService,
    private events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<BuildRaptorJob>): Promise<void> {
    const { courseId } = job.data;
    this.logger.log(
      `Building RAPTOR tree for course ${courseId} (attempt ${job.attemptsMade + 1})`,
    );
    try {
      await this.raptor.generate(courseId, (p) => job.updateProgress(p));
    } catch (err) {
      const e = err as Error;
      this.logger.error(`RAPTOR build failed for course ${courseId}: ${e.message}`);
      // Lỗi vĩnh viễn → không retry, fail ngay (markFailed + báo ở onFailed).
      if (isPermanentError(e)) throw new UnrecoverableError(e.message);
      // Lỗi tạm thời/quota → ném lại để BullMQ retry theo backoff 'custom'.
      throw e;
    }
  }

  /**
   * Chỉ đánh dấu 'failed' + cảnh báo ở lần thất bại CUỐI (terminal) — tránh nhảy
   * trạng thái 'failed' giữa các lần retry (UI hiểu nhầm là hỏng).
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<BuildRaptorJob>, err: Error): Promise<void> {
    const { courseId } = job.data;
    const attempts = job.opts.attempts ?? 1;
    const terminal =
      err?.name === 'UnrecoverableError' || job.attemptsMade >= attempts;
    if (!terminal) {
      this.logger.warn(
        `RAPTOR course ${courseId} thất bại lần ${job.attemptsMade}/${attempts} — sẽ thử lại`,
      );
      return;
    }
    this.logger.error(
      `RAPTOR course ${courseId} thất bại hẳn sau ${job.attemptsMade} lần: ${err?.message}`,
    );
    await this.raptor.markFailed(courseId, err?.message ?? 'unknown error');
    this.events.emit('raptor.build.failed', {
      courseId,
      message: err?.message ?? 'unknown error',
    });
  }
}
