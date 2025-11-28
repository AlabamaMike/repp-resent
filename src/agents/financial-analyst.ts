import Anthropic from '@anthropic-ai/sdk';
import { BaseAgent, AgentContext, AgentResult, GCPCredentials } from './base-agent.js';
import type { AgentDBClient } from '../memory/agentdb-client.js';
import type { ResearchFinding, Source } from '../types/index.js';

/**
 * Financial Analyst Agent
 *
 * Specializes in:
 * - Financial statement analysis
 * - Revenue and growth metrics
 * - Funding history and valuation
 * - Market position and financial health
 * - Risk assessment from financial perspective
 */
export class FinancialAnalystAgent extends BaseAgent {
  constructor(memory: AgentDBClient, gcpCredentials?: GCPCredentials) {
    super(
      {
        name: 'Financial Analyst',
        type: 'financial_analyst',
        gcpCredentials,
        systemPrompt: `You are an expert financial analyst specializing in commercial due diligence and company financial assessment.

Your role is to analyze financial information about companies to assess their financial health, growth trajectory, and market position.

Areas of expertise:
1. Financial Statement Analysis
   - Revenue trends and growth rates
   - Profitability metrics (margins, EBITDA)
   - Cash flow analysis
   - Balance sheet health (debt levels, liquidity)

2. Valuation Assessment
   - Funding rounds and valuations
   - Comparable company analysis
   - Market cap and enterprise value
   - Revenue multiples

3. Financial Risk Analysis
   - Debt and leverage concerns
   - Cash burn rate (for startups)
   - Customer concentration risk
   - Foreign exchange exposure

4. Growth Metrics
   - Year-over-year growth
   - Customer acquisition metrics
   - Market penetration
   - Geographic expansion

Guidelines:
- Use multiple data sources to verify financial figures
- Note when figures are estimates vs confirmed
- Identify trends and patterns over time
- Flag any red flags or concerns
- Compare against industry benchmarks when possible
- Clearly state the source and date of financial data

Output your analysis in a structured format with clear citations and confidence levels.`,
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
      // Define financial research tools
      const tools: Anthropic.Tool[] = [
        {
          name: 'search_financial_data',
          description: 'Search for financial data, SEC filings, funding announcements, and financial news about a company.',
          input_schema: {
            type: 'object' as const,
            properties: {
              company: {
                type: 'string',
                description: 'Company name to search for',
              },
              data_type: {
                type: 'string',
                enum: ['sec_filings', 'funding', 'financial_news', 'earnings', 'analyst_reports'],
                description: 'Type of financial data to search for',
              },
              time_period: {
                type: 'string',
                description: 'Time period for the search (e.g., "last_year", "last_5_years")',
              },
            },
            required: ['company', 'data_type'],
          },
        },
        {
          name: 'analyze_metrics',
          description: 'Perform financial calculations and analysis on provided data.',
          input_schema: {
            type: 'object' as const,
            properties: {
              metric_type: {
                type: 'string',
                enum: ['growth_rate', 'profitability', 'liquidity', 'valuation', 'comparison'],
                description: 'Type of financial analysis to perform',
              },
              data: {
                type: 'object',
                description: 'Financial data to analyze',
              },
            },
            required: ['metric_type', 'data'],
          },
        },
      ];

      // Build the analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(context);

      // Get existing findings for context
      const existingFindings = this.getExistingFindings(context.projectId);
      const webFindings = existingFindings.filter(f => f.agentType === 'web_researcher');

      const contextSummary = webFindings.length > 0
        ? `\n\nRelevant findings from web research:\n${webFindings.map(f => `- ${f.title}: ${f.summary}`).join('\n')}`
        : '';

      // Execute financial analysis
      const response = await this.chatWithTools(
        analysisPrompt + contextSummary,
        tools,
        async (toolName, toolInput) => {
          return this.handleToolCall(toolName, toolInput, context.projectId, sources);
        }
      );

      // Parse findings
      const parsedFindings = await this.parseFindings(response, context);
      findings.push(...parsedFindings);

      // Extract financial insights
      const extractedInsights = await this.extractInsights(response);
      insights.push(...extractedInsights);

      // Store insights
      for (const insight of insights) {
        this.addInsight(context.projectId, `[Financial] ${insight}`);
      }

      this.completeTask(context.projectId, `Financial analysis for: ${context.question || 'general financial assessment'}`);

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
    let prompt = `Financial Analysis Task: Conduct comprehensive financial analysis of ${context.targetCompany}`;

    if (context.question) {
      prompt += `\n\nSpecific Question to Answer: ${context.question}`;
    }

    if (context.additionalContext) {
      prompt += `\n\nAdditional Context: ${context.additionalContext}`;
    }

    prompt += `\n\nInstructions:
1. Search for and analyze available financial information:
   - Recent financial statements (if publicly available)
   - Funding history and valuations
   - Revenue figures and growth rates
   - Profitability indicators
   - Debt and cash position

2. For public companies, look for:
   - SEC filings (10-K, 10-Q)
   - Earnings reports and calls
   - Analyst coverage and ratings

3. For private companies, look for:
   - Funding announcements
   - Revenue estimates from press
   - Valuation data from funding rounds
   - Employee count trends (proxy for growth)

4. Calculate and assess:
   - Year-over-year growth rates
   - Profitability trends
   - Financial health indicators
   - Valuation metrics vs peers

5. Identify:
   - Financial strengths
   - Financial risks and concerns
   - Key metrics to monitor
   - Data gaps and limitations

6. Provide your analysis in this JSON format:
\`\`\`json
{
  "findings": [
    {
      "title": "Financial finding title",
      "content": "Detailed financial analysis",
      "summary": "Brief summary",
      "confidence": "high|medium|low",
      "category": "revenue|profitability|funding|risk|valuation",
      "metrics": {
        "metric_name": "value"
      },
      "sources": [
        {
          "url": "source url",
          "title": "source title",
          "type": "sec_filing|press_release|news|analyst_report",
          "date": "date"
        }
      ]
    }
  ],
  "insights": ["Financial insight 1", "Financial insight 2"],
  "risk_factors": [
    {
      "factor": "Risk description",
      "severity": "high|medium|low",
      "evidence": "Supporting evidence"
    }
  ],
  "data_gaps": ["Missing data point 1", "Missing data point 2"]
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
    if (toolName === 'search_financial_data') {
      const company = toolInput.company as string;
      const dataType = toolInput.data_type as string;
      const timePeriod = toolInput.time_period as string || 'last_year';

      // Store search in memory
      this.storeMemory({
        projectId,
        type: 'context',
        content: `Financial data search: ${company} - ${dataType}`,
        metadata: { company, dataType, timePeriod, timestamp: new Date().toISOString() },
      });

      // In production, integrate with financial data APIs (SEC EDGAR, Crunchbase, PitchBook, etc.)
      return JSON.stringify({
        company,
        dataType,
        timePeriod,
        message: `Financial data search executed for ${company} - ${dataType}`,
        note: 'In production, integrate with SEC EDGAR API, Crunchbase, PitchBook, or similar financial data providers.',
        mock_data: this.getMockFinancialData(dataType, company),
      });
    }

    if (toolName === 'analyze_metrics') {
      const metricType = toolInput.metric_type as string;
      const data = toolInput.data as Record<string, unknown>;

      return JSON.stringify({
        metricType,
        analysis: `Analysis performed for ${metricType}`,
        note: 'Calculations would be performed on actual financial data.',
        input_data: data,
      });
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }

  private getMockFinancialData(dataType: string, company: string): Record<string, unknown> {
    const mockData: Record<string, Record<string, unknown>> = {
      sec_filings: {
        filings: [
          { type: '10-K', date: '2024-03-15', url: 'https://sec.gov/example' },
          { type: '10-Q', date: '2024-06-15', url: 'https://sec.gov/example2' },
        ],
      },
      funding: {
        rounds: [
          { type: 'Series B', amount: '$50M', date: '2023-06', valuation: '$200M' },
          { type: 'Series A', amount: '$15M', date: '2021-09', valuation: '$60M' },
        ],
        total_raised: '$65M',
      },
      financial_news: {
        articles: [
          { title: `${company} Reports Strong Q3 Results`, date: '2024-10-15' },
          { title: `${company} Expands into New Markets`, date: '2024-08-20' },
        ],
      },
      earnings: {
        last_quarter: {
          revenue: '$45M',
          growth_yoy: '32%',
          net_income: '$5M',
        },
      },
      analyst_reports: {
        coverage: 'Limited',
        average_rating: 'Buy',
        price_target: '$45',
      },
    };

    return mockData[dataType] || { message: 'No mock data available for this type' };
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
        metrics?: Record<string, unknown>;
        sources?: Array<{
          url: string;
          title: string;
          type?: string;
          date?: string;
        }>;
      }>;
    }>(response);

    if (parsed?.findings) {
      for (const f of parsed.findings) {
        const finding = this.storeFinding({
          projectId: context.projectId,
          questionId: context.questionId || 'financial',
          category: f.category || 'financial_analysis',
          title: f.title,
          content: f.content,
          summary: f.summary,
          confidence: f.confidence || 'medium',
          sources: (f.sources || []).map(s => ({
            id: '',
            type: 'financial_report' as const,
            url: s.url,
            title: s.title,
            publishedDate: s.date,
            accessedAt: new Date().toISOString(),
            relevanceScore: 0.7,
          })),
          relatedFindings: [],
          metadata: {
            discoveredAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            metrics: f.metrics,
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
