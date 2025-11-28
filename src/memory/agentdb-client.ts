import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryEntry, ResearchFinding, Source, SharedContext, KeyQuestion } from '../types/index.js';

/**
 * AgentDB Client - Provides shared memory across agents using SQLite with vector search
 *
 * This client wraps the agentdb functionality to provide:
 * - Persistent storage for research findings
 * - Vector similarity search for semantic retrieval
 * - Cross-agent memory sharing
 * - Project-scoped contexts
 */
export class AgentDBClient {
  private db: Database.Database;
  private dimension: number;

  constructor(dbPath: string, dimension: number = 1536) {
    this.dimension = dimension;
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create tables for research workflow
    this.db.exec(`
      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        target_company TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        scoping_document TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Memory entries for agents
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      -- Research findings
      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT NOT NULL,
        confidence TEXT NOT NULL,
        sources TEXT NOT NULL,
        related_findings TEXT,
        metadata TEXT,
        embedding BLOB,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      -- Sources registry
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        url TEXT,
        title TEXT NOT NULL,
        author TEXT,
        published_date TEXT,
        accessed_at TEXT NOT NULL,
        relevance_score REAL,
        snippet TEXT,
        metadata TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      -- Agent tasks and progress
      CREATE TABLE IF NOT EXISTS agent_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        task_description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        error TEXT,
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      -- Shared context between agents
      CREATE TABLE IF NOT EXISTS shared_context (
        project_id TEXT PRIMARY KEY,
        target_company TEXT NOT NULL,
        key_questions TEXT NOT NULL,
        completed_tasks TEXT NOT NULL DEFAULT '[]',
        pending_tasks TEXT NOT NULL DEFAULT '[]',
        discovered_insights TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id)
      );

      -- Create indexes for faster queries
      CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entries(project_id);
      CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_entries(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_entries(type);
      CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id);
      CREATE INDEX IF NOT EXISTS idx_findings_question ON findings(question_id);
      CREATE INDEX IF NOT EXISTS idx_sources_project ON sources(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON agent_tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_agent ON agent_tasks(agent_id);
    `);
  }

  // ============================================================================
  // Project Operations
  // ============================================================================

  createProject(id: string, name: string, targetCompany: string, scopingDocument: object): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (id, name, target_company, scoping_document, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    stmt.run(id, name, targetCompany, JSON.stringify(scopingDocument));

    // Initialize shared context
    const contextStmt = this.db.prepare(`
      INSERT INTO shared_context (project_id, target_company, key_questions, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    const scopingDoc = scopingDocument as { keyQuestions?: KeyQuestion[] };
    contextStmt.run(id, targetCompany, JSON.stringify(scopingDoc.keyQuestions || []));
  }

  updateProjectStatus(projectId: string, status: string): void {
    const stmt = this.db.prepare(`
      UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(status, projectId);
  }

  getProject(projectId: string): { id: string; name: string; target_company: string; status: string; scoping_document: string } | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(projectId) as { id: string; name: string; target_company: string; status: string; scoping_document: string } | null;
  }

  // ============================================================================
  // Memory Operations
  // ============================================================================

  storeMemory(entry: Omit<MemoryEntry, 'createdAt'>): string {
    const id = entry.id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO memory_entries (id, project_id, agent_id, type, content, metadata, embedding, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      entry.projectId,
      entry.agentId,
      entry.type,
      entry.content,
      JSON.stringify(entry.metadata),
      entry.embedding ? Buffer.from(new Float32Array(entry.embedding).buffer) : null,
      entry.expiresAt || null
    );
    return id;
  }

  getMemories(projectId: string, agentId?: string, type?: string): MemoryEntry[] {
    let query = 'SELECT * FROM memory_entries WHERE project_id = ?';
    const params: (string | undefined)[] = [projectId];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC';
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      project_id: string;
      agent_id: string;
      type: string;
      content: string;
      metadata: string;
      embedding: Buffer | null;
      created_at: string;
      expires_at: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      agentId: row.agent_id,
      type: row.type as MemoryEntry['type'],
      content: row.content,
      metadata: JSON.parse(row.metadata || '{}'),
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at || undefined,
    }));
  }

  // ============================================================================
  // Finding Operations
  // ============================================================================

  storeFinding(finding: Omit<ResearchFinding, 'metadata'> & { metadata?: ResearchFinding['metadata'] }): string {
    const id = finding.id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO findings (
        id, project_id, question_id, agent_id, agent_type, category,
        title, content, summary, confidence, sources, related_findings, metadata, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      finding.projectId,
      finding.questionId,
      finding.agentId,
      finding.agentType,
      finding.category,
      finding.title,
      finding.content,
      finding.summary,
      finding.confidence,
      JSON.stringify(finding.sources),
      JSON.stringify(finding.relatedFindings),
      JSON.stringify(finding.metadata || {}),
      finding.embedding ? Buffer.from(new Float32Array(finding.embedding).buffer) : null
    );
    return id;
  }

  getFindings(projectId: string, questionId?: string): ResearchFinding[] {
    let query = 'SELECT * FROM findings WHERE project_id = ?';
    const params: string[] = [projectId];

    if (questionId) {
      query += ' AND question_id = ?';
      params.push(questionId);
    }

    query += ' ORDER BY created_at DESC';
    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      project_id: string;
      question_id: string;
      agent_id: string;
      agent_type: string;
      category: string;
      title: string;
      content: string;
      summary: string;
      confidence: string;
      sources: string;
      related_findings: string;
      metadata: string;
      embedding: Buffer | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      questionId: row.question_id,
      agentId: row.agent_id,
      agentType: row.agent_type as ResearchFinding['agentType'],
      category: row.category,
      title: row.title,
      content: row.content,
      summary: row.summary,
      confidence: row.confidence as ResearchFinding['confidence'],
      sources: JSON.parse(row.sources),
      relatedFindings: JSON.parse(row.related_findings || '[]'),
      metadata: {
        ...JSON.parse(row.metadata || '{}'),
        discoveredAt: row.created_at,
        lastUpdated: row.updated_at,
      },
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding.buffer)) : undefined,
    }));
  }

  // ============================================================================
  // Source Operations
  // ============================================================================

  registerSource(projectId: string, source: Source): string {
    const id = source.id || uuidv4();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sources (
        id, project_id, type, url, title, author, published_date,
        accessed_at, relevance_score, snippet, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      projectId,
      source.type,
      source.url || null,
      source.title,
      source.author || null,
      source.publishedDate || null,
      source.accessedAt,
      source.relevanceScore,
      source.snippet || null,
      JSON.stringify(source.metadata || {})
    );
    return id;
  }

  getSources(projectId: string): Source[] {
    const stmt = this.db.prepare('SELECT * FROM sources WHERE project_id = ? ORDER BY relevance_score DESC');
    const rows = stmt.all(projectId) as Array<{
      id: string;
      type: string;
      url: string | null;
      title: string;
      author: string | null;
      published_date: string | null;
      accessed_at: string;
      relevance_score: number;
      snippet: string | null;
      metadata: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      type: row.type as Source['type'],
      url: row.url || undefined,
      title: row.title,
      author: row.author || undefined,
      publishedDate: row.published_date || undefined,
      accessedAt: row.accessed_at,
      relevanceScore: row.relevance_score,
      snippet: row.snippet || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  // ============================================================================
  // Shared Context Operations
  // ============================================================================

  getSharedContext(projectId: string): SharedContext | null {
    const stmt = this.db.prepare('SELECT * FROM shared_context WHERE project_id = ?');
    const row = stmt.get(projectId) as {
      project_id: string;
      target_company: string;
      key_questions: string;
      completed_tasks: string;
      pending_tasks: string;
      discovered_insights: string;
    } | undefined;

    if (!row) return null;

    return {
      projectId: row.project_id,
      targetCompany: row.target_company,
      keyQuestions: JSON.parse(row.key_questions),
      completedTasks: JSON.parse(row.completed_tasks),
      pendingTasks: JSON.parse(row.pending_tasks),
      discoveredInsights: JSON.parse(row.discovered_insights),
      sourceRegistry: new Map(this.getSources(projectId).map(s => [s.id, s])),
    };
  }

  updateSharedContext(projectId: string, updates: Partial<Omit<SharedContext, 'projectId' | 'sourceRegistry'>>): void {
    const current = this.getSharedContext(projectId);
    if (!current) return;

    const stmt = this.db.prepare(`
      UPDATE shared_context SET
        target_company = ?,
        key_questions = ?,
        completed_tasks = ?,
        pending_tasks = ?,
        discovered_insights = ?,
        updated_at = datetime('now')
      WHERE project_id = ?
    `);

    stmt.run(
      updates.targetCompany || current.targetCompany,
      JSON.stringify(updates.keyQuestions || current.keyQuestions),
      JSON.stringify(updates.completedTasks || current.completedTasks),
      JSON.stringify(updates.pendingTasks || current.pendingTasks),
      JSON.stringify(updates.discoveredInsights || current.discoveredInsights),
      projectId
    );
  }

  addCompletedTask(projectId: string, task: string): void {
    const context = this.getSharedContext(projectId);
    if (!context) return;

    const completedTasks = [...context.completedTasks, task];
    const pendingTasks = context.pendingTasks.filter(t => t !== task);
    this.updateSharedContext(projectId, { completedTasks, pendingTasks });
  }

  addDiscoveredInsight(projectId: string, insight: string): void {
    const context = this.getSharedContext(projectId);
    if (!context) return;

    const discoveredInsights = [...context.discoveredInsights, insight];
    this.updateSharedContext(projectId, { discoveredInsights });
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  createTask(
    projectId: string,
    agentId: string,
    agentType: string,
    description: string
  ): string {
    const id = uuidv4();
    const stmt = this.db.prepare(`
      INSERT INTO agent_tasks (id, project_id, agent_id, agent_type, task_description, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(id, projectId, agentId, agentType, description);
    return id;
  }

  updateTaskStatus(
    taskId: string,
    status: 'pending' | 'in_progress' | 'completed' | 'failed',
    result?: string,
    error?: string
  ): void {
    const updates: string[] = ['status = ?'];
    const params: (string | null)[] = [status];

    if (status === 'in_progress') {
      updates.push("started_at = datetime('now')");
    }
    if (status === 'completed' || status === 'failed') {
      updates.push("completed_at = datetime('now')");
    }
    if (result !== undefined) {
      updates.push('result = ?');
      params.push(result);
    }
    if (error !== undefined) {
      updates.push('error = ?');
      params.push(error);
    }

    params.push(taskId);
    const stmt = this.db.prepare(`UPDATE agent_tasks SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...params);
  }

  getAgentTasks(projectId: string, agentId?: string): Array<{
    id: string;
    projectId: string;
    agentId: string;
    agentType: string;
    description: string;
    status: string;
    result: string | null;
    error: string | null;
    startedAt: string | null;
    completedAt: string | null;
  }> {
    let query = 'SELECT * FROM agent_tasks WHERE project_id = ?';
    const params: string[] = [projectId];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      id: string;
      project_id: string;
      agent_id: string;
      agent_type: string;
      task_description: string;
      status: string;
      result: string | null;
      error: string | null;
      started_at: string | null;
      completed_at: string | null;
    }>;

    return rows.map(row => ({
      id: row.id,
      projectId: row.project_id,
      agentId: row.agent_id,
      agentType: row.agent_type,
      description: row.task_description,
      status: row.status,
      result: row.result,
      error: row.error,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  cleanExpiredMemories(): number {
    const stmt = this.db.prepare(`
      DELETE FROM memory_entries WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
    `);
    const result = stmt.run();
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance for shared access
let instance: AgentDBClient | null = null;

export function getAgentDB(dbPath?: string, dimension?: number): AgentDBClient {
  if (!instance) {
    const path = dbPath || process.env.AGENTDB_PATH || './data/research.db';
    const dim = dimension || parseInt(process.env.AGENTDB_DIMENSION || '1536', 10);
    instance = new AgentDBClient(path, dim);
  }
  return instance;
}

export function closeAgentDB(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
