'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Pause, Play } from 'lucide-react';
import { useProgress } from '@/lib/hooks/useProgress';

export interface Cue {
  startSec: number;
  endSec: number;
  text: string;
}

export interface Chapter {
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
}

interface VideoPlayerProps {
  lessonId: string;
  videoUrl: string;
  initialPositionSec?: number;
  cues?: Cue[];
  chapters?: Chapter[];
  onTimeUpdate?: (sec: number) => void;
  onProgress?: (currentSec: number, durationSec: number) => void;
  onEnded?: () => void;
}

export function VideoPlayer({ lessonId, videoUrl, initialPositionSec = 0, cues = [], chapters = [], onTimeUpdate, onProgress, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(true);

  const activeCue = captionsOn
    ? cues.find((c) => currentTime >= c.startSec && currentTime < c.endSec)
    : undefined;

  useProgress(lessonId, () => videoRef.current?.currentTime ?? 0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    let hls: Hls | null = null;

    const isHls = videoUrl.includes('.m3u8');

    if (isHls && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialPositionSec > 0) video.currentTime = initialPositionSec;
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      video.addEventListener('loadedmetadata', () => {
        if (initialPositionSec > 0) video.currentTime = initialPositionSec;
      }, { once: true });
    } else {
      // Plain MP4/WebM — native video avoids CORS issues with presigned URLs
      video.src = videoUrl;
      if (initialPositionSec > 0) {
        video.addEventListener('loadedmetadata', () => {
          video.currentTime = initialPositionSec;
        }, { once: true });
      }
    }

    return () => { hls?.destroy(); };
  }, [videoUrl, initialPositionSec]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpd = () => {
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime);
      onProgress?.(video.currentTime, video.duration || 0);
    };
    const onDuration = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => onEnded?.();

    video.addEventListener('timeupdate', onTimeUpd);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnd);

    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        isPlaying ? video.pause() : video.play();
      }
      if (e.code === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 10);
      if (e.code === 'ArrowRight') video.currentTime = Math.min(video.duration, video.currentTime + 10);
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpd);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnd);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isPlaying, onTimeUpdate, onProgress, onEnded]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    isPlaying ? video.pause() : video.play();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Number(e.target.value);
  };

  const changeRate = (rate: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  return (
    <div className="bg-black rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/5">
      <div className="relative">
        <video ref={videoRef} className="w-full aspect-video" />
        {/* Phụ đề overlay chạy theo thời gian */}
        {activeCue && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <span className="max-w-3xl rounded bg-black/70 px-3 py-1.5 text-center text-sm leading-snug text-white sm:text-base">
              {activeCue.text}
            </span>
          </div>
        )}
      </div>
      <div className="bg-gray-900 text-white px-4 py-3 space-y-2">
        {/* Thanh tiến trình + mốc chương */}
        <div className="relative">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full accent-blue-500 h-1"
          />
          {duration > 0 && chapters.map((c, i) => (
            <span
              key={i}
              title={c.title}
              className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded bg-amber-400"
              style={{ left: `${Math.min(100, (c.startSec / duration) * 100)}%` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
            <span className="text-gray-300 text-xs">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div className="flex items-center gap-2">
            {cues.length > 0 && (
              <button
                onClick={() => setCaptionsOn((v) => !v)}
                title="Bật/tắt phụ đề"
                className={`text-xs px-1.5 py-0.5 rounded font-semibold ${captionsOn ? 'bg-blue-500' : 'bg-gray-700'}`}
              >
                CC
              </button>
            )}
            {[0.75, 1, 1.25, 1.5, 2].map((r) => (
              <button
                key={r}
                onClick={() => changeRate(r)}
                className={`text-xs px-1.5 py-0.5 rounded ${playbackRate === r ? 'bg-blue-500' : 'bg-gray-700'}`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
