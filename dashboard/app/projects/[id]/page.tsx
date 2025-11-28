'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getProject, getFindings, pauseProject, type ProjectDetail, type Finding } from '@/lib/api';
import { connectSocket, subscribeToProject, unsubscribeFromProject, onProjectEvent, type WebSocketEvent } from '@/lib/socket';
import {
  Loader2,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Search,
  BarChart3,
  Users,
  FileText,
  Pause,
  RefreshCw,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  idle: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
};

const agentIcons: Record<string, React.ReactNode> = {
  web_researcher: <Search className="w-5 h-5" />,
  financial_analyst: <BarChart3 className="w-5 h-5" />,
  competitive_intelligence: <Users className="w-5 h-5" />,
  report_generator: <FileText className="w-5 h-5" />,
};

const confidenceColors: Record<string, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-red-100 text-red-700',
};

export default function ProjectPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'report'>('overview');

  const loadProject = useCallback(async () => {
    try {
      const data = await getProject(projectId);
      setProject(data);
      setError(null);
    } catch (err) {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadFindings = useCallback(async () => {
    try {
      const data = await getFindings(projectId);
      setFindings(data.findings);
    } catch {
      // Findings may not be available yet
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
    loadFindings();

    // Connect to WebSocket for real-time updates
    connectSocket();
    subscribeToProject(projectId);

    const unsubscribe = onProjectEvent((event: WebSocketEvent) => {
      if (event.projectId === projectId) {
        // Reload project on any event
        loadProject();
        if (event.type === 'finding:discovered') {
          loadFindings();
        }
      }
    });

    // Refresh every 10 seconds as backup
    const interval = setInterval(() => {
      loadProject();
      loadFindings();
    }, 10000);

    return () => {
      unsubscribeFromProject(projectId);
      unsubscribe();
      clearInterval(interval);
    };
  }, [projectId, loadProject, loadFindings]);

  const handlePause = async () => {
    try {
      await pauseProject(projectId);
      loadProject();
    } catch {
      setError('Failed to pause project');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
        {error || 'Project not found'}
      </div>
    );
  }

  const { project: projectData, scopingDocument, report } = project;

  return (
    <div>
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="bg-primary-100 p-3 rounded-lg">
              <Building2 className="w-8 h-8 text-primary-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{scopingDocument.projectName}</h1>
              <p className="text-gray-600 mt-1">Target: {scopingDocument.targetCompany.name}</p>
              <p className="text-sm text-gray-500 mt-2">{scopingDocument.researchObjective}</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${
              projectData.status === 'completed' ? 'bg-green-100 text-green-700' :
              projectData.status === 'failed' ? 'bg-red-100 text-red-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {projectData.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
               projectData.status === 'failed' ? <XCircle className="w-4 h-4" /> :
               <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="capitalize">{projectData.status}</span>
            </span>
            {projectData.status !== 'completed' && projectData.status !== 'failed' && projectData.status !== 'paused' && (
              <button
                onClick={handlePause}
                className="flex items-center space-x-1 px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            )}
            <button
              onClick={loadProject}
              className="p-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        {projectData.progress > 0 && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>{projectData.currentPhase}</span>
              <span>{projectData.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${projectData.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['overview', 'findings', 'report'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md font-medium transition-colors capitalize ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Agents Status */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Research Agents</h2>
            <div className="space-y-4">
              {projectData.agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      agent.status === 'active' ? 'bg-blue-100 text-blue-600' :
                      agent.status === 'completed' ? 'bg-green-100 text-green-600' :
                      agent.status === 'error' ? 'bg-red-100 text-red-600' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {agentIcons[agent.type] || <Search className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{agent.name}</p>
                      {agent.currentTask && (
                        <p className="text-sm text-gray-500 truncate max-w-[200px]">{agent.currentTask}</p>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[agent.status]}`}>
                    {agent.status === 'active' && <Loader2 className="w-3 h-3 animate-spin inline mr-1" />}
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Key Questions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Questions</h2>
            <div className="space-y-3">
              {scopingDocument.keyQuestions.map((q, index) => (
                <div key={q.id} className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-sm font-medium flex items-center justify-center">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-gray-900">{q.question}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        q.priority === 'critical' ? 'bg-red-100 text-red-700' :
                        q.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        q.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {q.priority}
                      </span>
                      <span className="text-xs text-gray-500">{q.category}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Research Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-primary-600">{projectData.findingsCount}</p>
                <p className="text-sm text-gray-600">Findings</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-primary-600">{projectData.metadata.totalSources}</p>
                <p className="text-sm text-gray-600">Sources</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-primary-600">{projectData.errorsCount}</p>
                <p className="text-sm text-gray-600">Errors</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-primary-600">{projectData.metadata.totalTokensUsed.toLocaleString()}</p>
                <p className="text-sm text-gray-600">Tokens Used</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'findings' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Research Findings ({findings.length})</h2>
          {findings.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No findings yet. Research is in progress...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {findings.map((finding) => (
                <div key={finding.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium text-gray-900">{finding.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${confidenceColors[finding.confidence]}`}>
                      {finding.confidence} confidence
                    </span>
                  </div>
                  <p className="text-gray-600 mt-2">{finding.summary}</p>
                  <div className="flex items-center space-x-4 mt-3 text-sm text-gray-500">
                    <span className="flex items-center space-x-1">
                      {agentIcons[finding.agentType]}
                      <span>{finding.agentType.replace(/_/g, ' ')}</span>
                    </span>
                    <span>{finding.category}</span>
                    <span>{finding.sources.length} sources</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'report' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {report ? (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">{report.title}</h2>

              {/* Executive Summary */}
              <section className="mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Executive Summary</h3>
                <p className="text-gray-700 leading-relaxed">{report.executiveSummary}</p>
              </section>

              {/* Key Insights */}
              {report.keyInsights.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Insights</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {report.keyInsights.map((insight, index) => (
                      <li key={index} className="text-gray-700">{insight}</li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Report Sections */}
              {report.sections.map((section) => (
                <section key={section.id} className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">{section.title}</h3>
                  <div className="text-gray-700 leading-relaxed whitespace-pre-wrap">{section.content}</div>
                </section>
              ))}

              {/* Recommendations */}
              {report.recommendations.length > 0 && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommendations</h3>
                  <ul className="list-disc list-inside space-y-2">
                    {report.recommendations.map((rec, index) => (
                      <li key={index} className="text-gray-700">{rec}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              {projectData.status === 'completed' ? (
                <p>Report generation failed. Please try again.</p>
              ) : (
                <p>Report will be generated when research is complete.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
