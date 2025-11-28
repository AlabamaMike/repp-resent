import Anthropic from '@anthropic-ai/sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { v4 as uuidv4 } from 'uuid';
import type { AgentDBClient } from '../memory/agentdb-client.js';
import type { AgentType, ResearchFinding, Source, MemoryEntry } from '../types/index.js';

/**
 * GCP credentials for Vertex AI authentication
 */
export interface GCPCredentials {
  projectId: string;
  region: string;
  accessToken: string;
}

export interface AgentConfig {
  name: string;
  type: AgentType;
  systemPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  gcpCredentials?: GCPCredentials;
}

export interface AgentContext {
  projectId: string;
  targetCompany: string;
  questionId?: string;
  question?: string;
  additionalContext?: string;
}

export interface AgentResult {
  success: boolean;
  findings: ResearchFinding[];
  sources: Source[];
  insights: string[];
  error?: string;
  tokensUsed: number;
}

type MessageRole = 'user' | 'assistant';

interface Message {
  role: MessageRole;
  content: string;
}

/**
 * Base class for all research agents
 *
 * Provides common functionality:
 * - Claude API integration via Vertex AI with user's GCP credentials
 * - Memory storage via AgentDB
 * - Structured output parsing
 * - Error handling and retries
 */
export abstract class BaseAgent {
  protected id: string;
  protected config: AgentConfig;
  protected client: Anthropic | AnthropicVertex;
  protected memory: AgentDBClient;
  protected conversationHistory: Message[] = [];
  protected gcpCredentials?: GCPCredentials;

  constructor(config: AgentConfig, memory: AgentDBClient) {
    this.id = uuidv4();
    this.config = config;
    this.memory = memory;
    this.gcpCredentials = config.gcpCredentials;

    // Use Vertex AI if GCP credentials are provided, otherwise fall back to direct API
    if (config.gcpCredentials) {
      this.client = new AnthropicVertex({
        projectId: config.gcpCredentials.projectId,
        region: config.gcpCredentials.region,
        accessToken: config.gcpCredentials.accessToken,
      });
    } else {
      // Fallback for local development without GCP
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Update GCP credentials (e.g., when access token is refreshed)
   */
  updateCredentials(accessToken: string): void {
    if (this.gcpCredentials) {
      this.gcpCredentials.accessToken = accessToken;
      // Recreate Vertex AI client with new token
      this.client = new AnthropicVertex({
        projectId: this.gcpCredentials.projectId,
        region: this.gcpCredentials.region,
        accessToken: accessToken,
      });
    }
  }

  get agentId(): string {
    return this.id;
  }

  get agentType(): AgentType {
    return this.config.type;
  }

  get name(): string {
    return this.config.name;
  }

  /**
   * Execute the agent's primary task
   */
  abstract execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Send a message to Claude and get a response
   */
  protected async chat(
    userMessage: string,
    options?: {
      includeHistory?: boolean;
      tools?: Anthropic.Tool[];
    }
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = options?.includeHistory
      ? [...this.conversationHistory.map(m => ({ role: m.role, content: m.content })), { role: 'user' as const, content: userMessage }]
      : [{ role: 'user' as const, content: userMessage }];

    const requestParams: Anthropic.MessageCreateParams = {
      model: this.config.model || 'claude-opus-4-5-20251101',
      max_tokens: this.config.maxTokens || 8192,
      system: this.config.systemPrompt,
      messages,
    };

    if (options?.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
    }

    const response = await this.client.messages.create(requestParams);

    // Extract text content from response
    const textContent = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );

    const assistantMessage = textContent?.text || '';

    // Update conversation history
    this.conversationHistory.push({ role: 'user', content: userMessage });
    this.conversationHistory.push({ role: 'assistant', content: assistantMessage });

    return assistantMessage;
  }

  /**
   * Send a message with tool use capability
   */
  protected async chatWithTools(
    userMessage: string,
    tools: Anthropic.Tool[],
    toolHandler: (toolName: string, toolInput: Record<string, unknown>) => Promise<string>
  ): Promise<string> {
    let messages: Anthropic.MessageParam[] = [{ role: 'user' as const, content: userMessage }];
    let finalResponse = '';

    while (true) {
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-opus-4-5-20251101',
        max_tokens: this.config.maxTokens || 8192,
        system: this.config.systemPrompt,
        tools,
        messages,
      });

      // Check if we need to handle tool calls
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls, extract final text response
        const textContent = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        finalResponse = textContent?.text || '';
        break;
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await toolHandler(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      // Add assistant response and tool results to messages
      messages = [
        ...messages,
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: toolResults },
      ];
    }

    return finalResponse;
  }

  /**
   * Store a finding in shared memory
   */
  protected storeFinding(finding: Omit<ResearchFinding, 'id' | 'agentId' | 'agentType'>): ResearchFinding {
    const completeFinding: ResearchFinding = {
      ...finding,
      id: uuidv4(),
      agentId: this.id,
      agentType: this.config.type,
    };

    this.memory.storeFinding(completeFinding);
    return completeFinding;
  }

  /**
   * Register a source
   */
  protected registerSource(projectId: string, source: Omit<Source, 'id'>): Source {
    const completeSource: Source = {
      ...source,
      id: uuidv4(),
    };

    this.memory.registerSource(projectId, completeSource);
    return completeSource;
  }

  /**
   * Store a memory entry
   */
  protected storeMemory(entry: Omit<MemoryEntry, 'id' | 'agentId' | 'createdAt'>): void {
    this.memory.storeMemory({
      ...entry,
      id: uuidv4(),
      agentId: this.id,
    });
  }

  /**
   * Retrieve memories from shared context
   */
  protected getMemories(projectId: string, type?: string): MemoryEntry[] {
    return this.memory.getMemories(projectId, undefined, type);
  }

  /**
   * Get findings from other agents for context
   */
  protected getExistingFindings(projectId: string, questionId?: string): ResearchFinding[] {
    return this.memory.getFindings(projectId, questionId);
  }

  /**
   * Parse JSON from Claude response
   */
  protected parseJSON<T>(response: string): T | null {
    try {
      // Try to find JSON in the response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try parsing the entire response as JSON
      return JSON.parse(response);
    } catch {
      // Try to extract JSON object or array
      const objectMatch = response.match(/\{[\s\S]*\}/);
      const arrayMatch = response.match(/\[[\s\S]*\]/);

      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          return null;
        }
      }

      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch {
          return null;
        }
      }

      return null;
    }
  }

  /**
   * Clear conversation history
   */
  protected clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Add insight to shared context
   */
  protected addInsight(projectId: string, insight: string): void {
    this.memory.addDiscoveredInsight(projectId, insight);
  }

  /**
   * Mark a task as completed
   */
  protected completeTask(projectId: string, task: string): void {
    this.memory.addCompletedTask(projectId, task);
  }
}
