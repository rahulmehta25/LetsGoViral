import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { videosApi } from '@/api/client';
import { useAppStore } from '@/store';
import { Colors } from '@/constants/Colors';
import type { Video, Clip, EditGuidanceSuggestion } from '@/store';

function ClipCard({ clip, onPress }: { clip: Clip; onPress: () => void }) {
  const statusColor =
    clip.user_approved === true  ? Colors.success :
    clip.user_approved === false ? Colors.error   :
    Colors.textTertiary;

  const statusIcon =
    clip.user_approved === true  ? 'checkmark-circle' :
    clip.user_approved === false ? 'close-circle'     :
    'time-outline';

  return (
    <TouchableOpacity style={styles.clipCard} onPress={onPress} activeOpacity={0.7}>
      {/* Rank badge */}
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{clip.strategic_rank}</Text>
      </View>

      {/* Clip info */}
      <View style={styles.clipInfo}>
        <View style={styles.clipHeader}>
          <Text style={styles.clipTitle}>Clip {clip.strategic_rank}</Text>
          <Ionicons name={statusIcon} size={18} color={statusColor} />
        </View>

        <View style={styles.clipMeta}>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.metaText}>{clip.duration_seconds?.toFixed(1)}s</Text>
          </View>
          <View style={[styles.metaChip, styles.scoreChip]}>
            <Ionicons name="flame" size={12} color={Colors.warning} />
            <Text style={[styles.metaText, { color: Colors.warning }]}>
              {clip.hook_score?.toFixed(1)}/10
            </Text>
          </View>
        </View>

        {clip.rationale && (
          <Text style={styles.rationale} numberOfLines={2}>{clip.rationale}</Text>
        )}
      </View>

      <Ionicons name="play-circle" size={32} color={Colors.primary} />
    </TouchableOpacity>
  );
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const setSelectedClip = useAppStore((s) => s.setSelectedClip);

  // For MVP, get the first video of the project (simplified)
  // In production, you'd list all videos for the project
  const { data: video, isLoading } = useQuery<Video>({
    queryKey: ['video-by-project', id],
    queryFn:  async () => {
      // Fetch project details which includes videos
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/projects/${id}`,
        { headers: { 'X-API-Key': process.env.EXPO_PUBLIC_API_KEY || '' } }
      );
      const data = await response.json();
      const firstVideo = data.data.videos?.[0];
      if (!firstVideo) return null;
      return videosApi.get(firstVideo.id);
    },
    enabled: !!id,
  });

  function handleClipPress(clip: Clip) {
    setSelectedClip(clip.id);
    router.push(`/clips/${clip.id}`);
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const clips = video?.clips ?? [];
  const status = video?.processing_status;

  return (
    <SafeAreaView id="project-detail-container" style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View id="project-detail-header" style={styles.header}>
          <TouchableOpacity id="project-detail-back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Project Detail</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Processing Banner */}
        {status && status !== 'COMPLETED' && status !== 'FAILED' && (
          <TouchableOpacity
            style={styles.processingBanner}
            onPress={() => video && router.push(`/processing/${video.id}`)}
          >
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.processingText}>Processing your video...</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Failed Banner */}
        {status === 'FAILED' && (
          <View style={[styles.processingBanner, styles.failedBanner]}>
            <Ionicons name="warning" size={18} color={Colors.error} />
            <Text style={[styles.processingText, { color: Colors.error }]}>
              Processing failed. Please try uploading again.
            </Text>
          </View>
        )}

        {/* Stats */}
        {clips.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{clips.length}</Text>
              <Text style={styles.statLabel}>Clips</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {clips.filter(c => c.user_approved === true).length}
              </Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {Math.max(...clips.map(c => c.hook_score ?? 0)).toFixed(1)}
              </Text>
              <Text style={styles.statLabel}>Top Score</Text>
            </View>
          </View>
        )}

        {/* Edit Guidance */}
        {video?.edit_guidance && (
          <View id="project-edit-guidance" style={styles.guidanceCard}>
            <View id="project-edit-guidance-header" style={styles.guidanceHeader}>
              <Ionicons name="sparkles" size={18} color={Colors.primary} />
              <Text style={styles.guidanceTitle}>Long-Form Edit Guidance</Text>
            </View>
            <Text style={styles.guidanceText}>
              {video.edit_guidance.overall_feedback}
            </Text>
            {video.edit_guidance.suggestions && video.edit_guidance.suggestions.length > 0 && (
              <View id="project-edit-suggestions" style={styles.suggestionsContainer}>
                {video.edit_guidance.suggestions.map((s: EditGuidanceSuggestion, idx: number) => (
                  <View key={idx} id={`project-suggestion-${idx}`} style={styles.suggestionItem}>
                    <View style={styles.suggestionTimestamp}>
                      <Text style={styles.timestampText}>
                        {Math.floor(s.timestamp_seconds / 60)}:{String(Math.floor(s.timestamp_seconds % 60)).padStart(2, '0')}
                      </Text>
                    </View>
                    <View style={styles.suggestionContent}>
                      <View style={[styles.suggestionTypeBadge, {
                        backgroundColor: s.type === 'pattern_interrupt' ? '#FFF3E0' :
                          s.type === 'b_roll' ? '#E3F2FD' :
                          s.type === 'on_screen_graphic' ? '#F3E5F5' : '#E8F5E9',
                      }]}>
                        <Text style={[styles.suggestionTypeText, {
                          color: s.type === 'pattern_interrupt' ? '#E65100' :
                            s.type === 'b_roll' ? '#1565C0' :
                            s.type === 'on_screen_graphic' ? '#7B1FA2' : '#2E7D32',
                        }]}>
                          {s.type.replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <Text style={styles.suggestionText}>{s.suggestion}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Clips */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Generated Clips</Text>
          <Text style={styles.sectionSub}>Ordered by strategic posting rank</Text>
        </View>

        {clips.length === 0 && status === 'COMPLETED' && (
          <Text style={styles.emptyClips}>No clips were generated for this video.</Text>
        )}

        {clips.map(clip => (
          <ClipCard key={clip.id} clip={clip} onPress={() => handleClipPress(clip)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.bg },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:         { paddingBottom: 80 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  backBtn:        { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle:    { flex: 1, fontSize: 18, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  processingBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.primaryLight, padding: 14, margin: 16, borderRadius: 12 },
  processingText: { flex: 1, fontSize: 14, color: Colors.primary, fontWeight: '500' },
  failedBanner:   { backgroundColor: '#FFE5E5' },
  statsRow:       { flexDirection: 'row', padding: 16, gap: 12 },
  statItem:       { flex: 1, backgroundColor: Colors.white, borderRadius: 12, padding: 14, alignItems: 'center' },
  statValue:      { fontSize: 24, fontWeight: '800', color: Colors.text },
  statLabel:      { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  guidanceCard:   { margin: 16, marginTop: 0, backgroundColor: Colors.white, borderRadius: 14, padding: 16 },
  guidanceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  guidanceTitle:  { fontSize: 15, fontWeight: '700', color: Colors.text },
  guidanceText:   { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  suggestionsContainer: { marginTop: 14, gap: 10 },
  suggestionItem: { flexDirection: 'row', gap: 10 },
  suggestionTimestamp: { width: 42, paddingTop: 4 },
  timestampText: { fontSize: 12, fontWeight: '700', color: Colors.primary, fontVariant: ['tabular-nums'] },
  suggestionContent: { flex: 1 },
  suggestionTypeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  suggestionTypeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  suggestionText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  sectionHeader:  { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 8 },
  sectionTitle:   { fontSize: 17, fontWeight: '700', color: Colors.text },
  sectionSub:     { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  clipCard:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14, marginHorizontal: 16, marginBottom: 10, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1 },
  rankBadge:      { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rankText:       { fontSize: 12, fontWeight: '700', color: Colors.primary },
  clipInfo:       { flex: 1 },
  clipHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  clipTitle:      { fontSize: 15, fontWeight: '600', color: Colors.text },
  clipMeta:       { flexDirection: 'row', gap: 8, marginBottom: 6 },
  metaChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  scoreChip:      { backgroundColor: '#FFF3E0' },
  metaText:       { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  rationale:      { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  emptyClips:     { padding: 32, textAlign: 'center', color: Colors.textSecondary, fontSize: 15 },
});
