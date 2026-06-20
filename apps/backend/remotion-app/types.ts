export interface VideoSectionInput {
  title: string;
  bullets: string[];
  /** Toàn văn lời dẫn của section (dùng làm caption dưới màn hình). */
  narrationText: string;
  /** URL audio (R2 public) section này — headless Chromium tải khi render. */
  audioSrc: string;
  durationInFrames: number;
}

export interface LessonVideoProps {
  lessonTitle: string;
  sections: VideoSectionInput[];
  fps: number;
}
