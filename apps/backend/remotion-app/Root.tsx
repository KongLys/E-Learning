import React from 'react';
import { Composition } from 'remotion';
import { LessonVideo } from './LessonVideo';
import type { LessonVideoProps } from './types';

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LessonVideo"
      component={LessonVideo}
      durationInFrames={FPS}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={
        { lessonTitle: '', sections: [], fps: FPS } as LessonVideoProps
      }
      // Thời lượng = tổng các section; tính từ inputProps khi selectComposition.
      calculateMetadata={({ props }) => {
        const fps = props.fps || FPS;
        const total = props.sections.reduce(
          (n, s) => n + Math.max(1, s.durationInFrames),
          0,
        );
        return { durationInFrames: Math.max(fps, total), fps };
      }}
    />
  );
};
