'use client';

import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { useProgress } from '@/lib/hooks/useProgress';

interface VideoPlayerProps {
  lessonId: string;
  videoUrl: string;
  initialPositionSec?: number;
  onTimeUpdate?: (sec: number) => void;
  onProgress?: (currentSec: number, durationSec: number) => void;
  onEnded?: () => void;
}

export function VideoPlayer({ lessonId, videoUrl, initialPositionSec = 0, onTimeUpdate, onProgress, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  useProgress(lessonId, () => videoRef.current?.currentTime ?? 0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (initialPositionSec > 0) video.currentTime = initialPositionSec;
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      video.addEventListener('loadedmetadata', () => {
        if (initialPositionSec > 0) video.currentTime = initialPositionSec;
      });
    } else {
      video.src = videoUrl;
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
      <video ref={videoRef} className="w-full aspect-video" />
      <div className="bg-gray-900 text-white px-4 py-3 space-y-2">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full accent-blue-500 h-1"
        />
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-lg">{isPlaying ? '⏸' : '▶'}</button>
            <span className="text-gray-300 text-xs">{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <div className="flex items-center gap-2">
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
