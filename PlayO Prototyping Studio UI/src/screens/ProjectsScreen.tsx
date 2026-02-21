import React from 'react';
import { Plus, Video, Clock, MoreVertical, RefreshCw } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ProjectSummary } from '../types';

interface ProjectsScreenProps {
  projects: ProjectSummary[];
  isLoading: boolean;
  onRefresh: () => Promise<void>;
  onNavigate: (screen: string) => void;
  onSelectProject: (id: string) => void;
}

export function ProjectsScreen({
  projects,
  isLoading,
  onRefresh,
  onNavigate,
  onSelectProject,
}: ProjectsScreenProps) {
  const handleProjectClick = (project: ProjectSummary) => {
    onSelectProject(project.id);
  };

  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col overflow-hidden animate-fade-in">
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 flex items-center justify-between z-20 sticky top-0">
        <h1 className="text-xl font-bold text-gray-900">My Projects ({projects.length})</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onRefresh()}
            className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Refresh projects"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onNavigate('upload')}
            className="w-10 h-10 rounded-full bg-[#00D4AA] text-white flex items-center justify-center shadow-lg shadow-[#00D4AA]/20 hover:bg-[#00B390] transition-all hover:scale-105 active:scale-95"
          >
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-4 pb-24">
        {projects.map((project) => (
          <Card
            key={project.id}
            className="border-none shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group hover:-translate-y-1"
            onClick={() => handleProjectClick(project)}
            noPadding
          >
            <div className="flex p-4 gap-4 items-center">
              <div className="w-20 h-20 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                <Video className="text-gray-500 w-8 h-8" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-gray-900 truncate pr-2">{project.name}</h3>
                  <button className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={project.video_count > 0 ? 'success' : 'default'}>
                    {project.video_count > 0 ? 'Has videos' : 'Draft'}
                  </Badge>
                  <span className="text-xs text-gray-400 flex items-center">
                    <Clock className="w-3 h-3 mr-1" /> {new Date(project.updated_at).toLocaleString()}
                  </span>
                </div>

                <p className="text-xs text-gray-500 font-medium">
                  {project.video_count} video{project.video_count === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </Card>
        ))}

        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-32 h-32 bg-gray-200 rounded-full mb-6 animate-pulse" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">No projects yet</h3>
            <p className="text-gray-500 max-w-xs mb-6">
              Upload your first video to start creating viral clips with AI.
            </p>
            <button
              onClick={() => onNavigate('upload')}
              className="px-6 py-3 bg-[#00D4AA] text-white font-bold rounded-full shadow-lg shadow-[#00D4AA]/20 hover:bg-[#00B390] transition-colors"
            >
              Create Project
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
