import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent, AgentContext, AgentResult, GCPCredentials } from './base-agent.js';
import type { AgentDBClient } from '../memory/agentdb-client.js';
import type { ResearchFinding, Source } from '../types/index.js';

/**
 * Competitive Intelligence Agent
 *
 * Specializes in:
 * - Competitor identification and analysis
 * - Market positioning assessment
 * - Competitive advantages/disadvantages
 * - Market share and trends
 * - Strategic moves and patterns
 */
export class CompetitiveIntelligenceAgent extends BaseAgent {
  constructor(memory: AgentDBClient, gcpCredentials?: GCPCredentials) {
    super(
      {
        name: 'Competitive Intelligence Analyst',
        type: 'competitive_intelligence',
        gcpCredentials,
        systemPrompt: `You are an expert competitive intelligence analyst specializing in market dynamics and competitive positioning.

Your role is to analyze the competitive landscape around a target company, identify key competitors, and assess market dynamics.

Areas of expertise:
1. Competitor Identification
   - Direct competitors (same product/service)
   - Indirect competitors (alternative solutions)
   - Emerging threats (startups, adjacent players)
   - Potential acquirers or partners

2. Competitive Positioning
   - Market positioning and messaging
   - Target customer segments
   - Pricing strategies
   - Geographic presence
   - Product/service differentiation

3. Competitive Advantages Analysis
   - Technology and IP
   - Brand and reputation
   - Distribution channels
   - Customer relationships
   - Operational capabilities

4. Market Dynamics
   - Market size and growth
   - Market share estimates
   - Industry trends
   - Regulatory environment
   - Barriers to entry

5. Strategic Intelligence
   - Recent strategic moves
   - M&A activity
   - Partnership announcements
   - Product launches
   - Leadership changes

Guidelines:
- Build a comprehensive competitive map
- Identify 3-5 key direct competitors
- Assess relative strengths and weaknesses
- Look for market trends and disruptions
- Note recent competitive moves
- Identify potential strategic opportunities and threats

Output your analysis in a structured format with clear competitive insights.`,
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
      const tools: Anthropic.Tool[] = [
        {
          name: 'search_competitors',
          description: 'Search for competitors and competitive information about a company.',
          input_schema: {
            type: 'object' as const,
            properties: {
              company: {
                type: 'string',
                description: 'Target company name',
              },
              search_type: {
                type: 'string',
                enum: ['direct_competitors', 'market_analysis', 'product_comparison', 'news', 'strategic_moves'],
                description: 'Type of competitive information to search for',
              },
              industry: {
                type: 'string',
                description: 'Industry or market segment',
              },
            },
            required: ['company', 'search_type'],
          },
        },
        {
          name: 'analyze_competitor',
          description: 'Perform detailed analysis of a specific competitor.',
          input_schema: {
            type: 'object' as const,
            properties: {
              competitor_name: {
                type: 'string',
                description: 'Name of the competitor to analyze',
              },
              analysis_type: {
                type: 'string',
                enum: ['overview', 'strengths_weaknesses', 'product_analysis', 'market_position'],
                description: 'Type of analysis to perform',
              },
            },
            required: ['competitor_name', 'analysis_type'],
          },
        },
      ];

      const analysisPrompt = this.buildAnalysisPrompt(context);

      // Get context from other agents
      const existingFindings = this.getExistingFindings(context.projectId);
      const relevantFindings = existingFindings.filter(
        f => f.agentType === 'web_researcher' || f.agentType === 'financial_analyst'
      );

      const contextSummary = relevantFindings.length > 0
        ? `\n\nRelevant findings from other research:\n${relevantFindings.map(f => `- [${f.agentType}] ${f.title}: ${f.summary}`).join('\n')}`
        : '';

      const response = await this.chatWithTools(
        analysisPrompt + contextSummary,
        tools,
        async (toolName, toolInput) => {
          return this.handleToolCall(toolName, toolInput, context.projectId, sources);
        }
      );

      const parsedFindings = await this.parseFindings(response, context);
      findings.push(...parsedFindings);

      const extractedInsights = await this.extractInsights(response);
      insights.push(...extractedInsights);

      for (const insight of insights) {
        this.addInsight(context.projectId, `[Competitive] ${insight}`);
      }

      this.completeTask(context.projectId, `Competitive analysis for: ${context.question || 'market positioning'}`);

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

  private buildAnalysisPrompt(context: AgentContext): string {
    let prompt = `Competitive Intelligence Task: Analyze the competitive landscape for ${context.targetCompany}`;

    if (context.question) {
      prompt += `\n\nSpecific Question to Answer: ${context.question}`;
    }

    if (context.additionalContext) {
      prompt += `\n\nAdditional Context: ${context.additionalContext}`;
    }

    prompt += `\n\nInstructions:
1. Identify and analyze the competitive landscape:
   - Identify 3-5 key direct competitors
   - Identify 2-3 indirect competitors or alternative solutions
   - Map the competitive positioning

2. For each major competitor, assess:
   - Company overview (size, funding, history)
   - Product/service comparison
   - Target market and customer base
   - Pricing and business model
   - Strengths and weaknesses relative to target

3. Analyze market dynamics:
   - Market size and growth rate
   - Market share distribution (if available)
   - Key trends affecting the market
   - Barriers to entry
   - Regulatory considerations

4. Identify strategic intelligence:
   - Recent competitive moves
   - M&A activity in the space
   - New entrants or emerging threats
   - Partnership and alliance activity

5. Assess competitive advantages:
   - Technology/product differentiation
   - Brand and reputation
   - Distribution and partnerships
   - Operational capabilities
   - Financial resources

6. Provide your analysis in this JSON format:
\`\`\`json
{
  "findings": [
    {
      "title": "Finding title",
      "content": "Detailed competitive analysis",
      "summary": "Brief summary",
      "confidence": "high|medium|low",
      "category": "competitor|market|positioning|threat|opportunity",
      "sources": [
        {
          "url": "source url",
          "title": "source title"
        }
      ]
    }
  ],
  "competitors": [
    {
      "name": "Competitor name",
      "type": "direct|indirect|emerging",
      "description": "Brief description",
      "strengths": ["strength 1", "strength 2"],
      "weaknesses": ["weakness 1", "weakness 2"],
      "market_position": "leader|challenger|niche|emerging"
    }
  ],
  "market_analysis": {
    "size": "market size estimate",
    "growth_rate": "growth rate",
    "key_trends": ["trend 1", "trend 2"],
    "target_position": "Position description"
  },
  "insights": ["Competitive insight 1", "Competitive insight 2"],
  "threats": ["Threat 1", "Threat 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"]
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
    if (toolName === 'search_competitors') {
      const company = toolInput.company as string;
      const searchType = toolInput.search_type as string;
      const industry = toolInput.industry as string || 'unknown';

      this.storeMemory({
        projectId,
        type: 'context',
        content: `Competitive search: ${company} - ${searchType}`,
        metadata: { company, searchType, industry, timestamp: new Date().toISOString() },
      });

      return JSON.stringify({
        company,
        searchType,
        industry,
        message: `Competitive search executed for ${company} - ${searchType}`,
        note: 'In production, integrate with competitor databases, market research APIs, etc.',
        mock_results: this.getMockCompetitorData(searchType, company),
      });
    }

    if (toolName === 'analyze_competitor') {
      const competitorName = toolInput.competitor_name as string;
      const analysisType = toolInput.analysis_type as string;

      return JSON.stringify({
        competitor: competitorName,
        analysisType,
        message: `Competitor analysis performed for ${competitorName}`,
        mock_analysis: {
          name: competitorName,
          overview: `${competitorName} is a key player in this market`,
          strengths: ['Strong brand', 'Large customer base'],
          weaknesses: ['Legacy technology', 'Slow innovation'],
        },
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  private getMockCompetitorData(searchType: string, company: string): Record<string, unknown> {
    const mockData: Record<string, Record<string, unknown>> = {
      direct_competitors: {
        competitors: [
          { name: 'Competitor A', type: 'direct', market_share: '25%' },
          { name: 'Competitor B', type: 'direct', market_share: '20%' },
          { name: 'Competitor C', type: 'direct', market_share: '15%' },
        ],
      },
      market_analysis: {
        market_size: '$5B',
        growth_rate: '12% CAGR',
        key_players: ['Company A', 'Company B', company],
      },
      product_comparison: {
        features_comparison: 'Feature matrix would be generated',
        pricing_comparison: 'Pricing tiers would be compared',
      },
      news: {
        recent_articles: [
          { title: `${company} competitor launches new product`, date: '2024-10-01' },
          { title: 'Market consolidation continues', date: '2024-09-15' },
        ],
      },
      strategic_moves: {
        recent_moves: [
          { company: 'Competitor A', move: 'Acquired startup X', date: '2024-08' },
          { company: 'Competitor B', move: 'Launched enterprise tier', date: '2024-07' },
        ],
      },
    };

    return mockData[searchType] || { message: 'No mock data available' };
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
        sources?: Array<{ url: string; title: string }>;
      }>;
    }>(response);

    if (parsed?.findings) {
      for (const f of parsed.findings) {
        const finding = this.storeFinding({
          projectId: context.projectId,
          questionId: context.questionId || 'competitive',
          category: f.category || 'competitive_intelligence',
          title: f.title,
          content: f.content,
          summary: f.summary,
          confidence: f.confidence || 'medium',
          sources: (f.sources || []).map(s => ({
            id: '',
            type: 'web' as const,
            url: s.url,
            title: s.title,
            accessedAt: new Date().toISOString(),
            relevanceScore: 0.6,
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

  private async extractInsights(response: string): Promise<string[]> {
    const parsed = this.parseJSON<{ insights?: string[] }>(response);
    return parsed?.insights || [];
  }
}
