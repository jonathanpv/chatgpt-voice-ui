"use client";

import { useEffect, useRef } from "react";
import type { AudioMetrics } from "@/app/components/OrbVisualization";

type AudioSourceMode = "mic" | "output" | "idle";

type OrbAudioOptions = {
  isActive: boolean;
  sourceMode: AudioSourceMode;
  audioElement: HTMLAudioElement | null;
  outputStream?: MediaStream | null;
  enableMic: boolean;
};

const ZERO_METRICS: AudioMetrics = {
  avgMag: [0, 0, 0, 0],
  cumulativeAudio: [0, 0, 0, 0],
  micLevel: 0,
};

type OutputNodeCacheEntry = {
  context: AudioContext;
  source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  gain: GainNode;
  data: Uint8Array;
};

const outputNodeCache = new WeakMap<HTMLMediaElement, OutputNodeCacheEntry>();

export function useOrbAudioMetrics({
  isActive,
  sourceMode,
  audioElement,
  outputStream,
  enableMic,
}: OrbAudioOptions) {
  const metricsRef = useRef<AudioMetrics>({ ...ZERO_METRICS });
  const audioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array | null>(null);
  const outputDataRef = useRef<Uint8Array | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const outputSourceRef = useRef<
    MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null
  >(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(performance.now());
  const lastOutputStreamIdRef = useRef<string | null>(null);

  const stopMic = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    micAnalyserRef.current = null;
    micDataRef.current = null;
  };

  const stopAnimation = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  };

  const resetOutput = () => {
    outputSourceRef.current?.disconnect();
    outputAnalyserRef.current?.disconnect();
    outputGainRef.current?.disconnect();
    outputSourceRef.current = null;
    outputAnalyserRef.current = null;
    outputGainRef.current = null;
    outputDataRef.current = null;
  };

  useEffect(() => {
    const ensureContext = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext ||
          (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    };

    const setupMic = async () => {
      if (!enableMic || micAnalyserRef.current) return;
      try {
        const context = ensureContext();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        micAnalyserRef.current = analyser;
        micDataRef.current = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        micAnalyserRef.current = null;
        micDataRef.current = null;
      }
    };

    const setupOutput = () => {
      if (!audioElement || outputAnalyserRef.current) return;

      if (outputStream && outputStream.getAudioTracks().length === 0) {
        return;
      }

      if (!outputStream) {
      const cached = outputNodeCache.get(audioElement);
      if (cached) {
        audioContextRef.current = cached.context;
        outputSourceRef.current = cached.source;
        outputAnalyserRef.current = cached.analyser;
        outputGainRef.current = cached.gain;
        outputDataRef.current = cached.data;
        if (cached.context.state === "suspended") {
          cached.context.resume().catch(() => {});
        }
        return;
      }
      }

      const context = ensureContext();
      let source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode;
      const streamSource =
        outputStream ??
        (audioElement.srcObject instanceof MediaStream
          ? audioElement.srcObject
          : typeof (audioElement as any).captureStream === "function"
            ? (audioElement as any).captureStream()
            : typeof (audioElement as HTMLMediaElement & {
                mozCaptureStream?: () => MediaStream;
              }).mozCaptureStream === "function"
              ? (
                  audioElement as HTMLMediaElement & {
                    mozCaptureStream: () => MediaStream;
                  }
                ).mozCaptureStream()
              : null);

      if (streamSource && streamSource.getAudioTracks().length > 0) {
        try {
          source = context.createMediaStreamSource(streamSource);
        } catch {
          source = context.createMediaElementSource(audioElement);
        }
      } else {
        source = context.createMediaElementSource(audioElement);
      }
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyser.connect(gain);
      if (source instanceof MediaStreamAudioSourceNode) {
        // Keep the graph active without doubling audible output.
        gain.gain.value = 0;
      }
      gain.connect(context.destination);
      const data = new Uint8Array(analyser.frequencyBinCount);
      if (!outputStream) {
        outputNodeCache.set(audioElement, {
          context,
          source,
          analyser,
          gain,
          data,
        });
      }
      outputSourceRef.current = source;
      outputAnalyserRef.current = analyser;
      outputGainRef.current = gain;
      outputDataRef.current = data;
    };

    if (isActive) {
      const nextStreamId = outputStream?.id ?? null;
      if (nextStreamId !== lastOutputStreamIdRef.current) {
        lastOutputStreamIdRef.current = nextStreamId;
        if (
          outputStream ||
          outputSourceRef.current instanceof MediaStreamAudioSourceNode
        ) {
          resetOutput();
        }
      }
      setupOutput();
      setupMic();
    } else {
      if (
        outputStream ||
        outputSourceRef.current instanceof MediaStreamAudioSourceNode
      ) {
        resetOutput();
      }
      stopMic();
      stopAnimation();
    }
  }, [audioElement, enableMic, isActive, outputStream]);

  useEffect(() => {
    if (!isActive) {
      metricsRef.current = { ...ZERO_METRICS };
      stopMic();
      stopAnimation();
      return;
    }

    const computeBands = (
      analyser: AnalyserNode | null,
      dataArray: Uint8Array | null
    ) => {
      if (!analyser || !dataArray) return [0, 0, 0, 0] as const;
      analyser.getByteFrequencyData(dataArray as any);
      const bands = 4;
      const loPass = 0;
      const hiPass = Math.min(400, dataArray.length);
      const samplesPerBand = Math.max(1, Math.floor((hiPass - loPass) / bands));
      const avgMag = [];
      for (let i = 0; i < bands; i++) {
        let sum = 0;
        const startIdx = loPass + i * samplesPerBand;
        const endIdx = Math.min(startIdx + samplesPerBand, dataArray.length);
        for (let j = startIdx; j < endIdx; j++) {
          sum += dataArray[j];
        }
        const avg = sum / Math.max(1, endIdx - startIdx);
        avgMag.push(avg / 255);
      }
      return avgMag as [number, number, number, number];
    };

    const SIGNAL_THRESHOLD = 0.02;

    const animate = () => {
      const now = performance.now();
      const deltaTime = Math.max(0.001, (now - lastUpdateRef.current) / 1000);
      lastUpdateRef.current = now;

      const micBands = computeBands(micAnalyserRef.current, micDataRef.current);
      const outputBands = computeBands(
        outputAnalyserRef.current,
        outputDataRef.current
      );

      const micLevel =
        micBands.reduce((sum, value) => sum + value, 0) / 4;
      const outputLevel =
        outputBands.reduce((sum, value) => sum + value, 0) / 4;

      let targetBands = micBands;
      if (sourceMode === "output") {
        targetBands = outputBands;
      } else if (sourceMode === "mic") {
        targetBands = micBands;
      } else if (outputLevel > micLevel && outputLevel > SIGNAL_THRESHOLD) {
        targetBands = outputBands;
      } else if (micLevel > SIGNAL_THRESHOLD) {
        targetBands = micBands;
      } else {
        targetBands = [0, 0, 0, 0];
      }

      const TIME_CONSTANT = 2.0;
      const GAIN_MULTIPLIER = 40;
      const smoothingFactor = 1 - Math.exp(-deltaTime / TIME_CONSTANT);

      const cumulative = metricsRef.current.cumulativeAudio;
      const nextCumulative: [number, number, number, number] = [
        cumulative[0],
        cumulative[1],
        cumulative[2],
        cumulative[3],
      ];
      for (let i = 0; i < 4; i++) {
        const increment = targetBands[i] * deltaTime * 60 * GAIN_MULTIPLIER;
        nextCumulative[i] =
          nextCumulative[i] * (1 - smoothingFactor) +
          (nextCumulative[i] + increment) * smoothingFactor;
      }

      const targetLevel =
        targetBands.reduce((sum, value) => sum + value, 0) / 4;

      metricsRef.current = {
        avgMag: [...targetBands] as [number, number, number, number],
        cumulativeAudio: nextCumulative,
        micLevel: targetLevel,
      };

      frameRef.current = requestAnimationFrame(animate);
    };

    lastUpdateRef.current = performance.now();
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      stopAnimation();
    };
  }, [isActive, sourceMode]);

  useEffect(() => {
    return () => {
      stopMic();
      stopAnimation();
    };
  }, []);

  return metricsRef;
}
