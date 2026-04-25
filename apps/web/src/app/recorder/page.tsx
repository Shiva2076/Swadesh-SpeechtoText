"use client"

import { useCallback, useEffect, useRef } from "react"
import { CheckCircle, Mic, Pause, Play, Square, Trash2, VolumeX } from "lucide-react"

import { Button } from "@my-better-t-app/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card"
import { LiveWaveform } from "@/components/ui/live-waveform"
import { type ChunkEntry, useTranscription } from "@/hooks/use-transcription"

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`
}

function ChunkPip({ entry }: { entry: ChunkEntry }) {
  const colors: Record<ChunkEntry["status"], string> = {
    uploading: "bg-blue-500 animate-pulse",
    transcribed: "bg-green-500",
    silent: "bg-muted-foreground/40",
    error: "bg-destructive",
  }
  const labels: Record<ChunkEntry["status"], string> = {
    uploading: "Transcribing…",
    transcribed: entry.text ? entry.text.slice(0, 60) + (entry.text.length > 60 ? "…" : "") : "Transcribed",
    silent: "Silent",
    error: "Error (failed after retries)",
  }

  return (
    <div
      className={`size-2.5 rounded-full ${colors[entry.status]} flex-shrink-0`}
      title={`Chunk ${entry.chunkIndex + 1}: ${labels[entry.status]}`}
    />
  )
}

function StatusBadge({ status }: { status: "idle" | "recording" | "paused" | "processing" | "done" }) {
  const map = {
    idle: { label: "Ready", cls: "text-muted-foreground" },
    recording: { label: "Recording", cls: "text-red-500" },
    paused: { label: "Paused", cls: "text-yellow-500" },
    processing: { label: "Transcribing…", cls: "text-blue-500" },
    done: { label: "Complete", cls: "text-green-500" },
  }
  const { label, cls } = map[status]
  return <span className={`text-sm font-medium ${cls}`}>{label}</span>
}

export default function RecorderPage() {
  const {
    status,
    start,
    stop,
    pause,
    resume,
    elapsed,
    stream,
    fullTranscript,
    chunkEntries,
    pendingCount,
    isProcessing,
    clearAll,
  } = useTranscription(SERVER_URL, { chunkDuration: 5 })

  const transcriptRef = useRef<HTMLDivElement>(null)

  const isRecording = status === "recording"
  const isPaused = status === "paused"
  const isActive = isRecording || isPaused

  const derivedStatus = isRecording
    ? "recording"
    : isPaused
      ? "paused"
      : isProcessing
        ? "processing"
        : chunkEntries.length > 0
          ? "done"
          : "idle"

  const handlePrimary = useCallback(() => {
    if (isActive) stop()
    else start()
  }, [isActive, stop, start])

  useEffect(() => {
    const el = transcriptRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [fullTranscript])

  return (
    <div className="container mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Speech Transcriber</h1>
          <p className="text-sm text-muted-foreground">
            16 kHz PCM · 5 s chunks · Whisper-1 · hallucination-safe
          </p>
        </div>
        {chunkEntries.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={clearAll}>
            <Trash2 className="size-3.5" />
            Clear all
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── Left: Recording Panel ── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle>Recording</CardTitle>
              <StatusBadge status={derivedStatus} />
            </div>
            <CardDescription>
              {isActive
                ? "Audio is being captured and chunked"
                : "Click Record to start capturing"}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col gap-5">
            <div className="overflow-hidden rounded-sm border border-border/50 bg-muted/20 text-foreground">
              <LiveWaveform
                active={isRecording}
                processing={isPaused || isProcessing}
                stream={stream}
                height={80}
                barWidth={3}
                barGap={1}
                barRadius={2}
                sensitivity={1.8}
                smoothingTimeConstant={0.85}
                fadeEdges
                fadeWidth={32}
                mode="static"
              />
            </div>

            <div className="text-center font-mono text-4xl tabular-nums tracking-tight">
              {formatTime(elapsed)}
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                size="lg"
                variant={isActive ? "destructive" : "default"}
                className="gap-2 px-6"
                onClick={handlePrimary}
                disabled={status === "requesting"}
              >
                {isActive ? (
                  <>
                    <Square className="size-4" />
                    Stop
                  </>
                ) : (
                  <>
                    <Mic className="size-4" />
                    {status === "requesting" ? "Requesting…" : "Record"}
                  </>
                )}
              </Button>

              {isActive && (
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={isPaused ? resume : pause}
                >
                  {isPaused ? (
                    <>
                      <Play className="size-4" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="size-4" />
                      Pause
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Chunk pipeline */}
            {chunkEntries.length > 0 && (
              <div className="space-y-2 border-t border-border/50 pt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {chunkEntries.length} chunk{chunkEntries.length !== 1 ? "s" : ""}
                    {pendingCount > 0 && ` · ${pendingCount} transcribing`}
                  </span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="size-2.5 text-green-500" />
                      done
                    </span>
                    <span className="flex items-center gap-1">
                      <VolumeX className="size-2.5 text-muted-foreground/60" />
                      silent
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chunkEntries.map((entry) => (
                    <ChunkPip key={entry.chunkId} entry={entry} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Right: Transcript Panel ── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle>Transcript</CardTitle>
            <CardDescription>
              {fullTranscript
                ? `${fullTranscript.split(/\s+/).filter(Boolean).length} words`
                : "Transcript will appear here as you speak"}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col">
            <div
              ref={transcriptRef}
              className="min-h-[280px] flex-1 overflow-y-auto rounded-sm border border-border/50 bg-muted/10 p-4 text-sm leading-relaxed"
            >
              {fullTranscript ? (
                <p className="whitespace-pre-wrap">{fullTranscript}</p>
              ) : (
                <p className="text-muted-foreground/60 italic">
                  {isRecording
                    ? "Listening…"
                    : isProcessing
                      ? "Processing audio…"
                      : "Start recording to see the transcript here."}
                </p>
              )}
            </div>

            {fullTranscript && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob = new Blob([fullTranscript], { type: "text/plain" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `transcript-${Date.now()}.txt`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Export .txt
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
