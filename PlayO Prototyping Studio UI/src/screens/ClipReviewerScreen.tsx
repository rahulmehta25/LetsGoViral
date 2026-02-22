import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, Pause, Wand2, RefreshCw, Loader2, Pencil, Plus, X } from 'lucide-react';
import { Clip, VideoDetails, SfxItem } from '../types';
import { webApi } from '../lib/api';

interface ClipReviewerScreenProps {
  onNavigate: (screen: string) => void;
  video: VideoDetails | null;
  startIndex: number;
  onFinalize: (clips: Array<{ id: string; start_time_seconds: number; end_time_seconds: number }>) => Promise<void>;
  onError: (message: string) => void;
}

type EditableClip = Clip & {
  start: number;
  end: number;
};

const SEGMENT_COLORS = ['#A855F7', '#F97316', '#0EA5E9', '#22C55E', '#EC4899', '#EAB308'];

interface LocalClipSfx {
  sfxData: SfxItem[] | null;
  sfxVideoUrl: string | null;
  loading: boolean;
  error: string | null;
}

export function ClipReviewerScreen({
  onNavigate,
  video,
  startIndex,
  onFinalize,
  onError,
}: ClipReviewerScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const retriedSourceRef = useRef(false);

  // ── Clip editor state ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceVideoUrl, setSourceVideoUrl] = useState(video?.source_video_url || '');
  const [sourceNonce, setSourceNonce] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const dragRef = useRef<{
    clipIndex: number;
    edge: 'start' | 'end';
    wasPlaying: boolean;
  } | null>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const scrubResumeRef = useRef(false);

  const chronoClips = useMemo(() => {
    return [...(video?.clips || [])].sort(
      (a, b) => (a.start_time_seconds || 0) - (b.start_time_seconds || 0),
    );
  }, [video?.clips]);

  const [editableClips, setEditableClips] = useState<EditableClip[]>([]);

  // ── SFX state (per-clip, keyed by clip ID) ──
  const [localSfx, setLocalSfx] = useState<Record<string, LocalClipSfx>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const timelineBarRef = useRef<HTMLDivElement>(null);
  const [draggingSfxId, setDraggingSfxId] = useState<string | null>(null);
  const [dragTimestamp, setDragTimestamp] = useState<number>(0);
  const [addSfxOpen, setAddSfxOpen] = useState(false);
  const [newSfxPrompt, setNewSfxPrompt] = useState('');
  const [newSfxTimestamp, setNewSfxTimestamp] = useState(0);
  const [addSfxLoading, setAddSfxLoading] = useState(false);

  // ── Map startIndex (rank-based) → chronological index ──
  useEffect(() => {
    if (!video?.clips || video.clips.length === 0) return;
    const rankSorted = [...video.clips].sort(
      (a, b) => (a.strategic_rank || 0) - (b.strategic_rank || 0),
    );
    const target = rankSorted[startIndex];
    if (target) {
      const idx = chronoClips.findIndex((c) => c.id === target.id);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [startIndex, chronoClips, video?.clips]);

  useEffect(() => {
    setSourceVideoUrl(video?.source_video_url || '');
    setSourceNonce(0);
    setSourceError('');
    retriedSourceRef.current = false;
  }, [video?.id, video?.source_video_url]);

  // Seed editable clips from chronologically sorted clips
  useEffect(() => {
    const seeded = chronoClips.map((clip) => {
      const start = Number(clip.start_time_seconds ?? 0);
      const end = Number(clip.end_time_seconds ?? start + Number(clip.duration_seconds || 1));
      return { ...clip, start, end };
    });
    setEditableClips(seeded);
  }, [chronoClips]);

  const timelineDuration = useMemo(() => {
    if (duration > 0) return duration;
    const maxEnd = editableClips.reduce((acc, c) => Math.max(acc, c.end), 0);
    return Math.max(1, maxEnd);
  }, [duration, editableClips]);

  const tlDurRef = useRef(timelineDuration);
  tlDurRef.current = timelineDuration;

  const timeFromEl = (clientX: number, el: HTMLElement | null) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * tlDurRef.current;
  };

  // Auto-highlight whichever clip the playhead is inside
  useEffect(() => {
    if (isDraggingHandle || isScrubbing) return;
    const idx = editableClips.findIndex((c) => currentTime >= c.start && currentTime < c.end);
    if (idx >= 0) setActiveIndex(idx);
  }, [currentTime, editableClips, isDraggingHandle, isScrubbing]);

  // Reset SFX edit state when active clip changes
  useEffect(() => {
    setEditingId(null);
    setEditDraft('');
    setEditLoading(false);
    setAddSfxOpen(false);
    setNewSfxPrompt('');
    setNewSfxTimestamp(0);
    setDraggingSfxId(null);
  }, [activeIndex]);

  // ── Auto-generate SFX when active clip loads (if not already generated) ──
  const activeClip = editableClips[activeIndex] ?? null;

  useEffect(() => {
    if (!activeClip) return;
    const clipId = activeClip.id;
    const alreadyHasSfx = activeClip.sfx_data && activeClip.sfx_data.length > 0;
    const alreadyAttempted = clipId in localSfx;
    if (alreadyHasSfx || alreadyAttempted) return;

    setLocalSfx((prev) => ({
      ...prev,
      [clipId]: { sfxData: null, sfxVideoUrl: null, loading: true, error: null },
    }));

    webApi.clips.generateSfx(clipId).then((result) => {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          sfxData: result.clip.sfx_data ?? null,
          sfxVideoUrl: result.clip.sfx_video_url ?? null,
          loading: false,
          error: null,
        },
      }));
    }).catch((err: Error) => {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: { sfxData: null, sfxVideoUrl: null, loading: false, error: err.message },
      }));
    });
  }, [activeClip?.id]);

  // ── Source video loading ──
  const refreshSourcePreview = async (): Promise<boolean> => {
    if (!video?.id || isLoadingSource) return false;
    setIsLoadingSource(true);
    setSourceError('');
    try {
      const data = await webApi.videos.getSourcePreview(video.id);
      if (!data.source_video_url) throw new Error('Missing source preview URL');
      setSourceVideoUrl(data.source_video_url);
      setSourceNonce((p) => p + 1);
      retriedSourceRef.current = false;
      return true;
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : 'Unable to load video');
      return false;
    } finally {
      setIsLoadingSource(false);
    }
  };

  useEffect(() => {
    if (!video?.id || sourceVideoUrl) return;
    void refreshSourcePreview();
  }, [video?.id, sourceVideoUrl]);

  // ── Playback controls ──
  const togglePlay = async () => {
    if (!sourceVideoUrl) {
      const ok = await refreshSourcePreview();
      if (!ok) return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play().catch(() => {}) : v.pause();
  };

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    const bounded = Math.max(0, Math.min(tlDurRef.current, t));
    v.currentTime = bounded;
    setCurrentTime(bounded);
  };

  // ── Segment edge dragging ──
  const beginHandleDrag = (e: React.PointerEvent, clipIdx: number, edge: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    const v = videoRef.current;
    const wasPlaying = v ? !v.paused : false;
    if (wasPlaying && v) v.pause();
    dragRef.current = { clipIndex: clipIdx, edge, wasPlaying };
    setIsDraggingHandle(true);
    setActiveIndex(clipIdx);
  };

  useEffect(() => {
    if (!isDraggingHandle) return;

    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const t = timeFromEl(e.clientX, timelineRef.current);
      updateClipBoundary(d.clipIndex, d.edge, t);
      seekTo(t);
    };

    const end = () => {
      const d = dragRef.current;
      if (d?.wasPlaying) videoRef.current?.play().catch(() => {});
      dragRef.current = null;
      setIsDraggingHandle(false);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [isDraggingHandle]);

  // ── Scrubber bar dragging ──
  const beginScrub = (e: React.PointerEvent) => {
    const v = videoRef.current;
    if (!v) return;
    const shouldResume = !v.paused;
    scrubResumeRef.current = shouldResume;
    if (shouldResume) v.pause();
    setIsScrubbing(true);
    seekTo(timeFromEl(e.clientX, scrubberRef.current));
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const move = (e: PointerEvent) => {
      seekTo(timeFromEl(e.clientX, scrubberRef.current));
    };

    const end = () => {
      setIsScrubbing(false);
      if (scrubResumeRef.current) videoRef.current?.play().catch(() => {});
      scrubResumeRef.current = false;
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [isScrubbing]);

  // ── Clip boundary editing ──
  const updateClipBoundary = (index: number, field: 'start' | 'end', rawValue: number) => {
    setEditableClips((prev) => {
      const next = [...prev];
      const target = next[index];
      if (!target) return prev;

      const minGap = 0.2;
      const prevEnd = index > 0 ? next[index - 1].end : 0;
      const nextStart = index < next.length - 1 ? next[index + 1].start : tlDurRef.current;

      if (field === 'start') {
        target.start = Number(Math.min(target.end - minGap, Math.max(prevEnd, rawValue)).toFixed(3));
      } else {
        target.end = Number(Math.max(target.start + minGap, Math.min(nextStart, rawValue)).toFixed(3));
      }

      next[index] = { ...target };
      return next;
    });
  };

  // ── Finalize ──
  const handleFinalize = async () => {
    if (!video?.id) return;
    setIsFinalizing(true);
    try {
      await onFinalize(
        editableClips.map((c) => ({
          id: c.id,
          start_time_seconds: c.start,
          end_time_seconds: c.end,
        })),
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to finalize clips');
    } finally {
      setIsFinalizing(false);
    }
  };

  // ── SFX handlers ──
  const handleRegen = () => {
    if (!activeClip) return;
    const clipId = activeClip.id;
    setLocalSfx((prev) => ({
      ...prev,
      [clipId]: { sfxData: null, sfxVideoUrl: null, loading: true, error: null },
    }));
    webApi.clips.generateSfx(clipId).then((result) => {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          sfxData: result.clip.sfx_data ?? null,
          sfxVideoUrl: result.clip.sfx_video_url ?? null,
          loading: false,
          error: null,
        },
      }));
    }).catch((err: Error) => {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: { sfxData: null, sfxVideoUrl: null, loading: false, error: err.message },
      }));
    });
  };

  const handleDeleteSfx = async (sfxId: string) => {
    if (!activeClip) return;
    const clipId = activeClip.id;
    const current = localSfx[clipId];
    setLocalSfx((prev) => ({ ...prev, [clipId]: { ...(prev[clipId] ?? { sfxData: null, sfxVideoUrl: null, error: null }), loading: true } }));
    try {
      const result = await webApi.clips.deleteSfxItem(clipId, sfxId);
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          sfxData: result.clip.sfx_data ?? null,
          sfxVideoUrl: result.clip.sfx_video_url ?? null,
          loading: false,
          error: null,
        },
      }));
    } catch (err) {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          ...(current ?? { sfxData: null, sfxVideoUrl: null }),
          loading: false,
          error: err instanceof Error ? err.message : 'Delete failed',
        },
      }));
    }
  };

  const handleConfirmEdit = async (sfxId: string) => {
    if (!activeClip || !editDraft.trim()) return;
    const clipId = activeClip.id;
    setEditLoading(true);
    try {
      const result = await webApi.clips.updateSfxItem(clipId, sfxId, editDraft.trim());
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          sfxData: result.clip.sfx_data ?? null,
          sfxVideoUrl: result.clip.sfx_video_url ?? null,
          loading: false,
          error: null,
        },
      }));
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          ...(prev[clipId] ?? { sfxData: null, sfxVideoUrl: null }),
          loading: false,
          error: err instanceof Error ? err.message : 'Update failed',
        },
      }));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDragStart = useCallback((sfxId: string, currentTimestamp: number) => {
    setDraggingSfxId(sfxId);
    setDragTimestamp(currentTimestamp);
  }, []);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!timelineBarRef.current || !draggingSfxId) return;
    const rect = timelineBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = activeClip ? (activeClip.end - activeClip.start) : 10;
    setDragTimestamp(pct * dur);
  }, [draggingSfxId, activeClip]);

  const handleDragEnd = useCallback(async () => {
    if (!activeClip || !draggingSfxId) return;
    setDraggingSfxId(null);
    const clipId = activeClip.id;
    setLocalSfx((prev) => ({ ...prev, [clipId]: { ...(prev[clipId] ?? { sfxData: null, sfxVideoUrl: null, error: null }), loading: true } }));
    try {
      const result = await webApi.clips.updateSfxTimestamp(clipId, draggingSfxId, dragTimestamp);
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          sfxData: result.clip.sfx_data ?? null,
          sfxVideoUrl: result.clip.sfx_video_url ?? null,
          loading: false,
          error: null,
        },
      }));
    } catch (err) {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          ...(prev[clipId] ?? { sfxData: null, sfxVideoUrl: null }),
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to move SFX',
        },
      }));
    }
  }, [activeClip, draggingSfxId, dragTimestamp]);

  useEffect(() => {
    if (!draggingSfxId) return;
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [draggingSfxId, handleDragMove, handleDragEnd]);

  const handleAddSfx = async () => {
    if (!activeClip || !newSfxPrompt.trim()) return;
    const clipId = activeClip.id;
    setAddSfxLoading(true);
    setLocalSfx((prev) => ({ ...prev, [clipId]: { ...(prev[clipId] ?? { sfxData: null, sfxVideoUrl: null, error: null }), loading: true } }));
    try {
      const result = await webApi.clips.addSfx(clipId, {
        prompt: newSfxPrompt.trim(),
        timestamp_seconds: newSfxTimestamp,
        label: 'Custom',
      });
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          sfxData: result.clip.sfx_data ?? null,
          sfxVideoUrl: result.clip.sfx_video_url ?? null,
          loading: false,
          error: null,
        },
      }));
      setAddSfxOpen(false);
      setNewSfxPrompt('');
    } catch (err) {
      setLocalSfx((prev) => ({
        ...prev,
        [clipId]: {
          ...(prev[clipId] ?? { sfxData: null, sfxVideoUrl: null }),
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to add SFX',
        },
      }));
    } finally {
      setAddSfxLoading(false);
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // ── Empty state ──
  if (!video || editableClips.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#F5F5F5] flex items-center justify-center">
        <button
          onClick={() => onNavigate('projects')}
          className="px-6 py-3 bg-black text-white rounded-full"
        >
          Back to projects
        </button>
      </div>
    );
  }

  const playheadPct = (currentTime / timelineDuration) * 100;

  // SFX data for the currently active clip
  const sfxClipState = activeClip ? localSfx[activeClip.id] : undefined;
  const sfxData: SfxItem[] = activeClip?.sfx_data && activeClip.sfx_data.length > 0
    ? activeClip.sfx_data
    : (sfxClipState?.sfxData ?? []);
  const sfxVideoUrl = sfxClipState?.sfxVideoUrl ?? activeClip?.sfx_video_url ?? null;
  const sfxLoading = sfxClipState?.loading ?? false;
  const sfxError = sfxClipState?.error ?? null;
  const clipDuration = activeClip ? activeClip.end - activeClip.start : 10;

  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col animate-fade-in">
      {/* Header */}
      <header className="h-16 bg-white border-b border-gray-200 px-4 flex items-center justify-between">
        <button
          onClick={() => onNavigate('projects')}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-700" />
        </button>
        <div className="text-center">
          <h1 className="text-base font-bold text-gray-900">Review Clips</h1>
          <p className="text-xs text-gray-500">Adjust boundaries, then approve to split with ffmpeg</p>
        </div>
        <button
          onClick={() => void handleFinalize()}
          disabled={isFinalizing}
          className="h-10 px-4 rounded-full bg-[#00D4AA] hover:bg-[#00B390] disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Wand2 size={14} /> {isFinalizing ? 'Splitting...' : 'Approve & Split'}
        </button>
      </header>

      <main className="flex-1 p-4 overflow-y-auto pb-28 max-w-6xl w-full mx-auto space-y-4">
        {/* ── Video Player ── */}
        <div className="bg-black rounded-2xl overflow-hidden relative aspect-video shadow-xl">
          {sourceVideoUrl ? (
            <video
              key={`${sourceVideoUrl}-${sourceNonce}`}
              ref={videoRef}
              src={sourceVideoUrl}
              className="w-full h-full object-contain"
              playsInline
              preload="metadata"
              onError={() => {
                if (!retriedSourceRef.current) {
                  retriedSourceRef.current = true;
                  void refreshSourcePreview();
                  return;
                }
                setSourceError('Could not load video');
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => {
                if (!isScrubbing && !isDraggingHandle) {
                  setCurrentTime(e.currentTarget.currentTime || 0);
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/70 gap-3">
              <div>{isLoadingSource ? 'Loading original video...' : 'Video preview unavailable'}</div>
              {(sourceError || !isLoadingSource) && (
                <button
                  onClick={() => void refreshSourcePreview()}
                  className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs hover:bg-white/20"
                >
                  Retry
                </button>
              )}
              {sourceError && <div className="text-xs text-red-300">{sourceError}</div>}
            </div>
          )}

          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <button
              onClick={() => void togglePlay()}
              className="h-11 w-11 rounded-full bg-black/60 border border-white/20 backdrop-blur text-white flex items-center justify-center hover:bg-black/80 transition-colors"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="px-3 py-1.5 rounded-full bg-black/60 border border-white/20 backdrop-blur text-white text-xs font-mono">
              {fmt(currentTime)} / {fmt(timelineDuration)}
            </div>
          </div>
        </div>

        {/* ── Timeline & Scrubber ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Timeline</h2>
            <span className="text-xs text-gray-500">
              {editableClips.length} clip{editableClips.length !== 1 ? 's' : ''} &mdash; drag edges to adjust
            </span>
          </div>

          {/* Segment bar */}
          <div
            ref={timelineRef}
            onClick={(e) => {
              if (!isDraggingHandle) seekTo(timeFromEl(e.clientX, timelineRef.current));
            }}
            className="relative h-14 rounded-xl bg-gray-100 border border-gray-200 cursor-pointer select-none"
            style={{ touchAction: 'none' }}
          >
            {editableClips.map((clip, i) => {
              const left = (clip.start / timelineDuration) * 100;
              const width = Math.max(0.5, ((clip.end - clip.start) / timelineDuration) * 100);
              const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
              const active = activeIndex === i;

              return (
                <div
                  key={clip.id}
                  className="absolute top-1 bottom-1 group"
                  style={{ left: `${left}%`, width: `${width}%`, zIndex: active ? 10 : 1 }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveIndex(i);
                      seekTo(clip.start);
                    }}
                    className={`absolute inset-0 rounded-lg transition-shadow ${active ? 'ring-2 ring-black ring-offset-1' : ''}`}
                    style={{ backgroundColor: color, opacity: active ? 1 : 0.6 }}
                  >
                    {width > 6 && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold truncate px-2 drop-shadow-sm">
                        {clip.title || `Clip ${i + 1}`}
                      </span>
                    )}
                  </button>

                  {/* Left drag handle */}
                  <div
                    onPointerDown={(e) => beginHandleDrag(e, i, 'start')}
                    className="absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-1 h-6 rounded-full bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity shadow" />
                  </div>

                  {/* Right drag handle */}
                  <div
                    onPointerDown={(e) => beginHandleDrag(e, i, 'end')}
                    className="absolute -right-1 top-0 bottom-0 w-3 cursor-col-resize z-20 flex items-center justify-center"
                    style={{ touchAction: 'none' }}
                  >
                    <div className="w-1 h-6 rounded-full bg-white/80 opacity-0 group-hover:opacity-100 transition-opacity shadow" />
                  </div>
                </div>
              );
            })}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
              style={{ left: `${playheadPct}%`, zIndex: 30 }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow" />
            </div>
          </div>

          {/* Scrubber */}
          <div className="mt-3">
            <div
              ref={scrubberRef}
              onPointerDown={beginScrub}
              className="relative h-2 rounded-full bg-gray-200 cursor-ew-resize select-none"
              style={{ touchAction: 'none' }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full bg-gray-400"
                style={{ width: `${playheadPct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-black shadow border-2 border-white"
                style={{ left: `calc(${playheadPct}% - 8px)` }}
              />
            </div>
          </div>

          <div className="mt-2 flex justify-between text-[10px] text-gray-400 font-mono">
            <span>0:00</span>
            <span>{fmt(timelineDuration)}</span>
          </div>
        </div>

        {/* ── Clip Cards ── */}
        <div className="space-y-3">
          {editableClips.map((clip, i) => {
            const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
            const active = activeIndex === i;
            const dur = clip.end - clip.start;

            return (
              <div
                key={clip.id}
                onClick={() => {
                  setActiveIndex(i);
                  seekTo(clip.start);
                }}
                className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all ${
                  active ? 'border-2 border-black shadow-lg' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <h3 className="text-sm font-bold text-gray-900">
                      {clip.title || `Clip #${i + 1}`}
                    </h3>
                    {clip.strategic_rank != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                        #{clip.strategic_rank}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {clip.hook_score != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                        Hook {clip.hook_score}/10
                      </span>
                    )}
                    <span className="text-xs font-mono text-gray-500">{dur.toFixed(1)}s</span>
                  </div>
                </div>

                {clip.hook && (
                  <p className="text-xs text-gray-600 mb-3 italic line-clamp-2">&ldquo;{clip.hook}&rdquo;</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-gray-600">
                    Start: {fmt(clip.start)}
                    <input
                      type="range"
                      min={0}
                      max={timelineDuration}
                      step={0.05}
                      value={clip.start}
                      onChange={(e) => updateClipBoundary(i, 'start', Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-1 accent-black"
                    />
                  </label>
                  <label className="text-xs font-semibold text-gray-600">
                    End: {fmt(clip.end)}
                    <input
                      type="range"
                      min={0}
                      max={timelineDuration}
                      step={0.05}
                      value={clip.end}
                      onChange={(e) => updateClipBoundary(i, 'end', Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-1 accent-black"
                    />
                  </label>
                </div>

                {/* ── SFX Panel (shown when this clip is active) ── */}
                {active && (
                  <div
                    className="mt-4 border border-gray-200 rounded-xl overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-1.5 font-semibold text-gray-800 text-xs">
                        <span>🎧</span> Sound Effects
                        {sfxVideoUrl && (
                          <span className="text-[9px] font-medium text-[#00D4AA] bg-[#00D4AA]/10 px-1.5 py-0.5 rounded-full">Mixed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setAddSfxOpen(true); setNewSfxTimestamp(clipDuration * 0.5); setNewSfxPrompt(''); }}
                          disabled={sfxLoading}
                          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-[#00D4AA] disabled:opacity-40 transition-colors"
                        >
                          <Plus size={11} /> Add
                        </button>
                        <button
                          onClick={handleRegen}
                          disabled={sfxLoading}
                          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-800 disabled:opacity-40 transition-colors"
                          title="Re-analyze and regenerate all SFX"
                        >
                          <RefreshCw size={10} className={sfxLoading ? 'animate-spin' : ''} /> Regen
                        </button>
                      </div>
                    </div>

                    <div className="px-3 py-2.5">
                      {sfxLoading ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500 py-1">
                          <Loader2 size={12} className="animate-spin text-[#00D4AA]" />
                          <span>Generating SFX... (~20s)</span>
                        </div>
                      ) : sfxError ? (
                        <div className="flex items-center justify-between py-1">
                          <p className="text-[10px] text-red-500">{sfxError}</p>
                          <button onClick={handleRegen} className="text-[10px] text-[#00D4AA] font-medium hover:underline ml-2 shrink-0">
                            Retry
                          </button>
                        </div>
                      ) : sfxData.length === 0 ? (
                        <p className="text-[10px] text-gray-400 py-1">No SFX generated yet.</p>
                      ) : (
                        <>
                          {/* Timeline bar with draggable dots */}
                          <div ref={timelineBarRef} className="relative w-full h-1.5 bg-gray-100 rounded-full mb-1 mt-1">
                            {sfxData.map((item) => {
                              const isDragging = draggingSfxId === item.id;
                              const ts = isDragging ? dragTimestamp : item.timestamp_seconds;
                              const pct = Math.min(100, (ts / clipDuration) * 100);
                              return (
                                <div
                                  key={item.id}
                                  role="slider"
                                  aria-label={`${item.label} at ${item.timestamp_seconds.toFixed(1)}s`}
                                  tabIndex={0}
                                  className="absolute w-3.5 h-3.5 rounded-full bg-[#00D4AA] -translate-y-1 -translate-x-1/2 border-2 border-white shadow cursor-grab active:cursor-grabbing hover:scale-110 transition-transform select-none"
                                  style={{ left: `${pct}%` }}
                                  title={`${item.label} @ ${item.timestamp_seconds.toFixed(1)}s — drag to move`}
                                  onMouseDown={(e) => { e.preventDefault(); handleDragStart(item.id, item.timestamp_seconds); }}
                                />
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-400 mb-2 px-0.5">
                            <span>0s</span>
                            <span>{clipDuration.toFixed(0)}s</span>
                          </div>

                          {/* Add SFX form */}
                          {addSfxOpen && (
                            <div className="mb-2 p-2 bg-[#00D4AA]/5 border border-[#00D4AA]/20 rounded-lg space-y-1.5">
                              <input
                                type="text"
                                placeholder="e.g. short bass hit sound effect"
                                value={newSfxPrompt}
                                onChange={(e) => setNewSfxPrompt(e.target.value)}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#00D4AA]"
                              />
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-gray-500 shrink-0">At (s):</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={clipDuration}
                                  step={0.5}
                                  value={newSfxTimestamp}
                                  onChange={(e) => setNewSfxTimestamp(Number(e.target.value))}
                                  className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                                />
                                <div className="flex gap-1.5 ml-auto">
                                  <button
                                    onClick={() => void handleAddSfx()}
                                    disabled={addSfxLoading || !newSfxPrompt.trim()}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-[#00D4AA] text-white rounded hover:bg-[#00B390] disabled:opacity-50"
                                  >
                                    {addSfxLoading ? <Loader2 size={9} className="animate-spin" /> : <Plus size={9} />}
                                    Add
                                  </button>
                                  <button
                                    onClick={() => { setAddSfxOpen(false); setNewSfxPrompt(''); }}
                                    disabled={addSfxLoading}
                                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* SFX rows */}
                          <div className="space-y-1.5">
                            {sfxData.map((item) => (
                              <div key={item.id} className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] shrink-0" />
                                <div className="flex-1 min-w-0">
                                  {editingId === item.id ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        autoFocus
                                        type="text"
                                        value={editDraft}
                                        onChange={(e) => setEditDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') void handleConfirmEdit(item.id);
                                          if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                                        }}
                                        className="flex-1 min-w-0 border border-[#00D4AA] rounded px-1.5 py-0.5 text-[10px] focus:outline-none"
                                        disabled={editLoading}
                                      />
                                      <button
                                        onClick={() => void handleConfirmEdit(item.id)}
                                        disabled={editLoading || !editDraft.trim()}
                                        className="text-[#00D4AA] font-bold text-[10px] disabled:opacity-40"
                                      >
                                        {editLoading ? <Loader2 size={10} className="animate-spin" /> : '✓'}
                                      </button>
                                      <button onClick={() => { setEditingId(null); setEditDraft(''); }} className="text-gray-400 text-[10px]">✕</button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="text-[9px] text-gray-400 shrink-0">{item.timestamp_seconds.toFixed(1)}s</span>
                                      <span className="text-[10px] font-medium text-gray-700 truncate">{item.label}</span>
                                    </div>
                                  )}
                                </div>
                                {editingId !== item.id && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                      onClick={() => { setEditingId(item.id); setEditDraft(item.prompt); }}
                                      className="p-0.5 text-gray-400 hover:text-gray-700 transition-colors"
                                    >
                                      <Pencil size={10} />
                                    </button>
                                    <button
                                      onClick={() => void handleDeleteSfx(item.id)}
                                      disabled={sfxLoading}
                                      className="p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                                    >
                                      <X size={10} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
