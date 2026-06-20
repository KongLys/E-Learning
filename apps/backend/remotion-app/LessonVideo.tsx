import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Roboto';
import type { LessonVideoProps, VideoSectionInput } from './types';

// Tải Roboto (Google Fonts) — Remotion tự chờ font sẵn sàng trước khi render.
const { fontFamily } = loadFont('normal', {
  weights: ['400', '500', '700', '800'],
  subsets: ['latin', 'vietnamese'],
});

const COLORS = {
  bg: '#0f172a',
  bgAccent: '#1e293b',
  text: '#f8fafc',
  sub: '#cbd5e1',
  brand: '#3b82f6',
  brandSoft: '#1d4ed8',
  track: '#334155',
};

type Positioned = VideoSectionInput & { start: number; index: number };

function withStarts(sections: VideoSectionInput[]): Positioned[] {
  let acc = 0;
  return sections.map((s, index) => {
    const start = acc;
    acc += Math.max(1, s.durationInFrames);
    return { ...s, start, index };
  });
}

/** Thanh timeline các section chạy theo tiến trình video — yêu cầu bắt buộc. */
const TimelineBar: React.FC<{ sections: Positioned[]; total: number }> = ({
  sections,
  total,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        right: 56,
        bottom: 130,
        display: 'flex',
        gap: 8,
      }}
    >
      {sections.map((s) => {
        const width = (Math.max(1, s.durationInFrames) / total) * 100;
        const active = frame >= s.start;
        const localProgress = interpolate(
          frame,
          [s.start, s.start + Math.max(1, s.durationInFrames)],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        return (
          <div key={s.index} style={{ flex: `${width} 0 0`, minWidth: 0 }}>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: COLORS.track,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${localProgress * 100}%`,
                  background: COLORS.brand,
                }}
              />
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 20,
                lineHeight: 1.2,
                color: active ? COLORS.text : COLORS.sub,
                fontWeight: active ? 700 : 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {s.index + 1}. {s.title}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SectionScene: React.FC<{
  section: Positioned;
  total: number;
  lessonTitle: string;
}> = ({ section, total, lessonTitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 18 });
  const y = interpolate(enter, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ padding: '64px 56px 220px' }}>
      <div
        style={{
          fontSize: 22,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: COLORS.brand,
          fontWeight: 700,
        }}
      >
        {lessonTitle || 'Bài học'}
      </div>
      <div
        style={{
          marginTop: 24,
          transform: `translateY(${y}px)`,
          opacity: enter,
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 800, color: COLORS.text, lineHeight: 1.1 }}>
          {section.title}
        </div>
        <ul style={{ marginTop: 36, paddingLeft: 0, listStyle: 'none' }}>
          {section.bullets.slice(0, 5).map((b, i) => (
            <li
              key={i}
              style={{
                fontSize: 34,
                lineHeight: 1.45,
                color: COLORS.sub,
                marginBottom: 16,
                display: 'flex',
                gap: 16,
              }}
            >
              <span style={{ color: COLORS.brand }}>•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </AbsoluteFill>
  );
};

export const LessonVideo: React.FC<LessonVideoProps> = ({
  lessonTitle,
  sections,
}) => {
  const positioned = withStarts(sections);
  const total = positioned.reduce(
    (n, s) => n + Math.max(1, s.durationInFrames),
    0,
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, fontFamily }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 600px at 80% -10%, ${COLORS.bgAccent}, ${COLORS.bg})`,
        }}
      />
      {positioned.map((s) => (
        <Sequence key={s.index} from={s.start} durationInFrames={Math.max(1, s.durationInFrames)}>
          <Audio src={s.audioSrc} />
          <SectionScene section={s} total={total} lessonTitle={lessonTitle} />
        </Sequence>
      ))}
      <TimelineBar sections={positioned} total={total} />
      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 56,
          fontSize: 20,
          color: COLORS.sub,
        }}
      >
        Video ngắn do AI tạo
      </div>
    </AbsoluteFill>
  );
};
