"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRecorder, type UseRecorderOptions, type WavChunk } from "./use-recorder"

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

export type ChunkStatus = "uploading" | "transcribed" | "silent" | "error";

export interface ChunkEntry {
  chunkId: string;
  chunkIndex: number;
  status: ChunkStatus;
  text: string;
  rms?: number;
  retries: number;
}

function assembleTranscript(map: Map<number, ChunkEntry>): string {
  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, e]) => e.text.trim())
    .filter(Boolean)
    .join(" ");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function useTranscription(serverUrl: string, options: UseRecorderOptions = {}) {
  const recorder = useRecorder(options);
  const [transcriptMap, setTranscriptMap] = useState<Map<number, ChunkEntry>>(new Map());

  const processedIds = useRef<Set<string>>(new Set());
  const nextIndexRef = useRef(0);
  const sessionRef = useRef(0);
  const latestTextRef = useRef("");

  const uploadChunk = useCallback(
    async (chunk: WavChunk, chunkIndex: number, session: number) => {
      setTranscriptMap((prev) => {
        const next = new Map(prev);
        next.set(chunkIndex, {
          chunkId: chunk.id,
          chunkIndex,
          status: "uploading",
          text: "",
          retries: 0,
        });
        return next;
      });

      let lastErr: unknown;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (session !== sessionRef.current) return;
        if (attempt > 0) await sleep(RETRY_BASE_DELAY_MS * attempt);

        try {
          const form = new FormData();
          form.append("audio", chunk.blob, "audio.wav");
          form.append("chunkIndex", String(chunkIndex));
          form.append("previousText", latestTextRef.current);

          const res = await fetch(`${serverUrl}/transcribe`, {
            method: "POST",
            body: form,
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);

          const data = (await res.json()) as {
            chunkIndex: number;
            text: string;
            isSilent: boolean;
            rms: number;
          };

          if (session !== sessionRef.current) return;

          setTranscriptMap((prev) => {
            const next = new Map(prev);
            next.set(chunkIndex, {
              chunkId: chunk.id,
              chunkIndex,
              status: data.isSilent ? "silent" : "transcribed",
              text: data.text,
              rms: data.rms,
              retries: attempt,
            });
            return next;
          });
          return;
        } catch (err) {
          lastErr = err;
        }
      }

      console.error("Chunk upload failed after retries:", lastErr);
      if (session !== sessionRef.current) return;

      setTranscriptMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(chunkIndex);
        next.set(chunkIndex, {
          ...(existing ?? { chunkId: chunk.id, chunkIndex, text: "", rms: undefined }),
          status: "error",
          retries: MAX_RETRIES,
        });
        return next;
      });
    },
    [serverUrl],
  );

  useEffect(() => {
    for (const chunk of recorder.chunks) {
      if (processedIds.current.has(chunk.id)) continue;
      processedIds.current.add(chunk.id);
      const index = nextIndexRef.current++;
      void uploadChunk(chunk, index, sessionRef.current);
    }
  }, [recorder.chunks, uploadChunk]);

  useEffect(() => {
    latestTextRef.current = assembleTranscript(transcriptMap);
  }, [transcriptMap]);

  const clearAll = useCallback(() => {
    sessionRef.current++;
    processedIds.current.clear();
    nextIndexRef.current = 0;
    latestTextRef.current = "";
    setTranscriptMap(new Map());
    recorder.clearChunks();
  }, [recorder]);

  const fullTranscript = assembleTranscript(transcriptMap);
  const chunkEntries = [...transcriptMap.values()].sort(
    (a, b) => a.chunkIndex - b.chunkIndex,
  );

  const pendingCount = chunkEntries.filter((e) => e.status === "uploading").length;
  const isProcessing = pendingCount > 0;

  return {
    ...recorder,
    fullTranscript,
    chunkEntries,
    pendingCount,
    isProcessing,
    clearAll,
  };
}
