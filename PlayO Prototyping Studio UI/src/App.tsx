import React, { useState } from 'react';
import { SplashScreen } from './screens/SplashScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { UploadScreen } from './screens/UploadScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { ChatScreen } from './screens/ChatScreen';
import { ProjectDetailScreen } from './screens/ProjectDetailScreen';
import { ClipReviewerScreen } from './screens/ClipReviewerScreen';
import { Home, Upload, MessageSquare, Film, LayoutGrid } from 'lucide-react';
import { Toast, ToastType } from './components/ui/Toast';
export type Screen =
'splash' |
'onboarding' |
'projects' |
'upload' |
'processing' |
'chat' |
'detail' |
'reviewer';
export interface Clip {
  id: number;
  rank: number;
  score: number;
  duration: string;
  status: 'pending' | 'approved' | 'rejected';
  rationale: string;
  title: string;
}
export interface Project {
  id: number;
  name: string;
  status: 'Draft' | 'Processing' | 'Ready';
  clips: Clip[];
  date: string;
  thumbnail: string;
}
const initialProjects: Project[] = [
{
  id: 1,
  name: 'Podcast Episode #42',
  status: 'Ready',
  date: '2h ago',
  thumbnail: 'bg-purple-100',
  clips: [
  {
    id: 101,
    rank: 1,
    score: 9.2,
    duration: '0:24',
    status: 'approved',
    rationale: 'Strong hook with high emotional valence.',
    title: 'Viral Clip #1'
  },
  {
    id: 102,
    rank: 2,
    score: 8.5,
    duration: '0:45',
    status: 'pending',
    rationale: 'Good pacing but CTA is weak.',
    title: 'Viral Clip #2'
  },
  {
    id: 103,
    rank: 3,
    score: 7.8,
    duration: '0:15',
    status: 'rejected',
    rationale: 'Audio clarity issues detected.',
    title: 'Viral Clip #3'
  }]

},
{
  id: 2,
  name: 'Product Demo Walkthrough',
  status: 'Processing',
  date: '5h ago',
  thumbnail: 'bg-blue-100',
  clips: []
},
{
  id: 3,
  name: 'Q&A Session Live',
  status: 'Draft',
  date: '1d ago',
  thumbnail: 'bg-orange-100',
  clips: []
}];

const navItems = [
{
  id: 'projects',
  label: 'Home',
  icon: Home
},
{
  id: 'upload',
  label: 'Upload',
  icon: Upload
},
{
  id: 'chat',
  label: 'Co-Pilot',
  icon: MessageSquare
},
{
  id: 'detail',
  label: 'Detail',
  icon: LayoutGrid
},
{
  id: 'reviewer',
  label: 'Review',
  icon: Film
}];

export function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: ToastType;
    visible: boolean;
  }>({
    message: '',
    type: 'info',
    visible: false
  });
  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({
      message,
      type,
      visible: true
    });
  };
  const hideToast = () => {
    setToast((prev) => ({
      ...prev,
      visible: false
    }));
  };
  const navigateTo = (screen: string) => {
    setCurrentScreen(screen as Screen);
  };
  const handleAddProject = (name: string) => {
    const newProject: Project = {
      id: Date.now(),
      name: name || 'Untitled Project',
      status: 'Processing',
      date: 'Just now',
      thumbnail: 'bg-green-100',
      clips: []
    };
    setProjects([newProject, ...projects]);
    setCurrentProjectId(newProject.id);
    navigateTo('processing');
  };
  const handleUpdateProjectStatus = (
  id: number,
  status: Project['status'],
  clips?: Clip[]) =>
  {
    setProjects(
      projects.map((p) =>
      p.id === id ?
      {
        ...p,
        status,
        clips: clips || p.clips
      } :
      p
      )
    );
  };
  const handleUpdateClipStatus = (
  projectId: number,
  clipId: number,
  status: Clip['status']) =>
  {
    setProjects(
      projects.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            clips: p.clips.map((c) =>
            c.id === clipId ?
            {
              ...c,
              status
            } :
            c
            )
          };
        }
        return p;
      })
    );
    if (status === 'approved') showToast('Clip approved!', 'success');
    if (status === 'rejected') showToast('Clip rejected', 'info');
  };
  const currentProject =
  projects.find((p) => p.id === currentProjectId) || projects[0];
  // Render current screen with transition
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
            onNavigate={navigateTo}
            onSelectProject={(id) => setCurrentProjectId(id)} />);


      case 'upload':
        return (
          <UploadScreen
            onNavigate={navigateTo}
            onStartProcessing={handleAddProject} />);


      case 'processing':
        return (
          <ProcessingScreen
            onNavigate={navigateTo}
            project={currentProject}
            onComplete={(clips) =>
            handleUpdateProjectStatus(currentProject.id, 'Ready', clips)
            } />);


      case 'chat':
        return <ChatScreen onNavigate={navigateTo} />;
      case 'detail':
        return (
          <ProjectDetailScreen
            onNavigate={navigateTo}
            project={currentProject}
            onUpdateClipStatus={(clipId, status) =>
            handleUpdateClipStatus(currentProject.id, clipId, status)
            }
            onExport={() =>
            showToast('Project exported successfully!', 'success')
            } />);


      case 'reviewer':
        return (
          <ClipReviewerScreen
            onNavigate={navigateTo}
            project={currentProject}
            onUpdateClipStatus={(clipId, status) =>
            handleUpdateClipStatus(currentProject.id, clipId, status)
            } />);


      default:
        return (
          <ProjectsScreen
            projects={projects}
            onNavigate={navigateTo}
            onSelectProject={setCurrentProjectId} />);


    }
  };
  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-sans text-foreground antialiased">
      {/* Main Content Area with Transitions */}
      <div className="relative w-full h-full bg-[#F5F5F5] transition-all duration-300 ease-in-out">
        {renderScreen()}
      </div>

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={hideToast} />


      {/* Floating Navigator (Only visible if not splash/onboarding) */}
      {currentScreen !== 'splash' && currentScreen !== 'onboarding' &&
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="flex items-center gap-1 bg-black/80 backdrop-blur-xl border border-white/10 rounded-full px-2 py-1.5 shadow-2xl">
            {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = currentScreen === id;
            return (
              <button
                key={id}
                onClick={() => navigateTo(id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium transition-all duration-300 ${isActive ? 'bg-[#00D4AA] text-black shadow-lg shadow-[#00D4AA]/30 transform scale-105' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>

                  <Icon className="w-4 h-4" />
                  <span className={isActive ? 'block' : 'hidden sm:block'}>
                    {label}
                  </span>
                </button>);

          })}
          </div>
        </div>
      }
    </div>);

}