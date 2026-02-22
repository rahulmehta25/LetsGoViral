import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, Pause, Wand2, RefreshCw, Loader2, Pencil, Plus, X, Volume2, VolumeX, Sparkles, SendHorizonal } from 'lucide-react';
import { Clip, VideoDetails, SfxItem } from '../types';
import { webApi } from '../lib/api';

interface ClipReviewerScreenProps {
  onNavigate: (screen: string) => void;
  video: VideoDetails | null;
  startIndex: number;
  onFinalize: (clips: Array<{ id: string; start_time_seconds: number; end_time_seconds: number }>) => Promise<void>;
  onReanalyze: (suggestion: string) => Promise<void>;
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
  onReanalyze,
  onError,
}: ClipReviewerScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const retriedSourceRef = useRef(false);
  const sfxAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  // ── Clip editor state ──
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [reanalyzeSuggestion, setReanalyzeSuggestion] = useState('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);
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
  // Guard against repeated auto-generation across re-renders
  const sfxTriggeredRef = useRef<Set<string>>(new Set());
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

  const scrubStartRef = useRef(0);
  const scrubRangeRef = useRef(timelineDuration);

  const timeFromEl = (clientX: number, el: HTMLElement | null) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return pct * tlDurRef.current;
  };

  const timeFromScrubber = (clientX: number, el: HTMLElement | null) => {
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return scrubStartRef.current + pct * scrubRangeRef.current;
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
    // Stop any SFX preview
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    setPreviewingSfxId(null);
  }, [activeIndex]);

  // ── Auto-generate SFX when active clip loads (if not already generated) ──
  const activeClip = editableClips[activeIndex] ?? null;

  useEffect(() => {
    if (!activeClip) return;
    const clipId = activeClip.id;
    const alreadyHasSfx = activeClip.sfx_data && activeClip.sfx_data.length > 0;
    // Use a ref to guard against re-renders triggering repeated API calls for the same clip
    if (alreadyHasSfx || sfxTriggeredRef.current.has(clipId)) return;
    sfxTriggeredRef.current.add(clipId);

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

  // ── Client-side SFX audio playback ──
  // Always keep a ref to the latest SFX data for the active clip (read by timeupdate handler)
  const activeSfxDataRef = useRef<SfxItem[]>([]);
  const latestSfxData = useMemo(() => {
    const clip = editableClips[activeIndex];
    if (!clip) return [];
    const state = localSfx[clip.id];
    if (clip.sfx_data && clip.sfx_data.length > 0) return clip.sfx_data;
    return state?.sfxData ?? [];
  }, [editableClips, activeIndex, localSfx]);
  activeSfxDataRef.current = latestSfxData;

  // Track SFX item IDs so we only recreate audio elements when items are added/removed
  const sfxItemIds = useMemo(() => latestSfxData.map((s) => s.id).join(','), [latestSfxData]);

  // Create/remove audio elements only when the set of SFX items changes (not on volume changes)
  useEffect(() => {
    const audioMap = sfxAudioRefs.current;
    const currentIds = new Set(latestSfxData.map((s) => s.id));

    // Remove audio elements for SFX items that no longer exist
    audioMap.forEach((audio, id) => {
      if (!currentIds.has(id)) {
        audio.pause();
        audio.src = '';
        audioMap.delete(id);
      }
    });
    // Create audio elements for new SFX items
    for (const sfx of latestSfxData) {
      if (!audioMap.has(sfx.id) && sfx.sfx_url) {
        const audio = new Audio(sfx.sfx_url);
        audio.preload = 'auto';
        audio.volume = typeof sfx.volume === 'number' ? sfx.volume : 1.0;
        audioMap.set(sfx.id, audio);
      }
    }
    return () => {
      audioMap.forEach((audio) => { audio.pause(); audio.src = ''; });
      audioMap.clear();
    };
  }, [activeIndex, sfxItemIds]);

  // Sync SFX playback with video timeupdate
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const activeClipObj = editableClips[activeIndex];
    if (!activeClipObj) return;
    const clipStart = activeClipObj.start;

    const onTimeUpdate = () => {
      const videoTime = v.currentTime;
      const clipRelativeTime = videoTime - clipStart;
      const audioMap = sfxAudioRefs.current;

      for (const sfx of activeSfxDataRef.current) {
        const audio = audioMap.get(sfx.id);
        if (!audio || !sfx.sfx_url) continue;

        const sfxStart = sfx.timestamp_seconds;
        const sfxDur = sfx.duration_seconds || 2;
        const sfxEnd = sfxStart + sfxDur;

        if (clipRelativeTime >= sfxStart && clipRelativeTime < sfxEnd && !v.paused) {
          const expectedPos = clipRelativeTime - sfxStart;
          // Only seek if audio is significantly out of sync (>0.3s)
          if (Math.abs(audio.currentTime - expectedPos) > 0.3) {
            audio.currentTime = expectedPos;
          }
          // Always sync volume so slider changes take effect immediately
          audio.volume = typeof sfx.volume === 'number' ? sfx.volume : 1.0;
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        } else {
          if (!audio.paused) audio.pause();
        }
      }
    };

    const onPause = () => {
      sfxAudioRefs.current.forEach((audio) => audio.pause());
    };

    const onSeeked = () => {
      // Reset all SFX audio positions on seek
      sfxAudioRefs.current.forEach((audio) => { audio.pause(); audio.currentTime = 0; });
    };

    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('pause', onPause);
    v.addEventListener('seeked', onSeeked);

    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('seeked', onSeeked);
    };
  }, [activeIndex, editableClips]);

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
    seekTo(timeFromScrubber(e.clientX, scrubberRef.current));
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const move = (e: PointerEvent) => {
      seekTo(timeFromScrubber(e.clientX, scrubberRef.current));
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

  // ── Re-analyze ──
  const handleReanalyze = async () => {
    if (!reanalyzeSuggestion.trim() || isReanalyzing) return;
    setIsReanalyzing(true);
    try {
      await onReanalyze(reanalyzeSuggestion.trim());
      setReanalyzeSuggestion('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to re-analyze clips');
    } finally {
      setIsReanalyzing(false);
    }
  };

  // ── SFX handlers ──
  const handleRegen = () => {
    if (!activeClip) return;
    const clipId = activeClip.id;
    // Allow re-trigger for manual regeneration
    sfxTriggeredRef.current.delete(clipId);
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
      const result = await webApi.clips.updateSfxItem(clipId, sfxId, { prompt: editDraft.trim() });
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

  // Volume change — update locally for instant feedback, debounce API call
  const volumeTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const handleVolumeChange = (sfxId: string, newVolume: number) => {
    if (!activeClip) return;
    const clipId = activeClip.id;

    // Update editableClips sfx_data (used when the clip already has server-side SFX)
    setEditableClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId || !c.sfx_data) return c;
        return {
          ...c,
          sfx_data: c.sfx_data.map((s) => s.id === sfxId ? { ...s, volume: newVolume } : s),
        };
      })
    );

    // Update localSfx (used when SFX was freshly generated in this session)
    setLocalSfx((prev) => {
      const current = prev[clipId];
      if (!current?.sfxData) return prev;
      return {
        ...prev,
        [clipId]: {
          ...current,
          sfxData: current.sfxData.map((s) =>
            s.id === sfxId ? { ...s, volume: newVolume } : s
          ),
        },
      };
    });

    // Also update the live audio element volume
    const audio = sfxAudioRefs.current.get(sfxId);
    if (audio) audio.volume = newVolume;

    // Debounce API call (save after 500ms of no changes)
    if (volumeTimerRef.current[sfxId]) clearTimeout(volumeTimerRef.current[sfxId]);
    volumeTimerRef.current[sfxId] = setTimeout(() => {
      webApi.clips.updateSfxItem(clipId, sfxId, { volume: newVolume }).catch(() => {});
    }, 500);
  };

  // Preview a single SFX audio
  const [previewingSfxId, setPreviewingSfxId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const handlePreviewSfx = (sfx: SfxItem) => {
    // Stop any current preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingSfxId === sfx.id) {
      setPreviewingSfxId(null);
      return;
    }
    const audio = new Audio(sfx.sfx_url);
    audio.volume = typeof sfx.volume === 'number' ? sfx.volume : 1.0;
    audio.onended = () => { setPreviewingSfxId(null); previewAudioRef.current = null; };
    audio.play().catch(() => {});
    previewAudioRef.current = audio;
    setPreviewingSfxId(sfx.id);
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

  // Zoom scrubber to active clip range
  const scrubPadding = activeClip ? (activeClip.end - activeClip.start) * 0.1 : 0;
  const scrubStart = activeClip ? Math.max(0, activeClip.start - scrubPadding) : 0;
  const scrubEnd = activeClip ? Math.min(timelineDuration, activeClip.end + scrubPadding) : timelineDuration;
  const scrubRange = Math.max(0.1, scrubEnd - scrubStart);
  scrubStartRef.current = scrubStart;
  scrubRangeRef.current = scrubRange;
  const scrubPlayheadPct = Math.max(0, Math.min(100, ((currentTime - scrubStart) / scrubRange) * 100));

  // SFX data for the currently active clip
  // Prefer localSfx (client-side changes from regen/add/edit/delete) over server data
  const sfxClipState = activeClip ? localSfx[activeClip.id] : undefined;
  const sfxData: SfxItem[] = sfxClipState?.sfxData && sfxClipState.sfxData.length > 0
    ? sfxClipState.sfxData
    : (activeClip?.sfx_data && activeClip.sfx_data.length > 0 ? activeClip.sfx_data : []);
  const sfxVideoUrl = sfxClipState?.sfxVideoUrl ?? activeClip?.sfx_video_url ?? null;
  const sfxLoading = sfxClipState?.loading ?? false;
  const sfxError = sfxClipState?.error ?? null;
  const clipDuration = activeClip ? activeClip.end - activeClip.start : 10;

  // Use the SFX-mixed video when available, otherwise fall back to source.
  // When sfxVideoUrl is null (clip not yet exported), client-side audio sync handles playback.
  const activeVideoUrl = sfxVideoUrl || sourceVideoUrl;

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
          disabled={isFinalizing || isReanalyzing}
          className="h-10 px-4 rounded-full bg-[#00D4AA] hover:bg-[#00B390] disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 transition-colors"
        >
          <Wand2 size={14} /> {isFinalizing ? 'Splitting...' : 'Approve & Split'}
        </button>
      </header>

      <main className="flex-1 p-4 overflow-y-auto pb-28 max-w-6xl w-full mx-auto space-y-4">
        {/* ── Video Player ── */}
        <div className="bg-black rounded-2xl overflow-hidden relative aspect-video shadow-xl">
          {activeVideoUrl ? (
            <video
              key={`${activeVideoUrl}-${sourceNonce}`}
              ref={videoRef}
              src={activeVideoUrl}
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
              const rawLeft = (clip.start / timelineDuration) * 100;
              const rawRight = (clip.end / timelineDuration) * 100;
              const left = Math.max(0, Math.min(100, rawLeft));
              const right = Math.max(0, Math.min(100, rawRight));
              const width = Math.max(0.5, right - left);
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

          {/* Scrubber (zoomed to active clip) */}
          <div className="mt-3">
            <div
              ref={scrubberRef}
              onPointerDown={beginScrub}
              className="relative h-2 rounded-full bg-gray-200 cursor-ew-resize select-none"
              style={{ touchAction: 'none' }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 rounded-full bg-gray-400"
                style={{ width: `${scrubPlayheadPct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-black shadow border-2 border-white"
                style={{ left: `calc(${scrubPlayheadPct}% - 8px)` }}
              />
            </div>
          </div>

          <div className="mt-2 flex justify-between text-[10px] text-gray-400 font-mono">
            <span>{fmt(scrubStart)}</span>
            <span>{fmt(scrubEnd)}</span>
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
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-gray-800 text-xs">
                          <Sparkles size={13} className="text-[#00D4AA]" />
                          Recommended Sound Effects
                        </div>
                        {sfxData.length > 0 && (
                          <span className="text-[9px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            AI-generated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setAddSfxOpen(true); setNewSfxTimestamp(clipDuration * 0.5); setNewSfxPrompt(''); }}
                          disabled={sfxLoading}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[#00D4AA] hover:bg-[#00D4AA]/10 rounded-full disabled:opacity-40 transition-colors"
                        >
                          <Plus size={11} /> Add Custom
                        </button>
                        <button
                          onClick={handleRegen}
                          disabled={sfxLoading}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-100 rounded-full disabled:opacity-40 transition-colors"
                          title="Re-analyze and regenerate all SFX"
                        >
                          <RefreshCw size={10} className={sfxLoading ? 'animate-spin' : ''} /> Regenerate
                        </button>
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      {sfxLoading ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500 py-3 justify-center">
                          <Loader2 size={14} className="animate-spin text-[#00D4AA]" />
                          <span>Analyzing clip and generating sound effects... (~20s)</span>
                        </div>
                      ) : sfxError ? (
                        <div className="flex items-center justify-between py-2">
                          <p className="text-xs text-red-500">{sfxError}</p>
                          <button onClick={handleRegen} className="text-xs text-[#00D4AA] font-medium hover:underline ml-2 shrink-0">
                            Retry
                          </button>
                        </div>
                      ) : sfxData.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-xs text-gray-400 mb-2">No sound effects yet.</p>
                          <button
                            onClick={handleRegen}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#00D4AA] text-white rounded-full hover:bg-[#00B390] transition-colors"
                          >
                            <Wand2 size={12} /> Generate SFX
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Timeline bar with draggable dots */}
                          <div ref={timelineBarRef} className="relative w-full h-2 bg-gray-100 rounded-full mb-1 mt-1">
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
                                  className="absolute w-4 h-4 rounded-full bg-[#00D4AA] -translate-y-1 -translate-x-1/2 border-2 border-white shadow-md cursor-grab active:cursor-grabbing hover:scale-125 transition-transform select-none"
                                  style={{ left: `${pct}%` }}
                                  title={`${item.label} @ ${item.timestamp_seconds.toFixed(1)}s — drag to move`}
                                  onMouseDown={(e) => { e.preventDefault(); handleDragStart(item.id, item.timestamp_seconds); }}
                                />
                              );
                            })}
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-400 mb-3 px-0.5">
                            <span>0s</span>
                            <span>{clipDuration.toFixed(0)}s</span>
                          </div>

                          {/* Add SFX form */}
                          {addSfxOpen && (
                            <div className="mb-3 p-3 bg-[#00D4AA]/5 border border-[#00D4AA]/20 rounded-lg space-y-2">
                              <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Describe the sound you want</label>
                              <input
                                type="text"
                                placeholder="e.g. dramatic orchestral hit, whoosh transition, crowd cheering..."
                                value={newSfxPrompt}
                                onChange={(e) => setNewSfxPrompt(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#00D4AA]/50 focus:border-[#00D4AA]"
                              />
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] text-gray-500 shrink-0">Timestamp:</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={clipDuration}
                                  step={0.5}
                                  value={newSfxTimestamp}
                                  onChange={(e) => setNewSfxTimestamp(Number(e.target.value))}
                                  className="w-16 border border-gray-200 rounded px-2 py-1 text-xs"
                                />
                                <span className="text-[10px] text-gray-400">sec</span>
                                <div className="flex gap-1.5 ml-auto">
                                  <button
                                    onClick={() => void handleAddSfx()}
                                    disabled={addSfxLoading || !newSfxPrompt.trim()}
                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-[#00D4AA] text-white rounded-lg hover:bg-[#00B390] disabled:opacity-50 transition-colors"
                                  >
                                    {addSfxLoading ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                                    Generate
                                  </button>
                                  <button
                                    onClick={() => { setAddSfxOpen(false); setNewSfxPrompt(''); }}
                                    disabled={addSfxLoading}
                                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* SFX rows */}
                          <div className="space-y-2">
                            {sfxData.map((item) => {
                              const vol = typeof item.volume === 'number' ? item.volume : 1.0;
                              const isPreviewing = previewingSfxId === item.id;
                              return (
                                <div key={item.id} className="bg-gray-50 rounded-lg p-2.5 hover:bg-gray-100/80 transition-colors">
                                  {editingId === item.id ? (
                                    /* Edit mode */
                                    <div className="space-y-2">
                                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Change sound prompt</label>
                                      <input
                                        autoFocus
                                        type="text"
                                        value={editDraft}
                                        onChange={(e) => setEditDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') void handleConfirmEdit(item.id);
                                          if (e.key === 'Escape') { setEditingId(null); setEditDraft(''); }
                                        }}
                                        className="w-full border border-[#00D4AA] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#00D4AA]/30"
                                        disabled={editLoading}
                                        placeholder="Describe the new sound..."
                                      />
                                      <div className="flex gap-1.5 justify-end">
                                        <button
                                          onClick={() => void handleConfirmEdit(item.id)}
                                          disabled={editLoading || !editDraft.trim()}
                                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium bg-[#00D4AA] text-white rounded-lg disabled:opacity-40 hover:bg-[#00B390] transition-colors"
                                        >
                                          {editLoading ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                                          Regenerate Sound
                                        </button>
                                        <button
                                          onClick={() => { setEditingId(null); setEditDraft(''); }}
                                          className="px-2.5 py-1 text-[10px] text-gray-500 hover:text-gray-700"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Display mode */
                                    <>
                                      <div className="flex items-center gap-2 mb-1.5">
                                        {/* Preview button */}
                                        <button
                                          onClick={() => handlePreviewSfx(item)}
                                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                            isPreviewing ? 'bg-[#00D4AA] text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-[#00D4AA] hover:text-[#00D4AA]'
                                          }`}
                                          title={isPreviewing ? 'Stop preview' : 'Preview sound'}
                                        >
                                          {isPreviewing ? <Pause size={10} /> : <Play size={10} className="ml-0.5" />}
                                        </button>
                                        {/* Label & timestamp */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-semibold text-gray-800 truncate">{item.label}</span>
                                            <span className="text-[9px] text-gray-400 shrink-0 bg-gray-200/60 px-1.5 py-0.5 rounded">@ {item.timestamp_seconds.toFixed(1)}s</span>
                                          </div>
                                          <p className="text-[9px] text-gray-400 truncate mt-0.5" title={item.prompt}>{item.prompt}</p>
                                        </div>
                                        {/* Actions */}
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => { setEditingId(item.id); setEditDraft(item.prompt); }}
                                            className="p-1 text-gray-400 hover:text-[#00D4AA] transition-colors rounded"
                                            title="Change sound prompt"
                                          >
                                            <Pencil size={11} />
                                          </button>
                                          <button
                                            onClick={() => void handleDeleteSfx(item.id)}
                                            disabled={sfxLoading}
                                            className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors rounded"
                                            title="Remove sound"
                                          >
                                            <X size={11} />
                                          </button>
                                        </div>
                                      </div>
                                      {/* Volume slider */}
                                      <div className="flex items-center gap-2 pl-8 mt-1">
                                        <button
                                          onClick={() => handleVolumeChange(item.id, vol > 0 ? 0 : 1)}
                                          className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                                          title={vol > 0 ? 'Mute' : 'Unmute'}
                                        >
                                          {vol > 0 ? <Volume2 size={13} /> : <VolumeX size={13} />}
                                        </button>
                                        <div className="flex-1 relative flex items-center py-1">
                                          <input
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={vol}
                                            onChange={(e) => handleVolumeChange(item.id, Number(e.target.value))}
                                            className="w-full cursor-pointer accent-[#00D4AA]"
                                            style={{ height: '6px' }}
                                            title={`Volume: ${Math.round(vol * 100)}%`}
                                          />
                                        </div>
                                        <span className="text-[10px] font-medium text-gray-500 w-8 text-right shrink-0">{Math.round(vol * 100)}%</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
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

        {/* ── Refine Clips with AI ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-2">Refine Clips with AI</h2>
          <p className="text-xs text-gray-500 mb-3">
            Describe what you'd like to change and Gemini will re-analyze the video.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={reanalyzeSuggestion}
              onChange={(e) => setReanalyzeSuggestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleReanalyze();
                }
              }}
              placeholder="e.g. Focus more on the funny parts, make clip 2 shorter..."
              disabled={isReanalyzing}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent disabled:opacity-50 placeholder:text-gray-400"
            />
            <button
              onClick={() => void handleReanalyze()}
              disabled={isReanalyzing || !reanalyzeSuggestion.trim()}
              className="h-10 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-bold flex items-center gap-2 transition-colors flex-shrink-0"
            >
              {isReanalyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Re-analyzing...
                </>
              ) : (
                <>
                  <SendHorizonal size={14} /> Re-analyze
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* ── Re-analysis loading overlay ── */}
      {isReanalyzing && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center animate-fade-in">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <Loader2 size={32} className="animate-spin text-purple-600" />
            <p className="text-sm font-bold text-gray-900">Re-analyzing video...</p>
            <p className="text-xs text-gray-500">Gemini is finding new clips based on your feedback</p>
          </div>
        </div>
      )}
    </div>
  );
}
