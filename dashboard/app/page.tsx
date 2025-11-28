'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProjects, type Project } from '@/lib/api';
import { Search, Building2, Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  initializing: 'bg-blue-100 text-blue-700',
  researching: 'bg-yellow-100 text-yellow-700',
  analyzing: 'bg-purple-100 text-purple-700',
  synthesizing: 'bg-indigo-100 text-indigo-700',
  reviewing: 'bg-cyan-100 text-cyan-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  paused: 'bg-orange-100 text-orange-700',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4" />,
  initializing: <Loader2 className="w-4 h-4 animate-spin" />,
  researching: <Search className="w-4 h-4" />,
  analyzing: <Loader2 className="w-4 h-4 animate-spin" />,
  synthesizing: <Loader2 className="w-4 h-4 animate-spin" />,
  reviewing: <Loader2 className="w-4 h-4 animate-spin" />,
  completed: <CheckCircle2 className="w-4 h-4" />,
  failed: <XCircle className="w-4 h-4" />,
  paused: <AlertCircle className="w-4 h-4" />,
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
    // Refresh every 5 seconds for active projects
    const interval = setInterval(loadProjects, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadProjects() {
    try {
      const data = await getProjects();
      setProjects(data.projects);
      setError(null);
    } catch (err) {
      setError('Failed to load projects. Is the API server running?');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Research Projects</h1>
          <p className="text-gray-600 mt-1">Manage and monitor your commercial research workflows</p>
        </div>
        <Link
          href="/new"
          className="bg-primary-600 text-white hover:bg-primary-700 px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
        >
          <span>+</span>
          <span>New Research</span>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No research projects yet</h3>
          <p className="text-gray-600 mb-6">Start your first commercial research project</p>
          <Link
            href="/new"
            className="bg-primary-600 text-white hover:bg-primary-700 px-6 py-2 rounded-lg font-medium transition-colors inline-block"
          >
            Create Research Project
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <div className="bg-primary-100 p-3 rounded-lg">
                    <Building2 className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{project.name}</h3>
                    <p className="text-gray-600 text-sm mt-1">Target: {project.targetCompany}</p>
                    <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                      <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
                      {project.completedAt && (
                        <span>Completed {new Date(project.completedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${statusColors[project.status] || statusColors.pending}`}>
                    {statusIcons[project.status]}
                    <span className="capitalize">{project.status}</span>
                  </span>
                  {project.progress > 0 && project.progress < 100 && (
                    <div className="w-32">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Progress</span>
                        <span>{project.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-600 h-2 rounded-full transition-all"
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {project.currentPhase && project.status !== 'completed' && project.status !== 'failed' && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Current Phase:</span> {project.currentPhase}
                  </p>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
