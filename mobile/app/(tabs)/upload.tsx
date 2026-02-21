import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { projectsApi, videosApi } from '@/api/client';

export default function UploadScreen() {
  const [projectName, setProjectName] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const queryClient = useQueryClient();

  const createProjectMutation = useMutation({
    mutationFn: async () => {
      const project = await projectsApi.create({ name: projectName.trim() });

      if (!selectedVideo) {
        return { projectId: project.id, videoId: null };
      }

      // Get signed upload URL from backend
      const fileSizeMB = selectedVideo.fileSize
        ? selectedVideo.fileSize / (1024 * 1024)
        : 0;
      const durationSeconds = selectedVideo.duration
        ? selectedVideo.duration / 1000
        : 0;

      const { video, signed_url } = await videosApi.getUploadUrl({
        project_id: project.id,
        filename: selectedVideo.fileName || 'video.mp4',
        content_type: 'video/mp4',
        file_size_mb: fileSizeMB,
        duration_seconds: durationSeconds,
      });

      // Upload directly to GCS
      await videosApi.uploadToGCS(
        signed_url,
        selectedVideo.uri,
        'video/mp4'
      );

      return { projectId: project.id, videoId: video.id };
    },
    onSuccess: ({ projectId, videoId }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectName('');
      setSelectedVideo(null);
      if (videoId) {
        router.push(`/processing/${videoId}`);
      } else {
        router.push(`/projects/${projectId}`);
      }
    },
    onError: (err: any) => {
      const message = err?.response?.data?.error || err?.message || 'Something went wrong';
      Alert.alert('Error', message);
    },
  });

  const handleSelectVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please grant access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const video = result.assets[0];
      
      // Validate size (2GB limit)
      if (video.fileSize && video.fileSize > 2 * 1024 * 1024 * 1024) {
        Alert.alert('File too large', 'Please select a video under 2 GB.');
        return;
      }

      // Validate duration (30 min limit)
      if (video.duration && video.duration > 30 * 60 * 1000) {
        Alert.alert('Video too long', 'Please select a video under 30 minutes.');
        return;
      }

      setSelectedVideo(video);
    }
  };

  const handleStartProcessing = () => {
    if (!projectName.trim()) {
      Alert.alert('Project name required', 'Please enter a name for your project.');
      return;
    }
    createProjectMutation.mutate();
  };

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Project</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {/* Project Name Input */}
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Project Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Podcast Interview with Jane"
            placeholderTextColor="#AEAEB2"
            value={projectName}
            onChangeText={setProjectName}
          />
        </View>

        {/* Upload Zone */}
        {!selectedVideo ? (
          <TouchableOpacity style={styles.uploadZone} onPress={handleSelectVideo}>
            <View style={styles.uploadIcon}>
              <Ionicons name="cloud-upload-outline" size={40} color="#FF00FF" />
            </View>
            <Text style={styles.uploadTitle}>Tap to upload</Text>
            <Text style={styles.uploadSubtitle}>Select a video from your gallery</Text>
            <View style={styles.uploadLimit}>
              <Text style={styles.uploadLimitText}>Max 30 min • Under 2 GB</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <Card style={styles.selectedCard}>
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => setSelectedVideo(null)}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.videoPreview}>
              <Ionicons name="videocam" size={48} color="rgba(255,255,255,0.5)" />
              {selectedVideo.duration && (
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>
                    {formatDuration(selectedVideo.duration)}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.videoInfo}>
              <Text style={styles.videoName} numberOfLines={1}>
                {selectedVideo.fileName || 'Selected Video'}
              </Text>
              <Text style={styles.videoMeta}>
                {selectedVideo.fileSize ? formatFileSize(selectedVideo.fileSize) : 'Unknown size'} • MP4
              </Text>
            </View>
          </Card>
        )}

        {/* Start Button */}
        <View style={styles.buttonContainer}>
          <Button
            fullWidth
            size="lg"
            onPress={handleStartProcessing}
            disabled={!projectName.trim() || createProjectMutation.isPending}
            isLoading={createProjectMutation.isPending}
          >
            {selectedVideo ? 'Upload & Process' : 'Create Project'}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 24,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  uploadZone: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 0, 255, 0.3)',
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  uploadIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 0, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  uploadSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
  },
  uploadLimit: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 8,
  },
  uploadLimitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#AEAEB2',
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#FF00FF',
    overflow: 'hidden',
    padding: 0,
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  videoPreview: {
    height: 180,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#FFFFFF',
  },
  videoInfo: {
    padding: 16,
  },
  videoName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  videoMeta: {
    fontSize: 14,
    color: '#8E8E93',
  },
  buttonContainer: {
    marginTop: 'auto',
  },
});
