import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent, AgentContext, AgentResult, GCPCredentials } from './base-agent.js';
import type { AgentDBClient } from '../memory/agentdb-client.js';
import type { ResearchFinding, Source } from '../types/index.js';

/**
 * Web Researcher Agent
 *
 * Specializes in:
 * - Web search and content extraction
 * - News article analysis
 * - Company website analysis
 * - Social media presence research
 */
export class WebResearcherAgent extends BaseAgent {
  constructor(memory: AgentDBClient, gcpCredentials?: GCPCredentials) {
    super(
      {
        name: 'Web Researcher',
        type: 'web_researcher',
        gcpCredentials,
        systemPrompt: `You are an expert commercial research analyst specializing in web-based intelligence gathering.

Your role is to conduct thorough web research on companies to answer specific questions. You have access to web search capabilities.

Guidelines:
1. Search for multiple relevant queries to ensure comprehensive coverage
2. Prioritize authoritative sources (official websites, news outlets, regulatory filings)
3. Cross-reference information from multiple sources
4. Note the date and credibility of each source
5. Identify gaps in publicly available information
6. Look for both positive and negative information - maintain objectivity

When analyzing sources:
- Assess credibility (official source, reputable news outlet, user-generated content)
- Note publication date (recent vs outdated)
- Identify potential biases
- Extract key facts and figures

Output your findings in a structured format with clear citations.`,
        model: 'claude-opus-4-5-20251101',
        maxTokens: 8192,
      },
      memory
    );
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const findings: ResearchFinding[] = [];
    const sources: Source[] = [];
    const insights: string[] = [];
    let tokensUsed = 0;

    try {
      // Define the web search tool
      const tools: Anthropic.Tool[] = [
        {
          name: 'web_search',
          description: 'Search the web for information. Use this to find company information, news articles, and other publicly available data.',
          input_schema: {
            type: 'object' as const,
            properties: {
              query: {
                type: 'string',
                description: 'The search query to execute',
              },
              num_results: {
                type: 'number',
                description: 'Number of results to return (default: 10)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'fetch_webpage',
          description: 'Fetch and analyze the content of a specific webpage URL.',
          input_schema: {
            type: 'object' as const,
            properties: {
              url: {
                type: 'string',
                description: 'The URL to fetch',
              },
              extract_type: {
                type: 'string',
                enum: ['full', 'summary', 'key_facts'],
                description: 'Type of extraction to perform',
              },
            },
            required: ['url'],
          },
        },
      ];

      // Build the research prompt
      const researchPrompt = this.buildResearchPrompt(context);

      // Get existing context from other agents
      const existingFindings = this.getExistingFindings(context.projectId, context.questionId);
      const contextSummary = existingFindings.length > 0
        ? `\n\nExisting findings from other agents:\n${existingFindings.map(f => `- ${f.title}: ${f.summary}`).join('\n')}`
        : '';

      // Execute research with tools
      const response = await this.chatWithTools(
        researchPrompt + contextSummary,
        tools,
        async (toolName, toolInput) => {
          return this.handleToolCall(toolName, toolInput, context.projectId, sources);
        }
      );

      // Parse and structure the findings
      const parsedFindings = await this.parseFindings(response, context);
      findings.push(...parsedFindings);

      // Extract insights
      const extractedInsights = await this.extractInsights(response, context);
      insights.push(...extractedInsights);

      // Store insights in shared context
      for (const insight of insights) {
        this.addInsight(context.projectId, insight);
      }

      // Mark task as completed
      this.completeTask(context.projectId, `Web research for: ${context.question || 'general research'}`);

      return {
        success: true,
        findings,
        sources,
        insights,
        tokensUsed,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        findings,
        sources,
        insights,
        error: errorMessage,
        tokensUsed,
      };
    }
  }

  private buildResearchPrompt(context: AgentContext): string {
    let prompt = `Research Task: Gather comprehensive web-based intelligence on ${context.targetCompany}`;

    if (context.question) {
      prompt += `\n\nSpecific Question to Answer: ${context.question}`;
    }

    if (context.additionalContext) {
      prompt += `\n\nAdditional Context: ${context.additionalContext}`;
    }

    prompt += `\n\nInstructions:
1. Conduct multiple web searches using different query variations
2. Focus on finding factual, verifiable information
3. Prioritize recent sources (within the last 2 years unless historical context is needed)
4. Look for:
   - Official company announcements and press releases
   - News articles from reputable sources
   - Industry analysis and reports
   - Regulatory filings and legal documents
   - Executive interviews and statements

5. For each piece of information, note:
   - The source URL and title
   - Publication date
   - Key facts discovered
   - Confidence level (high/medium/low)

6. Provide your findings in this JSON format:
\`\`\`json
{
  "findings": [
    {
      "title": "Finding title",
      "content": "Detailed content",
      "summary": "Brief summary",
      "confidence": "high|medium|low",
      "category": "category name",
      "sources": [
        {
          "url": "source url",
          "title": "source title",
          "publishedDate": "date if known",
          "relevanceScore": 0.0-1.0
        }
      ]
    }
  ],
  "insights": ["Key insight 1", "Key insight 2"],
  "gaps": ["Information gap 1", "Information gap 2"]
}
\`\`\``;

    return prompt;
  }

  private async handleToolCall(
    toolName: string,
    toolInput: Record<string, unknown>,
    projectId: string,
    sources: Source[]
  ): Promise<string> {
    if (toolName === 'web_search') {
      // Simulate web search - in production, integrate with actual search API
      const query = toolInput.query as string;
      const numResults = (toolInput.num_results as number) || 10;

      // Store the search query as a memory entry
      this.storeMemory({
        projectId,
        type: 'context',
        content: `Web search performed: "${query}"`,
        metadata: { query, numResults, timestamp: new Date().toISOString() },
      });

      // In production, this would call a real search API (SerpAPI, Google Custom Search, etc.)
      return JSON.stringify({
        query,
        message: `Search executed for: "${query}". In production, this would return actual search results.`,
        note: 'Integrate with SerpAPI, Google Custom Search API, or similar service for actual results.',
        mock_results: [
          {
            title: `${query} - Search Result`,
            url: `https://example.com/result`,
            snippet: `This is a placeholder result for the query: ${query}`,
          },
        ],
      });
    }

    if (toolName === 'fetch_webpage') {
      const url = toolInput.url as string;
      const extractType = (toolInput.extract_type as string) || 'summary';

      // Register this source
      const source: Source = {
        id: '',
        type: 'web',
        url,
        title: `Webpage: ${url}`,
        accessedAt: new Date().toISOString(),
        relevanceScore: 0.5,
      };
      const registeredSource = this.registerSource(projectId, source);
      sources.push(registeredSource);

      // In production, this would fetch and parse the actual webpage
      return JSON.stringify({
        url,
        extractType,
        message: `Webpage fetch simulated for: ${url}`,
        note: 'In production, this would fetch and analyze the actual webpage content.',
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  private async parseFindings(response: string, context: AgentContext): Promise<ResearchFinding[]> {
    const findings: ResearchFinding[] = [];

    const parsed = this.parseJSON<{
      findings?: Array<{
        title: string;
        content: string;
        summary: string;
        confidence: 'high' | 'medium' | 'low';
        category: string;
        sources?: Array<{
          url: string;
          title: string;
          publishedDate?: string;
          relevanceScore?: number;
        }>;
      }>;
    }>(response);

    if (parsed?.findings) {
      for (const f of parsed.findings) {
        const finding = this.storeFinding({
          projectId: context.projectId,
          questionId: context.questionId || 'general',
          category: f.category || 'web_research',
          title: f.title,
          content: f.content,
          summary: f.summary,
          confidence: f.confidence || 'medium',
          sources: (f.sources || []).map(s => ({
            id: '',
            type: 'web' as const,
            url: s.url,
            title: s.title,
            publishedDate: s.publishedDate,
            accessedAt: new Date().toISOString(),
            relevanceScore: s.relevanceScore || 0.5,
          })),
          relatedFindings: [],
          metadata: {
            discoveredAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
          },
        });
        findings.push(finding);
      }
    }

    return findings;
  }

  private async extractInsights(response: string, _context: AgentContext): Promise<string[]> {
    const parsed = this.parseJSON<{ insights?: string[] }>(response);
    return parsed?.insights || [];
  }
}
