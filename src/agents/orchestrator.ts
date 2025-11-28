import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { AgentDBClient, getAgentDB } from '../memory/agentdb-client.js';
import { WebResearcherAgent } from './web-researcher.js';
import { FinancialAnalystAgent } from './financial-analyst.js';
import { CompetitiveIntelligenceAgent } from './competitive-intelligence.js';
import { ReportGeneratorAgent } from './report-generator.js';
import type { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import type {
  ScopingDocument,
  ResearchProject,
  AgentStatus,
  ResearchStatus,
  KeyQuestion,
  WebSocketEvent,
  WebSocketEventType,
} from '../types/index.js';

interface OrchestratorConfig {
  maxConcurrentAgents: number;
  maxResearchDepth: number;
  dbPath?: string;
}

interface TaskDefinition {
  id: string;
  agentType: string;
  context: AgentContext;
  priority: number;
  dependencies: string[];
}

/**
 * Research Orchestrator
 *
 * Coordinates the multi-agent research workflow:
 * 1. Parses scoping document and creates research plan
 * 2. Dispatches specialized agents for each research area
 * 3. Manages shared memory and context via AgentDB
 * 4. Synthesizes findings into final report
 * 5. Emits real-time progress updates
 */
export class ResearchOrchestrator extends EventEmitter {
  private config: OrchestratorConfig;
  private memory: AgentDBClient;
  private agents: Map<string, BaseAgent>;
  private activeProjects: Map<string, ResearchProject>;
  private taskQueue: TaskDefinition[];
  private runningTasks: Set<string>;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    super();
    this.config = {
      maxConcurrentAgents: config.maxConcurrentAgents || 5,
      maxResearchDepth: config.maxResearchDepth || 3,
      dbPath: config.dbPath,
    };

    this.memory = getAgentDB(this.config.dbPath);
    this.agents = new Map();
    this.activeProjects = new Map();
    this.taskQueue = [];
    this.runningTasks = new Set();

    this.initializeAgents();
  }

  private initializeAgents(): void {
    // Create agent instances
    this.agents.set('web_researcher', new WebResearcherAgent(this.memory));
    this.agents.set('financial_analyst', new FinancialAnalystAgent(this.memory));
    this.agents.set('competitive_intelligence', new CompetitiveIntelligenceAgent(this.memory));
    this.agents.set('report_generator', new ReportGeneratorAgent(this.memory));
  }

  /**
   * Start a new research project from a scoping document
   */
  async startProject(scopingDocument: ScopingDocument): Promise<ResearchProject> {
    const projectId = scopingDocument.id || uuidv4();

    // Initialize project in database
    this.memory.createProject(
      projectId,
      scopingDocument.projectName,
      scopingDocument.targetCompany.name,
      scopingDocument
    );

    // Create project state
    const project: ResearchProject = {
      id: projectId,
      scopingDocument,
      status: 'initializing',
      progress: 0,
      currentPhase: 'Initializing research workflow',
      agents: this.createAgentStatuses(),
      findings: [],
      report: null,
      errors: [],
      metadata: {
        startedAt: new Date().toISOString(),
        totalTokensUsed: 0,
        totalSearches: 0,
        totalSources: 0,
      },
    };

    this.activeProjects.set(projectId, project);
    this.emitEvent('project:created', projectId, { project });

    // Start the research workflow
    this.executeWorkflow(project).catch(error => {
      this.handleProjectError(project, error);
    });

    return project;
  }

  /**
   * Execute the full research workflow
   */
  private async executeWorkflow(project: ResearchProject): Promise<void> {
    try {
      // Phase 1: Planning
      await this.planResearch(project);

      // Phase 2: Primary Research (Web + Initial Analysis)
      await this.executePrimaryResearch(project);

      // Phase 3: Deep Analysis (Financial + Competitive)
      await this.executeDeepAnalysis(project);

      // Phase 4: Synthesis and Reporting
      await this.generateReport(project);

      // Phase 5: Finalization
      await this.finalizeProject(project);
    } catch (error) {
      this.handleProjectError(project, error);
    }
  }

  /**
   * Phase 1: Plan the research based on scoping document
   */
  private async planResearch(project: ResearchProject): Promise<void> {
    this.updateProjectStatus(project, 'initializing', 5, 'Planning research strategy');

    const tasks: TaskDefinition[] = [];
    const { keyQuestions, targetCompany, dataSources } = project.scopingDocument;

    // Create tasks for each key question
    for (const question of keyQuestions) {
      // Determine which agents should handle this question
      const agentTypes = this.determineAgentsForQuestion(question);

      for (const agentType of agentTypes) {
        tasks.push({
          id: uuidv4(),
          agentType,
          context: {
            projectId: project.id,
            targetCompany: targetCompany.name,
            questionId: question.id,
            question: question.question,
            additionalContext: question.subQuestions?.join('; '),
          },
          priority: this.questionPriorityToNumber(question.priority),
          dependencies: [],
        });
      }
    }

    // Add general research tasks if enabled
    if (dataSources.webSearch) {
      tasks.push({
        id: uuidv4(),
        agentType: 'web_researcher',
        context: {
          projectId: project.id,
          targetCompany: targetCompany.name,
          question: `General company research and background on ${targetCompany.name}`,
        },
        priority: 2,
        dependencies: [],
      });
    }

    if (dataSources.financialReports) {
      tasks.push({
        id: uuidv4(),
        agentType: 'financial_analyst',
        context: {
          projectId: project.id,
          targetCompany: targetCompany.name,
          question: `Financial overview and health assessment of ${targetCompany.name}`,
        },
        priority: 2,
        dependencies: [],
      });
    }

    // Store pending tasks
    const pendingTasks = tasks.map(t => `${t.agentType}: ${t.context.question}`);
    this.memory.updateSharedContext(project.id, { pendingTasks });

    // Queue tasks by priority
    this.taskQueue = tasks.sort((a, b) => b.priority - a.priority);

    this.updateProjectStatus(project, 'researching', 10, 'Research plan created');
  }

  /**
   * Phase 2: Execute primary research tasks
   */
  private async executePrimaryResearch(project: ResearchProject): Promise<void> {
    this.updateProjectStatus(project, 'researching', 15, 'Executing primary research');

    // Get web research and general tasks
    const primaryTasks = this.taskQueue.filter(
      t => t.agentType === 'web_researcher' && t.dependencies.length === 0
    );

    // Execute primary tasks with concurrency control
    await this.executeTaskBatch(project, primaryTasks, 'Primary research');

    this.updateProjectStatus(project, 'researching', 40, 'Primary research completed');
  }

  /**
   * Phase 3: Execute deep analysis tasks
   */
  private async executeDeepAnalysis(project: ResearchProject): Promise<void> {
    this.updateProjectStatus(project, 'analyzing', 45, 'Executing deep analysis');

    // Get analysis tasks
    const analysisTasks = this.taskQueue.filter(
      t =>
        t.agentType === 'financial_analyst' ||
        t.agentType === 'competitive_intelligence'
    );

    // Execute analysis tasks
    await this.executeTaskBatch(project, analysisTasks, 'Deep analysis');

    this.updateProjectStatus(project, 'analyzing', 70, 'Deep analysis completed');
  }

  /**
   * Phase 4: Generate final report
   */
  private async generateReport(project: ResearchProject): Promise<void> {
    this.updateProjectStatus(project, 'synthesizing', 75, 'Generating research report');

    const reportAgent = this.agents.get('report_generator') as ReportGeneratorAgent;

    // Update agent status
    this.updateAgentStatus(project, 'report_generator', 'active', 'Generating final report');

    const result = await reportAgent.execute({
      projectId: project.id,
      targetCompany: project.scopingDocument.targetCompany.name,
    });

    if (result.success) {
      // Extract report from findings
      const reportFinding = result.findings.find(f => f.category === 'final_report');
      if (reportFinding) {
        try {
          project.report = JSON.parse(reportFinding.content);
        } catch {
          // Use summary as fallback
          project.report = {
            id: reportFinding.id,
            projectId: project.id,
            title: reportFinding.title,
            executiveSummary: reportFinding.summary,
            sections: [],
            keyInsights: result.insights,
            riskFactors: [],
            recommendations: [],
            appendices: [],
            metadata: {
              generatedAt: new Date().toISOString(),
              wordCount: reportFinding.content.length,
              sourcesCount: result.sources.length,
              confidenceScore: 0.7,
            },
          };
        }
      }

      this.updateAgentStatus(project, 'report_generator', 'completed', null);
      this.emitEvent('report:completed', project.id, { report: project.report });
    } else {
      this.updateAgentStatus(project, 'report_generator', 'error', result.error || 'Unknown error');
    }

    this.updateProjectStatus(project, 'synthesizing', 90, 'Report generated');
  }

  /**
   * Phase 5: Finalize project
   */
  private async finalizeProject(project: ResearchProject): Promise<void> {
    this.updateProjectStatus(project, 'reviewing', 95, 'Finalizing project');

    // Gather all findings
    project.findings = this.memory.getFindings(project.id);

    // Update metadata
    const sources = this.memory.getSources(project.id);
    project.metadata.totalSources = sources.length;
    project.metadata.completedAt = new Date().toISOString();

    // Update database status
    this.memory.updateProjectStatus(project.id, 'completed');

    // Clean up expired memories
    this.memory.cleanExpiredMemories();

    this.updateProjectStatus(project, 'completed', 100, 'Research completed');
    this.emitEvent('project:completed', project.id, { project });
  }

  /**
   * Execute a batch of tasks with concurrency control
   */
  private async executeTaskBatch(
    project: ResearchProject,
    tasks: TaskDefinition[],
    batchName: string
  ): Promise<void> {
    const results: Promise<void>[] = [];
    let completedTasks = 0;

    for (const task of tasks) {
      // Wait if we've hit max concurrency
      while (this.runningTasks.size >= this.config.maxConcurrentAgents) {
        await this.waitForAvailableSlot();
      }

      // Execute task
      const taskPromise = this.executeTask(project, task)
        .then(() => {
          completedTasks++;
          const progress = Math.round(
            (completedTasks / tasks.length) * 100
          );
          this.emitEvent('agent:progress', project.id, {
            batchName,
            completedTasks,
            totalTasks: tasks.length,
            progress,
          });
        })
        .finally(() => {
          this.runningTasks.delete(task.id);
        });

      this.runningTasks.add(task.id);
      results.push(taskPromise);
    }

    // Wait for all tasks to complete
    await Promise.all(results);
  }

  /**
   * Execute a single research task
   */
  private async executeTask(project: ResearchProject, task: TaskDefinition): Promise<void> {
    const agent = this.agents.get(task.agentType);
    if (!agent) {
      throw new Error(`Unknown agent type: ${task.agentType}`);
    }

    // Update agent status
    this.updateAgentStatus(project, task.agentType, 'active', task.context.question || 'Processing');

    try {
      this.emitEvent('agent:started', project.id, {
        agentType: task.agentType,
        taskId: task.id,
        question: task.context.question,
      });

      const result = await agent.execute(task.context);

      if (result.success) {
        // Add findings to project
        project.findings.push(...result.findings);
        project.metadata.totalTokensUsed += result.tokensUsed;

        this.emitEvent('finding:discovered', project.id, {
          agentType: task.agentType,
          findingsCount: result.findings.length,
          insights: result.insights,
        });
      } else {
        project.errors.push({
          id: uuidv4(),
          projectId: project.id,
          agentId: agent.agentId,
          type: 'internal',
          message: result.error || 'Unknown error',
          recoverable: true,
          occurredAt: new Date().toISOString(),
        });

        this.emitEvent('agent:error', project.id, {
          agentType: task.agentType,
          error: result.error,
        });
      }

      this.updateAgentStatus(
        project,
        task.agentType,
        result.success ? 'completed' : 'error',
        result.success ? null : result.error
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateAgentStatus(project, task.agentType, 'error', errorMessage);
      throw error;
    }
  }

  /**
   * Determine which agents should handle a question based on category
   */
  private determineAgentsForQuestion(question: KeyQuestion): string[] {
    const categoryAgentMap: Record<string, string[]> = {
      financial: ['financial_analyst', 'web_researcher'],
      competitive: ['competitive_intelligence', 'web_researcher'],
      market: ['competitive_intelligence', 'web_researcher'],
      leadership: ['web_researcher'],
      technology: ['web_researcher', 'competitive_intelligence'],
      legal: ['web_researcher'],
      operational: ['web_researcher', 'financial_analyst'],
      reputation: ['web_researcher'],
      custom: ['web_researcher'],
    };

    return categoryAgentMap[question.category] || ['web_researcher'];
  }

  /**
   * Convert question priority to numeric value
   */
  private questionPriorityToNumber(priority: KeyQuestion['priority']): number {
    const priorityMap = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return priorityMap[priority] || 2;
  }

  /**
   * Create initial agent status objects
   */
  private createAgentStatuses(): AgentStatus[] {
    return [
      { id: 'web_researcher', type: 'web_researcher', name: 'Web Researcher', status: 'idle', currentTask: null, progress: 0, tokensUsed: 0 },
      { id: 'financial_analyst', type: 'financial_analyst', name: 'Financial Analyst', status: 'idle', currentTask: null, progress: 0, tokensUsed: 0 },
      { id: 'competitive_intelligence', type: 'competitive_intelligence', name: 'Competitive Intelligence', status: 'idle', currentTask: null, progress: 0, tokensUsed: 0 },
      { id: 'report_generator', type: 'report_generator', name: 'Report Generator', status: 'idle', currentTask: null, progress: 0, tokensUsed: 0 },
    ];
  }

  /**
   * Update project status and emit event
   */
  private updateProjectStatus(
    project: ResearchProject,
    status: ResearchStatus,
    progress: number,
    phase: string
  ): void {
    project.status = status;
    project.progress = progress;
    project.currentPhase = phase;

    this.emitEvent('project:updated', project.id, {
      status,
      progress,
      currentPhase: phase,
    });
  }

  /**
   * Update agent status
   */
  private updateAgentStatus(
    project: ResearchProject,
    agentType: string,
    status: AgentStatus['status'],
    task: string | null | undefined
  ): void {
    const agent = project.agents.find(a => a.type === agentType);
    if (agent) {
      agent.status = status;
      agent.currentTask = task ?? null;
      if (status === 'active') {
        agent.startedAt = new Date().toISOString();
      } else if (status === 'completed' || status === 'error') {
        agent.completedAt = new Date().toISOString();
      }
    }
  }

  /**
   * Handle project-level errors
   */
  private handleProjectError(project: ResearchProject, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    project.status = 'failed';
    project.errors.push({
      id: uuidv4(),
      projectId: project.id,
      type: 'internal',
      message: errorMessage,
      recoverable: false,
      occurredAt: new Date().toISOString(),
    });

    this.memory.updateProjectStatus(project.id, 'failed');
    this.emitEvent('project:failed', project.id, { error: errorMessage });
  }

  /**
   * Wait for an available concurrency slot
   */
  private async waitForAvailableSlot(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Emit a WebSocket event
   */
  private emitEvent(type: WebSocketEventType, projectId: string, payload: unknown): void {
    const event: WebSocketEvent = {
      type,
      projectId,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.emit('event', event);
  }

  /**
   * Get project by ID
   */
  getProject(projectId: string): ResearchProject | undefined {
    return this.activeProjects.get(projectId);
  }

  /**
   * Get all active projects
   */
  getAllProjects(): ResearchProject[] {
    return Array.from(this.activeProjects.values());
  }

  /**
   * Pause a project
   */
  async pauseProject(projectId: string): Promise<void> {
    const project = this.activeProjects.get(projectId);
    if (project && project.status !== 'completed' && project.status !== 'failed') {
      project.status = 'paused';
      this.memory.updateProjectStatus(projectId, 'paused');
      this.emitEvent('project:updated', projectId, { status: 'paused' });
    }
  }

  /**
   * Clean up resources
   */
  close(): void {
    this.memory.close();
  }
}

// Export singleton factory
let orchestratorInstance: ResearchOrchestrator | null = null;

export function getOrchestrator(config?: Partial<OrchestratorConfig>): ResearchOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ResearchOrchestrator(config);
  }
  return orchestratorInstance;
}
