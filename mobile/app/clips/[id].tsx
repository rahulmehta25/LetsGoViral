import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// Mock clip data
const mockClip = {
  id: '1',
  rank: 1,
  score: 9.5,
  duration: '0:32',
  title: 'Viral Clip #1',
  rationale: 'Perfect hook with high retention probability. The opening 3 seconds contain a strong pattern interrupt that grabs attention immediately.',
};

export default function ClipReviewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeTab, setActiveTab] = useState('AI Rationale');

  const handleAction = (action: 'approve' | 'reject') => {
    // TODO: Implement actual action
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* Video Player Area */}
      <TouchableOpacity 
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={() => setIsPlaying(!isPlaying)}
      >
        {/* Header Overlay */}
        <SafeAreaView style={styles.headerOverlay}>
          <TouchableOpacity
            style={styles.overlayBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.clipCounter}>
            <Text style={styles.clipCounterText}>Clip #1 of 3</Text>
          </View>
          <TouchableOpacity style={styles.overlayBtn}>
            <Ionicons name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Play/Pause Indicator */}
        {!isPlaying && (
          <View style={styles.playIndicator}>
            <View style={styles.playButton}>
              <Ionicons name="play" size={32} color="#fff" style={{ marginLeft: 4 }} />
            </View>
          </View>
        )}

        {/* Video Placeholder */}
        <View style={styles.videoPlaceholder}>
          <Text style={styles.videoPlaceholderText}>VIDEO</Text>
        </View>
      </TouchableOpacity>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {/* Drag Handle */}
        <View style={styles.dragHandle} />

        <View style={styles.sheetContent}>
          {/* Title & Score */}
          <View style={styles.titleRow}>
            <Text style={styles.clipTitle}>{mockClip.title}</Text>
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>Hook Score</Text>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreValue}>{mockClip.score}/10</Text>
              </View>
            </View>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            {['Details', 'AI Rationale'].map(tab => (
              <TouchableOpacity
                key={tab}
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
          <View style={styles.rationaleContainer}>
            <Text style={styles.rationaleText}>{mockClip.rationale}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleAction('reject')}
            >
              <Ionicons name="close" size={20} color="#6B7280" />
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => handleAction('approve')}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.approveButtonText}>Approve</Text>
            </TouchableOpacity>
          </View>

          {/* Navigation */}
          <View style={styles.navigation}>
            <TouchableOpacity style={styles.navBtn}>
              <Ionicons name="chevron-back" size={14} color="#9CA3AF" />
              <Text style={styles.navText}>Prev Clip</Text>
            </TouchableOpacity>
            <Text style={styles.swipeHint}>Swipe for next</Text>
            <TouchableOpacity style={styles.navBtn}>
              <Text style={styles.navText}>Next Clip</Text>
              <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
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
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholderText: {
    fontSize: 48,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.1)',
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
    marginBottom: 16,
  },
  clipTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
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
  navText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  swipeHint: {
    fontSize: 12,
    color: '#D1D5DB',
  },
});
