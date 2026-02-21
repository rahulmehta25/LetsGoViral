import React, { useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { videosApi } from '@/api/client';
import { Colors } from '@/constants/Colors';

const STEPS = [
  { status: 'PROCESSING',   label: 'Preparing video' },
  { status: 'TRANSCRIBING', label: 'Transcribing audio' },
  { status: 'ANALYZING',    label: 'AI analyzing content' },
  { status: 'CLIPPING',     label: 'Cutting clips with FFmpeg' },
  { status: 'COMPLETED',    label: 'Clips ready!' },
];

const STATUS_WEIGHT: Record<string, number> = {
  PENDING: 0, PROCESSING: 1, TRANSCRIBING: 2,
  ANALYZING: 3, CLIPPING: 4, COMPLETED: 5, FAILED: -1,
};

export default function ProcessingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: video } = useQuery({
    queryKey: ['video', id],
    queryFn:  () => videosApi.get(id!),
    enabled:  !!id,
    // Poll every 5 seconds while still processing; stop at COMPLETED/FAILED
    // Also stop after ~10 minutes (120 polls × 5 seconds)
    refetchInterval: (query) => {
      const status = query.state.data?.processing_status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 5000;
    },
    refetchIntervalInBackground: false,
    staleTime: 0,
  });

  const status = video?.processing_status ?? 'PENDING';
  const currentWeight = STATUS_WEIGHT[status] ?? 0;
  const progress = Math.max(0, (currentWeight / 5) * 100);

  // Auto-navigate when complete
  useEffect(() => {
    if (status === 'COMPLETED') {
      const timer = setTimeout(() => {
        router.replace(`/projects/${video?.project_id}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Back Button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={Colors.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.centerContent}>
          {/* Status Icon */}
          <View style={[styles.iconContainer, status === 'FAILED' && styles.iconFailed]}>
            {status === 'COMPLETED' ? (
              <Ionicons name="checkmark-circle" size={60} color={Colors.success} />
            ) : status === 'FAILED' ? (
              <Ionicons name="close-circle" size={60} color={Colors.error} />
            ) : (
              <ActivityIndicator size="large" color={Colors.primary} />
            )}
          </View>

          {/* Title */}
          <Text style={styles.statusTitle}>
            {status === 'COMPLETED' ? 'Your clips are ready!' :
             status === 'FAILED'    ? 'Processing failed' :
             'Analyzing your video...'}
          </Text>
          <Text style={styles.statusSub}>
            {status === 'COMPLETED' ? 'Redirecting you to your project...' :
             status === 'FAILED'    ? 'An error occurred. Please try again.' :
             "This usually takes 2–5 minutes. You can close the app."}
          </Text>

          {/* Progress Bar */}
          {status !== 'FAILED' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressPct}>{Math.round(progress)}%</Text>
            </View>
          )}

          {/* Step List */}
          <View style={styles.steps}>
            {STEPS.map((step, i) => {
              const stepWeight = i + 1;
              const done    = currentWeight > stepWeight;
              const active  = currentWeight === stepWeight;
              const pending = currentWeight < stepWeight;

              return (
                <View key={step.status} style={styles.stepRow}>
                  <View style={[
                    styles.stepIcon,
                    done   && styles.stepDone,
                    active && styles.stepActive,
                  ]}>
                    {done ? (
                      <Ionicons name="checkmark" size={14} color={Colors.white} />
                    ) : active ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.stepNum}>{i + 1}</Text>
                    )}
                  </View>
                  <Text style={[
                    styles.stepLabel,
                    done   && styles.stepLabelDone,
                    active && styles.stepLabelActive,
                    pending && styles.stepLabelPending,
                  ]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: Colors.bg },
  scroll:          { padding: 20, paddingBottom: 60 },
  backBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 32 },
  backText:        { fontSize: 16, color: Colors.text },
  centerContent:   { alignItems: 'center' },
  iconContainer:   { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  iconFailed:      { backgroundColor: '#FFE5E5' },
  statusTitle:     { fontSize: 24, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  statusSub:       { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280, marginBottom: 32 },
  progressContainer: { width: '100%', marginBottom: 32 },
  progressBar:     { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressFill:    { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  progressPct:     { fontSize: 13, color: Colors.textSecondary, textAlign: 'right', marginTop: 6 },
  steps:           { width: '100%', gap: 16 },
  stepRow:         { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepIcon:        { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  stepDone:        { backgroundColor: Colors.success },
  stepActive:      { backgroundColor: Colors.primary },
  stepNum:         { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  stepLabel:       { fontSize: 15, color: Colors.text },
  stepLabelDone:   { color: Colors.success },
  stepLabelActive: { color: Colors.primary, fontWeight: '600' },
  stepLabelPending:{ color: Colors.textTertiary },
});
