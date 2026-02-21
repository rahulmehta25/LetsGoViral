import React from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { projectsApi } from '@/api/client';
import { useAppStore } from '@/store';
import { Colors } from '@/constants/Colors';
import type { Project } from '@/store';

function ProjectCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const videoCount = project.video_count ?? 0;
  const statusLabel = videoCount > 0 ? 'Ready' : 'Draft';
  const statusColor = videoCount > 0 ? Colors.success : Colors.textTertiary;

  return (
    <TouchableOpacity id={`project-card-${project.id}`} style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardThumbnail}>
        <Ionicons name="videocam" size={28} color={Colors.textTertiary} />
      </View>
      <View style={styles.cardInfo}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{project.name}</Text>
          <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-vertical" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.cardMeta}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
          <Text style={styles.dateText}>
            {'  ·  '}{videoCount} video{videoCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ProjectsScreen() {
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);

  const { data: projects = [], isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn:  projectsApi.list,
  });

  function handlePress(project: Project) {
    setSelectedProject(project.id);
    router.push(`/projects/${project.id}`);
  }

  return (
    <SafeAreaView id="projects-container" style={styles.container} edges={['top']}>
      {/* Header */}
      <View id="projects-header" style={styles.header}>
        <Text style={styles.headerTitle}>My Projects</Text>
        <TouchableOpacity
          id="projects-add-btn"
          style={styles.addBtn}
          onPress={() => router.push('/upload')}
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ProjectCard project={item} onPress={() => handlePress(item)} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="videocam-outline" size={64} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No projects yet</Text>
              <Text style={styles.emptyBody}>
                Upload your first video to start generating viral clips with AI.
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/upload')}
              >
                <Text style={styles.emptyBtnText}>Create Project</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },
  addBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  list:        { padding: 16, gap: 12, paddingBottom: 100 },
  card:        { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 14, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardThumbnail: { width: 70, height: 70, borderRadius: 12, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  cardInfo:    { flex: 1 },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle:   { fontSize: 16, fontWeight: '600', color: Colors.text, flex: 1, marginRight: 8 },
  cardMeta:    { flexDirection: 'row', alignItems: 'center' },
  statusDot:   { width: 7, height: 7, borderRadius: 4, marginRight: 5 },
  statusText:  { fontSize: 13, fontWeight: '500' },
  dateText:    { fontSize: 13, color: Colors.textSecondary },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:       { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle:  { fontSize: 20, fontWeight: '700', color: Colors.text, marginTop: 20, marginBottom: 8 },
  emptyBody:   { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyBtn:    { marginTop: 24, backgroundColor: Colors.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 28 },
  emptyBtnText:{ fontSize: 16, fontWeight: '700', color: Colors.white },
});
