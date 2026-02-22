import React, { useEffect, useMemo, useState } from 'react';
import { Home, Upload, MessageSquare, Film, LayoutGrid } from 'lucide-react';
import { SplashScreen } from './screens/SplashScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { UploadScreen } from './screens/UploadScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ProjectDetailScreen } from './screens/ProjectDetailScreen';
import { ClipReviewerScreen } from './screens/ClipReviewerScreen';
import { Toast, ToastType } from './components/ui/Toast';
import { webApi } from './lib/api';
import { Clip, ProjectSummary, Screen, VideoDetails } from './types';

const navItems = [
  { id: 'projects', label: 'Home', icon: Home },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'chat', label: 'Co-Pilot', icon: MessageSquare },
  { id: 'detail', label: 'Detail', icon: LayoutGrid },
  { id: 'reviewer', label: 'Review', icon: Film },
] as const;

export function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideo, setCurrentVideo] = useState<VideoDetails | null>(null);
  const [reviewerClipIndex, setReviewerClipIndex] = useState(0);
  const [toast, setToast] = useState({ message: '', type: 'info' as ToastType, visible: false });

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type, visible: true });
  };

  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));
  // Clips need the reviewer if they have start/end timestamps but no CDN URL yet
  // (new pipeline: processor saves candidates, user reviews, then ffmpeg cuts).
  // Old pipeline clips (cdn_url set during processing) skip straight to detail.
  const needsClipReview = (video: VideoDetails | null) => {
    const clips = video?.clips || [];
    if (clips.length === 0) return false;
    return clips.some((clip) => !clip.cdn_url && clip.start_time_seconds != null);
  };

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const data = await webApi.projects.list();
      setProjects(data);
      if (!currentProjectId && data[0]) setCurrentProjectId(data[0].id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to load projects', 'error');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    if (currentScreen === 'projects') {
      void loadProjects();
    }
  }, [currentScreen]);

  const loadProjectVideo = async (projectId: string) => {
    const details = await webApi.projects.get(projectId);
    const firstVideo = details.videos[0];

    if (!firstVideo) {
      setCurrentVideo(null);
      setCurrentVideoId(null);
      return;
    }

    setCurrentVideoId(firstVideo.id);
    const video = await webApi.videos.get(firstVideo.id);
    setCurrentVideo(video);
  };

  useEffect(() => {
    if (!currentProjectId) return;
    if (currentScreen !== 'detail' && currentScreen !== 'reviewer') return;

    void loadProjectVideo(currentProjectId).catch((error) => {
      showToast(error instanceof Error ? error.message : 'Failed to load project details', 'error');
    });
  }, [currentProjectId, currentScreen]);

  const navigateTo = (screen: string) => {
    const nextScreen = screen as Screen;
    if ((nextScreen === 'detail' || nextScreen === 'reviewer') && !currentProjectId) {
      showToast('Select or create a project first', 'info');
      return;
    }
    if (nextScreen === 'detail' && currentVideo && needsClipReview(currentVideo)) {
      showToast('Review timeline and approve cuts before viewing individual clips', 'info');
      setCurrentScreen('reviewer');
      return;
    }
    setCurrentScreen(nextScreen);
  };

  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) || null,
    [projects, currentProjectId],
  );

  const handleProjectSelected = async (projectId: string) => {
    setCurrentProjectId(projectId);
    try {
      const details = await webApi.projects.get(projectId);
      const firstVideo = details.videos[0];
      if (firstVideo) {
        setCurrentVideoId(firstVideo.id);
        if (firstVideo.processing_status === 'COMPLETED') {
          const fullVideo = await webApi.videos.get(firstVideo.id);
          setCurrentVideo(fullVideo);
          setCurrentScreen(needsClipReview(fullVideo) ? 'reviewer' : 'detail');
        } else {
          setCurrentScreen('processing');
        }
      } else {
        setCurrentScreen('upload');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to open project', 'error');
    }
  };

  const handleUploadComplete = async (projectId: string, videoId: string | null) => {
    setCurrentProjectId(projectId);
    setCurrentVideoId(videoId);
    await loadProjects();
    setCurrentScreen(videoId ? 'processing' : 'detail');
  };

  const handleProcessingComplete = async (video: VideoDetails) => {
    setCurrentVideo(video);
    setCurrentVideoId(video.id);
    await loadProjects();
    setCurrentScreen(needsClipReview(video) ? 'reviewer' : 'detail');
  };

  const handleFinalizeClips = async (
    clipEdits: Array<{ id: string; start_time_seconds: number; end_time_seconds: number }>,
  ) => {
    if (!currentVideoId) throw new Error('No video selected');
    await webApi.videos.finalizeClips(currentVideoId, clipEdits);
    const refreshed = await webApi.videos.get(currentVideoId);
    setCurrentVideo(refreshed);
    showToast('Clips finalized with ffmpeg', 'success');
    setCurrentScreen('detail');
  };

  const openReviewer = (clip: Clip) => {
    if (!currentVideo) return;
    const index = currentVideo.clips.findIndex((item) => item.id === clip.id);
    setReviewerClipIndex(index >= 0 ? index : 0);
    setCurrentScreen('reviewer');
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'splash':
        return <SplashScreen onComplete={() => navigateTo('onboarding')} />;
      case 'onboarding':
        return <OnboardingScreen onContinue={() => navigateTo('projects')} />;
      case 'projects':
        return (
          <ProjectsScreen
            projects={projects}
            isLoading={isLoadingProjects}
            onRefresh={loadProjects}
            onNavigate={navigateTo}
            onSelectProject={handleProjectSelected}
          />
        );
      case 'upload':
        return (
          <UploadScreen
            onNavigate={navigateTo}
            onComplete={handleUploadComplete}
            defaultName={currentProject?.name || ''}
          />
        );
      case 'processing':
        return (
          <ProcessingScreen
            onNavigate={navigateTo}
            videoId={currentVideoId}
            projectName={currentProject?.name || 'Project'}
            onComplete={handleProcessingComplete}
            onError={(message) => showToast(message, 'error')}
          />
        );
      case 'chat':
        return (
          <ChatScreen
            onNavigate={navigateTo}
            projectId={currentProjectId}
            onError={(message) => showToast(message, 'error')}
          />
        );
      case 'detail':
        if (currentVideo && needsClipReview(currentVideo)) {
          return (
            <ClipReviewerScreen
              onNavigate={navigateTo}
              video={currentVideo}
              startIndex={reviewerClipIndex}
              onFinalize={handleFinalizeClips}
              onError={(message) => showToast(message, 'error')}
            />
          );
        }
        return (
          <ProjectDetailScreen
            onNavigate={navigateTo}
            projectName={currentProject?.name || 'Project Detail'}
            video={currentVideo}
            onOpenReviewer={openReviewer}
          />
        );
      case 'reviewer':
        return (
          <ClipReviewerScreen
            onNavigate={navigateTo}
            video={currentVideo}
            startIndex={reviewerClipIndex}
            onFinalize={handleFinalizeClips}
            onError={(message) => showToast(message, 'error')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-sans text-foreground antialiased">
      <div className="relative w-full h-full bg-[#F5F5F5] transition-all duration-300 ease-in-out">{renderScreen()}</div>

      <Toast message={toast.message} type={toast.type} visible={toast.visible} onDismiss={hideToast} />

      {currentScreen !== 'splash' && currentScreen !== 'onboarding' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="flex items-center gap-1 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1.5 shadow-2xl">
            {navItems.map(({ id, label, icon: Icon }) => {
              const isActive = currentScreen === id;
              return (
                <button
                  key={id}
                  onClick={() => navigateTo(id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all duration-300 ${
                    isActive
                      ? 'bg-[#00D4AA] text-black shadow-lg shadow-[#00D4AA]/30 transform scale-105'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className={isActive ? 'block' : 'hidden sm:block'}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
