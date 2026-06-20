import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

export interface VideoSectionInput {
  title: string;
  bullets: string[];
  narrationText: string;
  audioSrc: string;
  durationInFrames: number;
}

export interface LessonVideoProps {
  lessonTitle: string;
  sections: VideoSectionInput[];
  fps: number;
}

export interface RenderResult {
  filePath: string;
  cleanup: () => void;
}

/**
 * Render video bài học bằng Remotion (headless Chromium). Bundle composition
 * `LessonVideo` (thư mục apps/backend/remotion) một lần rồi tái dùng cho các job.
 */
@Injectable()
export class RemotionRenderService {
  private readonly logger = new Logger(RemotionRenderService.name);
  private bundlePromise: Promise<string> | null = null;

  /** Entry Remotion nằm ngoài src để Nest không biên dịch JSX.
   *  Thư mục tên 'remotion-app' (không phải 'remotion') để không che gói npm 'remotion'. */
  private get entryPoint(): string {
    return path.join(process.cwd(), 'remotion-app', 'index.ts');
  }

  private getBundle(): Promise<string> {
    if (!this.bundlePromise) {
      // import động: @remotion/bundler là dev-time, tránh nạp khi không dùng.
      this.bundlePromise = (async () => {
        const { bundle } = await import('@remotion/bundler');
        this.logger.log('Bundling Remotion composition…');
        return bundle({ entryPoint: this.entryPoint });
      })();
    }
    return this.bundlePromise;
  }

  async render(props: LessonVideoProps): Promise<RenderResult> {
    const { selectComposition, renderMedia, ensureBrowser } = await import(
      '@remotion/renderer'
    );
    await ensureBrowser();
    const serveUrl = await this.getBundle();

    const composition = await selectComposition({
      serveUrl,
      id: 'LessonVideo',
      inputProps: props as unknown as Record<string, unknown>,
    });

    const filePath = path.join(os.tmpdir(), `lesson-video-${randomUUID()}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: filePath,
      inputProps: props as unknown as Record<string, unknown>,
    });
    this.logger.log(`Rendered video → ${filePath}`);
    return {
      filePath,
      cleanup: () => fs.rmSync(filePath, { force: true }),
    };
  }
}
