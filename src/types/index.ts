import { z } from 'zod';

// ============================================================================
// Scoping Document Types
// ============================================================================

export const KeyQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  category: z.enum([
    'financial',
    'competitive',
    'market',
    'leadership',
    'technology',
    'legal',
    'operational',
    'reputation',
    'custom'
  ]),
  subQuestions: z.array(z.string()).optional(),
  dataSources: z.array(z.string()).optional(),
});

export const ScopingDocumentSchema = z.object({
  id: z.string(),
  projectName: z.string(),
  targetCompany: z.object({
    name: z.string(),
    website: z.string().optional(),
    industry: z.string().optional(),
    headquarters: z.string().optional(),
    aliases: z.array(z.string()).optional(),
  }),
  client: z.object({
    name: z.string(),
    contactEmail: z.string().optional(),
  }),
  researchObjective: z.string(),
  keyQuestions: z.array(KeyQuestionSchema),
  additionalContext: z.string().optional(),
  dataSources: z.object({
    webSearch: z.boolean().default(true),
    newsArticles: z.boolean().default(true),
    financialReports: z.boolean().default(true),
    socialMedia: z.boolean().default(false),
    patents: z.boolean().default(false),
    courtRecords: z.boolean().default(false),
    customSources: z.array(z.string()).optional(),
  }),
  outputFormat: z.enum(['detailed_report', 'executive_summary', 'data_export', 'all']).default('detailed_report'),
  deadline: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type KeyQuestion = z.infer<typeof KeyQuestionSchema>;
export type ScopingDocument = z.infer<typeof ScopingDocumentSchema>;

// ============================================================================
// Research Project Types
// ============================================================================

export type ResearchStatus =
  | 'pending'
  | 'initializing'
  | 'researching'
  | 'analyzing'
  | 'synthesizing'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'paused';

export interface ResearchProject {
  id: string;
  scopingDocument: ScopingDocument;
  status: ResearchStatus;
  progress: number; // 0-100
  currentPhase: string;
  agents: AgentStatus[];
  findings: ResearchFinding[];
  report: ResearchReport | null;
  errors: ResearchError[];
  metadata: {
    startedAt: string;
    completedAt?: string;
    totalTokensUsed: number;
    totalSearches: number;
    totalSources: number;
  };
}

export interface AgentStatus {
  id: string;
  type: AgentType;
  name: string;
  status: 'idle' | 'active' | 'completed' | 'error';
  currentTask: string | null;
  progress: number;
  tokensUsed: number;
  startedAt?: string;
  completedAt?: string;
}

export type AgentType =
  | 'orchestrator'
  | 'web_researcher'
  | 'financial_analyst'
  | 'competitive_intelligence'
  | 'news_monitor'
  | 'data_synthesizer'
  | 'report_generator'
  | 'quality_reviewer';

// ============================================================================
// Research Findings Types
// ============================================================================

export interface ResearchFinding {
  id: string;
  projectId: string;
  questionId: string;
  agentId: string;
  agentType: AgentType;
  category: string;
  title: string;
  content: string;
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  sources: Source[];
  relatedFindings: string[];
  metadata: {
    discoveredAt: string;
    lastUpdated: string;
    searchQuery?: string;
    rawData?: unknown;
  };
  embedding?: number[];
}

export interface Source {
  id: string;
  type: 'web' | 'document' | 'api' | 'database' | 'news' | 'financial_report' | 'social_media';
  url?: string;
  title: string;
  author?: string;
  publishedDate?: string;
  accessedAt: string;
  relevanceScore: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Research Report Types
// ============================================================================

export interface ResearchReport {
  id: string;
  projectId: string;
  title: string;
  executiveSummary: string;
  sections: ReportSection[];
  keyInsights: string[];
  riskFactors: RiskFactor[];
  recommendations: string[];
  appendices: Appendix[];
  metadata: {
    generatedAt: string;
    wordCount: number;
    sourcesCount: number;
    confidenceScore: number;
  };
}

export interface ReportSection {
  id: string;
  title: string;
  content: string;
  findings: string[]; // Finding IDs
  subsections?: ReportSection[];
}

export interface RiskFactor {
  id: string;
  category: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: 'certain' | 'likely' | 'possible' | 'unlikely';
  mitigation?: string;
  sources: string[];
}

export interface Appendix {
  id: string;
  title: string;
  type: 'data_table' | 'chart' | 'timeline' | 'source_list' | 'methodology';
  content: unknown;
}

// ============================================================================
// Error Types
// ============================================================================

export interface ResearchError {
  id: string;
  projectId: string;
  agentId?: string;
  type: 'api_error' | 'rate_limit' | 'timeout' | 'validation' | 'source_unavailable' | 'internal';
  message: string;
  details?: unknown;
  recoverable: boolean;
  occurredAt: string;
  resolvedAt?: string;
}

// ============================================================================
// Agent Memory Types (for AgentDB)
// ============================================================================

export interface MemoryEntry {
  id: string;
  projectId: string;
  agentId: string;
  type: 'finding' | 'insight' | 'task' | 'context' | 'source' | 'error';
  content: string;
  metadata: Record<string, unknown>;
  embedding?: number[];
  createdAt: string;
  expiresAt?: string;
}

export interface SharedContext {
  projectId: string;
  targetCompany: string;
  keyQuestions: KeyQuestion[];
  completedTasks: string[];
  pendingTasks: string[];
  discoveredInsights: string[];
  sourceRegistry: Map<string, Source>;
}

// ============================================================================
// API Types
// ============================================================================

export interface CreateProjectRequest {
  scopingDocument: Omit<ScopingDocument, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface ProjectListResponse {
  projects: ResearchProject[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProjectDetailResponse {
  project: ResearchProject;
  liveUpdates: boolean;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

export type WebSocketEventType =
  | 'project:created'
  | 'project:updated'
  | 'project:completed'
  | 'project:failed'
  | 'agent:started'
  | 'agent:progress'
  | 'agent:completed'
  | 'agent:error'
  | 'finding:discovered'
  | 'finding:updated'
  | 'report:generating'
  | 'report:completed';

export interface WebSocketEvent {
  type: WebSocketEventType;
  projectId: string;
  payload: unknown;
  timestamp: string;
}
