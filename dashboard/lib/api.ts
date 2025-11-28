const API_URL = process.env.API_URL || 'http://localhost:3001';

export interface Project {
  id: string;
  name: string;
  targetCompany: string;
  status: string;
  progress: number;
  currentPhase: string;
  createdAt: string;
  completedAt?: string;
}

export interface ProjectDetail {
  project: Project & {
    agents: AgentStatus[];
    findingsCount: number;
    errorsCount: number;
    metadata: {
      startedAt: string;
      completedAt?: string;
      totalTokensUsed: number;
      totalSearches: number;
      totalSources: number;
    };
  };
  scopingDocument: ScopingDocument;
  report: Report | null;
}

export interface AgentStatus {
  id: string;
  type: string;
  name: string;
  status: 'idle' | 'active' | 'completed' | 'error';
  currentTask: string | null;
  progress: number;
  tokensUsed: number;
}

export interface ScopingDocument {
  id: string;
  projectName: string;
  targetCompany: {
    name: string;
    website?: string;
    industry?: string;
  };
  client: {
    name: string;
  };
  researchObjective: string;
  keyQuestions: KeyQuestion[];
}

export interface KeyQuestion {
  id: string;
  question: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

export interface Finding {
  id: string;
  title: string;
  summary: string;
  content: string;
  confidence: 'high' | 'medium' | 'low';
  category: string;
  agentType: string;
  sources: Source[];
}

export interface Source {
  id: string;
  type: string;
  url?: string;
  title: string;
  relevanceScore: number;
}

export interface Report {
  id: string;
  title: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyInsights: string[];
  recommendations: string[];
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
}

// API Functions

export async function getProjects(): Promise<{ projects: Project[]; total: number }> {
  const res = await fetch(`${API_URL}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const res = await fetch(`${API_URL}/api/projects/${id}`);
  if (!res.ok) throw new Error('Failed to fetch project');
  return res.json();
}

export async function getFindings(projectId: string): Promise<{ findings: Finding[]; total: number }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/findings`);
  if (!res.ok) throw new Error('Failed to fetch findings');
  return res.json();
}

export async function getSources(projectId: string): Promise<{ sources: Source[]; total: number }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/sources`);
  if (!res.ok) throw new Error('Failed to fetch sources');
  return res.json();
}

export async function getReport(projectId: string): Promise<{ report: Report }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/report`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export async function createProject(data: {
  targetCompany: string;
  questions: string[];
  clientName?: string;
  objective?: string;
}): Promise<{ success: boolean; projectId: string; project: Project }> {
  const res = await fetch(`${API_URL}/api/projects/quick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to create project');
  }
  return res.json();
}

export async function createProjectFromDocument(document: string, format?: string): Promise<{ success: boolean; projectId: string; project: Project }> {
  const res = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawDocument: document, format }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Failed to create project');
  }
  return res.json();
}

export async function pauseProject(projectId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/projects/${projectId}/pause`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to pause project');
  return res.json();
}

export async function getTemplate(format: 'json' | 'yaml' = 'json'): Promise<string> {
  const res = await fetch(`${API_URL}/api/templates/scoping?format=${format}`);
  if (!res.ok) throw new Error('Failed to fetch template');
  if (format === 'yaml') {
    return res.text();
  }
  const data = await res.json();
  return JSON.stringify(data, null, 2);
}
