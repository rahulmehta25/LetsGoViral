import React from 'react';
import { Plus, Video, Clock, MoreVertical, RefreshCw } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Project } from '../App';
interface ProjectsScreenProps {
  projects: Project[];
  onNavigate: (screen: string) => void;
  onSelectProject: (id: number) => void;
}
export function ProjectsScreen({
  projects,
  onNavigate,
  onSelectProject
}: ProjectsScreenProps) {
  const handleProjectClick = (project: Project) => {
    onSelectProject(project.id);
    if (project.status === 'Ready') onNavigate('detail');else
    if (project.status === 'Processing') onNavigate('processing');else
    onNavigate('upload');
  };
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'success';
      case 'Processing':
        return 'warning';
      case 'Draft':
        return 'default';
      default:
        return 'default';
    }
  };
  return (
    <div className="fixed inset-0 bg-[#F5F5F5] flex flex-col overflow-hidden animate-fade-in">
      {/* Top Bar */}
      <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 flex items-center justify-between z-20 sticky top-0">
        <h1 className="text-xl font-bold text-gray-900">
          My Projects ({projects.length})
        </h1>
        <button
          onClick={() => onNavigate('upload')}
          className="w-10 h-10 rounded-full bg-[#00D4AA] text-white flex items-center justify-center shadow-lg shadow-[#00D4AA]/20 hover:bg-[#00B390] transition-all hover:scale-105 active:scale-95">

          <Plus className="w-6 h-6" />
        </button>
      </header>

      {/* Pull to refresh hint */}
      <div className="flex justify-center py-2 opacity-0 hover:opacity-100 transition-opacity">
        <RefreshCw className="w-4 h-4 text-gray-400 animate-spin" />
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-4 pb-24">
        {projects.map((project) =>
        <Card
          key={project.id}
          className="border-none shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden group hover:-translate-y-1"
          onClick={() => handleProjectClick(project)}
          noPadding>

            <div className="flex p-4 gap-4 items-center">
              {/* Thumbnail */}
              <div
              className={`w-20 h-20 rounded-xl ${project.thumbnail} flex items-center justify-center flex-shrink-0 relative overflow-hidden`}>

                <Video className="text-gray-400 w-8 h-8 opacity-50" />
                {project.status === 'Processing' &&
              <div className="absolute inset-0 bg-black/10 animate-pulse" />
              }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-gray-900 truncate pr-2">
                    {project.name}
                  </h3>
                  <button className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={getStatusVariant(project.status)}>
                    {project.status}
                  </Badge>
                  <span className="text-xs text-gray-400 flex items-center">
                    <Clock className="w-3 h-3 mr-1" /> {project.date}
                  </span>
                </div>

                {project.clips.length > 0 &&
              <p className="text-xs text-gray-500 font-medium">
                    {project.clips.length} clips generated
                  </p>
              }
              </div>
            </div>
          </Card>
        )}

        {/* Empty State Illustration Placeholder */}
        {projects.length === 0 &&
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-32 h-32 bg-gray-200 rounded-full mb-6 animate-pulse" />
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              No projects yet
            </h3>
            <p className="text-gray-500 max-w-xs mb-6">
              Upload your first video to start creating viral clips with AI.
            </p>
            <button
            onClick={() => onNavigate('upload')}
            className="px-6 py-3 bg-[#00D4AA] text-white font-bold rounded-full shadow-lg shadow-[#00D4AA]/20 hover:bg-[#00B390] transition-colors">

              Create Project
            </button>
          </div>
        }
      </main>
    </div>);

}