'use client';

import { useCallback, useRef, useState } from 'react';
import type { SpotifyTrack } from '@/types/spotify';

export type RecognizeState = 'idle' | 'listening' | 'identifying' | 'result' | 'nomatch' | 'error';

interface RecognizeResult {
  title: string;
  artist: string;
  track?: SpotifyTrack;
}

const RECORD_MS = 7000;

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  // iOS yields audio/mp4; desktop prefers webm/opus.
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function useRecognize() {
  const [state, setState] = useState<RecognizeState>('idle');
  const [result, setResult] = useState<RecognizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const listen = useCallback(async () => {
    setError(null);
    setResult(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone access is needed to identify songs.');
      setState('error');
      return;
    }
    streamRef.current = stream;

    const mime = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = rec;
    const chunks: BlobPart[] = [];

    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    rec.onstop = async () => {
      stopStream();
      setState('identifying');
      const blob = new Blob(chunks, { type: mime || 'audio/webm' });
      const form = new FormData();
      form.append('file', blob, 'clip');
      try {
        const res = await fetch('/api/recognize', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) {
          setError(res.status === 503 ? 'Recognition is not configured yet.' : 'Recognition failed.');
          setState('error');
          return;
        }
        if (!data.matched) {
          setState('nomatch');
          return;
        }
        setResult({ title: data.title, artist: data.artist, track: data.track });
        setState('result');
      } catch {
        setError('Network error. Please try again.');
        setState('error');
      }
    };

    setState('listening');
    rec.start();
    timerRef.current = setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop();
    }, RECORD_MS);
  }, [stopStream]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    stopStream();
    setState('idle');
    setResult(null);
    setError(null);
  }, [stopStream]);

  return { state, result, error, listen, reset };
}
