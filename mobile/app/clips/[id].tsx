import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ActivityIndicator, Alert, Platform
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { clipsApi, videosApi } from '@/api/client';
import { useAppStore } from '@/store';
import type { Clip } from '@/store';

const { width, height } = Dimensions.get('window');

export default function ClipReviewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState('AI Rationale');
  const [isDownloading, setIsDownloading] = useState(false);

  const selectedVideoId = useAppStore((s) => s.selectedVideoId);

  // Fetch the clip data from the real API
  const { data: clip, isLoading, error } = useQuery<Clip>({
    queryKey: ['clip', id],
    queryFn: () => clipsApi.get(id!),
    enabled: !!id,
  });

  // Fetch all clips for this video (for navigation)
  const { data: allClips } = useQuery<Clip[]>({
    queryKey: ['video-clips', clip?.video_id],
    queryFn: () => videosApi.getClips(clip!.video_id),
    enabled: !!clip?.video_id,
  });

  // Sort clips by strategic_rank
  const sortedClips = allClips?.sort((a, b) => a.strategic_rank - b.strategic_rank) ?? [];
  const currentIndex = sortedClips.findIndex(c => c.id === id);
  const prevClip = currentIndex > 0 ? sortedClips[currentIndex - 1] : null;
  const nextClip = currentIndex < sortedClips.length - 1 ? sortedClips[currentIndex + 1] : null;

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: () => clipsApi.approve(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clip', id] });
      queryClient.invalidateQueries({ queryKey: ['video-clips'] });
      queryClient.invalidateQueries({ queryKey: ['video-by-project'] });
      if (nextClip) {
        router.replace(`/clips/${nextClip.id}`);
      } else {
        router.back();
      }
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Failed to approve clip');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: () => clipsApi.reject(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clip', id] });
      queryClient.invalidateQueries({ queryKey: ['video-clips'] });
      queryClient.invalidateQueries({ queryKey: ['video-by-project'] });
      if (nextClip) {
        router.replace(`/clips/${nextClip.id}`);
      } else {
        router.back();
      }
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message || 'Failed to reject clip');
    },
  });

  const handleAction = useCallback((action: 'approve' | 'reject') => {
    if (action === 'approve') {
      approveMutation.mutate();
    } else {
      rejectMutation.mutate();
    }
  }, [approveMutation, rejectMutation]);

  const handleDownload = useCallback(async () => {
    if (!clip?.cdn_url) return;

    try {
      setIsDownloading(true);

      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant access to save videos to your camera roll.');
        return;
      }

      // Download the file
      const filename = `clipora_clip_${clip.strategic_rank}_${Date.now()}.mp4`;
      const localUri = `${FileSystem.documentDirectory}${filename}`;

      const downloadResult = await FileSystem.downloadAsync(clip.cdn_url, localUri);

      if (downloadResult.status !== 200) {
        throw new Error('Download failed');
      }

      // Save to camera roll
      await MediaLibrary.saveToLibraryAsync(downloadResult.uri);

      Alert.alert('Saved', 'Clip saved to your camera roll!');
    } catch (err: any) {
      console.error('[Download Error]', err);
      Alert.alert('Download Failed', err.message || 'Could not save the clip.');
    } finally {
      setIsDownloading(false);
    }
  }, [clip]);

  const navigateToClip = useCallback((clipId: string) => {
    router.replace(`/clips/${clipId}`);
  }, []);

  const togglePlayback = useCallback(async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Loading state
  if (isLoading) {
    return (
      <View id="clip-reviewer-loading" style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00D4AA" />
          <Text style={styles.loadingText}>Loading clip...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !clip) {
    return (
      <View id="clip-reviewer-error" style={styles.container}>
        <SafeAreaView style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color="#FF3B30" />
          <Text style={styles.errorTitle}>Clip Not Found</Text>
          <Text style={styles.errorText}>
            {error?.message || 'This clip could not be loaded.'}
          </Text>
          <TouchableOpacity
            id="clip-reviewer-error-back-btn"
            style={styles.errorBackBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.errorBackText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const isMutating = approveMutation.isPending || rejectMutation.isPending;
  const clipCount = sortedClips.length || 1;
  const clipPosition = currentIndex >= 0 ? currentIndex + 1 : 1;

  return (
    <View id="clip-reviewer-container" style={styles.container}>
      {/* Video Player Area */}
      <TouchableOpacity
        id="clip-video-player-area"
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={togglePlayback}
      >
        {/* Header Overlay */}
        <SafeAreaView style={styles.headerOverlay}>
          <TouchableOpacity
            id="clip-back-btn"
            style={styles.overlayBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View id="clip-counter" style={styles.clipCounter}>
            <Text style={styles.clipCounterText}>
              Clip #{clipPosition} of {clipCount}
            </Text>
          </View>
          <TouchableOpacity
            id="clip-download-btn"
            style={styles.overlayBtn}
            onPress={handleDownload}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </SafeAreaView>

        {/* Play/Pause Indicator */}
        {!isPlaying && (
          <View id="clip-play-indicator" style={styles.playIndicator}>
            <View style={styles.playButton}>
              <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}

        {/* Real Video Player */}
        {clip.cdn_url ? (
          <Video
            ref={videoRef}
            source={{ uri: clip.cdn_url }}
            style={styles.videoPlayer}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            isLooping={true}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded) {
                setIsPlaying(status.isPlaying);
              }
            }}
          />
        ) : (
          <View id="clip-video-placeholder" style={styles.videoPlaceholder}>
            <Ionicons name="videocam-off-outline" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={styles.videoPlaceholderText}>No video URL</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <View id="clip-bottom-sheet" style={styles.bottomSheet}>
        {/* Drag Handle */}
        <View style={styles.dragHandle} />

        <View style={styles.sheetContent}>
          {/* Title & Score */}
          <View id="clip-title-row" style={styles.titleRow}>
            <View>
              <Text style={styles.clipTitle}>Clip #{clip.strategic_rank}</Text>
              <Text style={styles.clipDuration}>
                {clip.duration_seconds?.toFixed(1)}s
              </Text>
            </View>
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>Hook Score</Text>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreValue}>
                  {clip.hook_score?.toFixed(1)}/10
                </Text>
              </View>
            </View>
          </View>

          {/* Approval Status */}
          {clip.user_approved !== null && (
            <View id="clip-approval-status" style={[
              styles.approvalBadge,
              clip.user_approved ? styles.approvedBadge : styles.rejectedBadge,
            ]}>
              <Ionicons
                name={clip.user_approved ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={clip.user_approved ? '#34C759' : '#FF3B30'}
              />
              <Text style={[
                styles.approvalText,
                { color: clip.user_approved ? '#34C759' : '#FF3B30' },
              ]}>
                {clip.user_approved ? 'Approved' : 'Rejected'}
              </Text>
            </View>
          )}

          {/* Tabs */}
          <View id="clip-tabs" style={styles.tabs}>
            {['Details', 'AI Rationale'].map(tab => (
              <TouchableOpacity
                key={tab}
                id={`clip-tab-${tab.replace(/\s/g, '-').toLowerCase()}`}
                style={styles.tab}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive
                ]}>
                  {tab}
                </Text>
                {activeTab === tab && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <View id="clip-content" style={styles.rationaleContainer}>
            {activeTab === 'AI Rationale' ? (
              <Text style={styles.rationaleText}>
                {clip.rationale || 'No AI rationale available for this clip.'}
              </Text>
            ) : (
              <View>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{clip.duration_seconds?.toFixed(1)} seconds</Text>
                <Text style={styles.detailLabel}>Strategic Rank</Text>
                <Text style={styles.detailValue}>#{clip.strategic_rank} (post this first)</Text>
                <Text style={styles.detailLabel}>Hook Score</Text>
                <Text style={styles.detailValue}>{clip.hook_score?.toFixed(1)} / 10</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View id="clip-actions" style={styles.actions}>
            <TouchableOpacity
              id="clip-reject-btn"
              style={styles.rejectButton}
              onPress={() => handleAction('reject')}
              disabled={isMutating}
            >
              {rejectMutation.isPending ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <>
                  <Ionicons name="close" size={20} color="#6B7280" />
                  <Text style={styles.rejectButtonText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              id="clip-approve-btn"
              style={styles.approveButton}
              onPress={() => handleAction('approve')}
              disabled={isMutating}
            >
              {approveMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.approveButtonText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Navigation */}
          <View id="clip-navigation" style={styles.navigation}>
            <TouchableOpacity
              id="clip-prev-btn"
              style={[styles.navBtn, !prevClip && styles.navBtnDisabled]}
              onPress={() => prevClip && navigateToClip(prevClip.id)}
              disabled={!prevClip}
            >
              <Ionicons name="chevron-back" size={14} color={prevClip ? '#9CA3AF' : '#E5E7EB'} />
              <Text style={[styles.navText, !prevClip && styles.navTextDisabled]}>Prev Clip</Text>
            </TouchableOpacity>
            <Text style={styles.swipeHint}>
              {clipPosition}/{clipCount}
            </Text>
            <TouchableOpacity
              id="clip-next-btn"
              style={[styles.navBtn, !nextClip && styles.navBtnDisabled]}
              onPress={() => nextClip && navigateToClip(nextClip.id)}
              disabled={!nextClip}
            >
              <Text style={[styles.navText, !nextClip && styles.navTextDisabled]}>Next Clip</Text>
              <Ionicons name="chevron-forward" size={14} color={nextClip ? '#9CA3AF' : '#E5E7EB'} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#AEAEB2',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  errorText: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
  },
  errorBackBtn: {
    marginTop: 16,
    backgroundColor: '#00D4AA',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  errorBackText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 20,
  },
  overlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clipCounter: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  clipCounterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  playIndicator: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    zIndex: 10,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayer: {
    flex: 1,
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  videoPlaceholderText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.3)',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  dragHandle: {
    width: 48,
    height: 5,
    backgroundColor: '#D1D5DB',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  clipTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  clipDuration: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  scoreContainer: {
    alignItems: 'flex-end',
    gap: 4,
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  scoreBadge: {
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scoreValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00D4AA',
  },
  approvalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  approvedBadge: {
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
  },
  rejectedBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  approvalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    position: 'relative',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  tabTextActive: {
    color: '#1C1C1E',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: '#00D4AA',
    borderRadius: 1,
  },
  rationaleContainer: {
    minHeight: 80,
    marginBottom: 24,
  },
  rationaleText: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 24,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 15,
    color: '#1C1C1E',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  rejectButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6B7280',
  },
  approveButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#00D4AA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#00D4AA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  approveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navBtnDisabled: {
    opacity: 0.4,
  },
  navText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  navTextDisabled: {
    color: '#E5E7EB',
  },
  swipeHint: {
    fontSize: 12,
    color: '#D1D5DB',
  },
});
