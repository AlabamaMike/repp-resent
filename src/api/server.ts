import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

import { getOrchestrator, ResearchOrchestrator } from '../agents/orchestrator.js';
import { scopingParser } from '../workflow/scoping-parser.js';
import { getAgentDB } from '../memory/agentdb-client.js';
import { createGCPAuthMiddleware, getGCPAuth, type AuthenticatedRequest } from '../auth/index.js';
import type { ScopingDocument, WebSocketEvent, CreateProjectRequest } from '../types/index.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// GCP Authentication middleware
// Users must provide their GCP credentials via Bearer token
app.use(createGCPAuthMiddleware({
  projectId: process.env.GCP_PROJECT_ID,
  region: process.env.GCP_REGION || 'us-central1',
  allowUnauthenticatedPaths: ['/api/health', '/api/templates'],
}));

// Orchestrator instances per GCP project (user credentials)
const orchestrators = new Map<string, ResearchOrchestrator>();

function getOrchestratorInstance(gcpProjectId: string, accessToken: string): ResearchOrchestrator {
  // Create unique key based on GCP project ID
  const key = gcpProjectId;

  if (!orchestrators.has(key)) {
    const orchestrator = getOrchestrator({
      maxConcurrentAgents: parseInt(process.env.MAX_CONCURRENT_AGENTS || '5', 10),
      maxResearchDepth: parseInt(process.env.MAX_RESEARCH_DEPTH || '3', 10),
      dbPath: process.env.AGENTDB_PATH || './data/research.db',
      gcpProjectId,
      gcpRegion: process.env.GCP_REGION || 'us-central1',
      gcpAccessToken: accessToken,
    });

    // Forward orchestrator events to WebSocket clients
    orchestrator.on('event', (event: WebSocketEvent) => {
      io.to(`project:${event.projectId}`).emit('project:event', event);
    });

    orchestrators.set(key, orchestrator);
  } else {
    // Update access token for existing orchestrator
    const orchestrator = orchestrators.get(key)!;
    orchestrator.updateCredentials(accessToken);
  }

  return orchestrators.get(key)!;
}

// ============================================================================
// API Routes
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

/**
 * Create a new research project
 */
app.post('/api/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gcpAuth = getGCPAuth(req);
    if (!gcpAuth) {
      res.status(401).json({ error: 'GCP authentication required' });
      return;
    }

    const body = req.body as CreateProjectRequest | { rawDocument: string; format?: string };

    let scopingDocument: ScopingDocument;

    // Check if raw document string was provided
    if ('rawDocument' in body && typeof body.rawDocument === 'string') {
      const format = body.format || 'auto';
      if (format === 'yaml') {
        scopingDocument = scopingParser.parseYAML(body.rawDocument);
      } else if (format === 'json') {
        scopingDocument = scopingParser.parseJSON(body.rawDocument);
      } else {
        scopingDocument = scopingParser.parse(body.rawDocument);
      }
    } else if ('scopingDocument' in body) {
      // Structured scoping document provided
      const now = new Date().toISOString();
      scopingDocument = scopingParser.parseJSON(JSON.stringify({
        ...body.scopingDocument,
        id: body.scopingDocument.id || uuidv4(),
        createdAt: now,
        updatedAt: now,
      }));
    } else {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Provide either a scopingDocument object or rawDocument string',
      });
      return;
    }

    // Start the research project using the user's GCP credentials
    const orch = getOrchestratorInstance(gcpAuth.projectId, gcpAuth.accessToken);
    const project = await orch.startProject(scopingDocument);

    res.status(201).json({
      success: true,
      projectId: project.id,
      project: {
        id: project.id,
        name: project.scopingDocument.projectName,
        targetCompany: project.scopingDocument.targetCompany.name,
        status: project.status,
        createdAt: project.metadata.startedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Create a quick research project with simplified input
 */
app.post('/api/projects/quick', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gcpAuth = getGCPAuth(req);
    if (!gcpAuth) {
      res.status(401).json({ error: 'GCP authentication required' });
      return;
    }

    const { targetCompany, questions, clientName, objective } = req.body as {
      targetCompany: string;
      questions: string[];
      clientName?: string;
      objective?: string;
    };

    if (!targetCompany || !questions || !Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Provide targetCompany (string) and questions (array of strings)',
      });
      return;
    }

    const scopingDocument = scopingParser.parseSimplified({
      targetCompany,
      questions,
      clientName,
      objective,
    });

    const orch = getOrchestratorInstance(gcpAuth.projectId, gcpAuth.accessToken);
    const project = await orch.startProject(scopingDocument);

    res.status(201).json({
      success: true,
      projectId: project.id,
      project: {
        id: project.id,
        name: project.scopingDocument.projectName,
        targetCompany: project.scopingDocument.targetCompany.name,
        status: project.status,
        createdAt: project.metadata.startedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all projects
 */
app.get('/api/projects', (req: Request, res: Response) => {
  const gcpAuth = getGCPAuth(req);
  if (!gcpAuth) {
    res.status(401).json({ error: 'GCP authentication required' });
    return;
  }

  const orch = getOrchestratorInstance(gcpAuth.projectId, gcpAuth.accessToken);
  const projects = orch.getAllProjects();

  res.json({
    projects: projects.map(p => ({
      id: p.id,
      name: p.scopingDocument.projectName,
      targetCompany: p.scopingDocument.targetCompany.name,
      status: p.status,
      progress: p.progress,
      currentPhase: p.currentPhase,
      createdAt: p.metadata.startedAt,
      completedAt: p.metadata.completedAt,
    })),
    total: projects.length,
  });
});

/**
 * Get project by ID
 */
app.get('/api/projects/:projectId', (req: Request, res: Response) => {
  const gcpAuth = getGCPAuth(req);
  if (!gcpAuth) {
    res.status(401).json({ error: 'GCP authentication required' });
    return;
  }

  const { projectId } = req.params;
  const orch = getOrchestratorInstance(gcpAuth.projectId, gcpAuth.accessToken);
  const project = orch.getProject(projectId);

  if (!project) {
    // Try to load from database
    const db = getAgentDB();
    const dbProject = db.getProject(projectId);
    if (dbProject) {
      res.json({
        id: dbProject.id,
        name: dbProject.name,
        targetCompany: dbProject.target_company,
        status: dbProject.status,
        scopingDocument: JSON.parse(dbProject.scoping_document),
        fromDatabase: true,
      });
      return;
    }

    res.status(404).json({
      error: 'Project not found',
      message: `No project found with ID: ${projectId}`,
    });
    return;
  }

  res.json({
    project: {
      id: project.id,
      name: project.scopingDocument.projectName,
      targetCompany: project.scopingDocument.targetCompany.name,
      status: project.status,
      progress: project.progress,
      currentPhase: project.currentPhase,
      agents: project.agents,
      findingsCount: project.findings.length,
      errorsCount: project.errors.length,
      metadata: project.metadata,
    },
    scopingDocument: project.scopingDocument,
    report: project.report,
  });
});

/**
 * Get project findings
 */
app.get('/api/projects/:projectId/findings', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { questionId } = req.query as { questionId?: string };

  const db = getAgentDB();
  const findings = db.getFindings(projectId, questionId);

  res.json({
    findings,
    total: findings.length,
  });
});

/**
 * Get project sources
 */
app.get('/api/projects/:projectId/sources', (req: Request, res: Response) => {
  const { projectId } = req.params;

  const db = getAgentDB();
  const sources = db.getSources(projectId);

  res.json({
    sources,
    total: sources.length,
  });
});

/**
 * Get project report
 */
app.get('/api/projects/:projectId/report', (req: Request, res: Response) => {
  const gcpAuth = getGCPAuth(req);
  if (!gcpAuth) {
    res.status(401).json({ error: 'GCP authentication required' });
    return;
  }

  const { projectId } = req.params;
  const orch = getOrchestratorInstance(gcpAuth.projectId, gcpAuth.accessToken);
  const project = orch.getProject(projectId);

  if (!project) {
    res.status(404).json({
      error: 'Project not found',
    });
    return;
  }

  if (!project.report) {
    res.status(404).json({
      error: 'Report not available',
      message: project.status === 'completed'
        ? 'Report generation failed'
        : `Project is still ${project.status}. Report will be available when complete.`,
    });
    return;
  }

  res.json({
    report: project.report,
  });
});

/**
 * Pause a project
 */
app.post('/api/projects/:projectId/pause', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const gcpAuth = getGCPAuth(req);
    if (!gcpAuth) {
      res.status(401).json({ error: 'GCP authentication required' });
      return;
    }

    const { projectId } = req.params;
    const orch = getOrchestratorInstance(gcpAuth.projectId, gcpAuth.accessToken);

    await orch.pauseProject(projectId);

    res.json({
      success: true,
      message: 'Project paused',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get scoping document template
 */
app.get('/api/templates/scoping', (req: Request, res: Response) => {
  const { format } = req.query as { format?: string };

  if (format === 'yaml') {
    res.type('text/yaml').send(scopingParser.generateYAMLTemplate());
  } else {
    res.json(JSON.parse(scopingParser.generateTemplate()));
  }
});

// ============================================================================
// WebSocket Handlers
// ============================================================================

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join project room for real-time updates
  socket.on('subscribe:project', (projectId: string) => {
    socket.join(`project:${projectId}`);
    console.log(`Client ${socket.id} subscribed to project ${projectId}`);
  });

  // Leave project room
  socket.on('unsubscribe:project', (projectId: string) => {
    socket.leave(`project:${projectId}`);
    console.log(`Client ${socket.id} unsubscribed from project ${projectId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ============================================================================
// Error Handling
// ============================================================================

interface ErrorWithStatus extends Error {
  status?: number;
}

app.use((err: ErrorWithStatus, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API Error:', err);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ============================================================================
// Server Startup
// ============================================================================

const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3001', 10);
const HOST = process.env.API_HOST || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Research API server running at http://${HOST}:${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`📁 Database path: ${process.env.AGENTDB_PATH || './data/research.db'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  // Close all orchestrator instances
  for (const [key, orch] of orchestrators) {
    console.log(`Closing orchestrator for project: ${key}`);
    orch.close();
  }
  orchestrators.clear();
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export { app, httpServer, io };
