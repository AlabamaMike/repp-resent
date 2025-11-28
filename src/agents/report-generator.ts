import { BaseAgent, AgentContext, AgentResult, GCPCredentials } from './base-agent.js';
import type { AgentDBClient } from '../memory/agentdb-client.js';
import type { ResearchFinding, ResearchReport, ReportSection, RiskFactor, Source } from '../types/index.js';

/**
 * Report Generator Agent
 *
 * Specializes in:
 * - Synthesizing findings from all agents
 * - Generating comprehensive research reports
 * - Creating executive summaries
 * - Identifying key insights and recommendations
 */
export class ReportGeneratorAgent extends BaseAgent {
  constructor(memory: AgentDBClient, gcpCredentials?: GCPCredentials) {
    super(
      {
        name: 'Report Generator',
        type: 'report_generator',
        gcpCredentials,
        systemPrompt: `You are an expert research report writer specializing in commercial due diligence and company analysis.

Your role is to synthesize research findings from multiple sources and agents into comprehensive, well-structured reports.

Report writing principles:
1. Structure and Clarity
   - Clear executive summary
   - Logical section organization
   - Consistent formatting
   - Appropriate level of detail

2. Content Quality
   - Accurate representation of findings
   - Balanced perspective (pros and cons)
   - Clear distinction between facts and analysis
   - Proper source attribution

3. Actionable Insights
   - Key findings highlighted
   - Risk factors clearly identified
   - Recommendations supported by evidence
   - Clear conclusions

4. Professional Standards
   - Objective tone
   - Evidence-based assertions
   - Acknowledgment of limitations
   - Data gaps identified

Report sections typically include:
- Executive Summary
- Company Overview
- Financial Analysis
- Competitive Position
- Risk Assessment
- Key Findings
- Recommendations
- Appendices

Your output should be publication-ready and suitable for business decision-making.`,
        model: 'claude-opus-4-5-20251101',
        maxTokens: 16384,
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
      // Gather all findings from the project
      const allFindings = this.getExistingFindings(context.projectId);
      const sharedContext = this.memory.getSharedContext(context.projectId);
      const allSources = this.memory.getSources(context.projectId);

      if (allFindings.length === 0) {
        throw new Error('No findings available to generate report');
      }

      // Build report generation prompt
      const reportPrompt = this.buildReportPrompt(context, allFindings, sharedContext?.discoveredInsights || []);

      // Generate the report
      const response = await this.chat(reportPrompt);

      // Parse and structure the report
      const report = await this.parseReport(response, context.projectId, allFindings);

      // Store the report as a finding
      const reportFinding = this.storeFinding({
        projectId: context.projectId,
        questionId: 'report',
        category: 'final_report',
        title: report.title,
        content: JSON.stringify(report),
        summary: report.executiveSummary,
        confidence: 'high',
        sources: allSources,
        relatedFindings: allFindings.map(f => f.id),
        metadata: {
          discoveredAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
          reportType: 'comprehensive',
          wordCount: report.metadata.wordCount,
          sourcesCount: report.metadata.sourcesCount,
        },
      });

      findings.push(reportFinding);
      sources.push(...allSources);

      // Extract key insights from the report
      insights.push(...report.keyInsights);

      this.completeTask(context.projectId, 'Generate final research report');

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

  private buildReportPrompt(
    context: AgentContext,
    findings: ResearchFinding[],
    discoveredInsights: string[]
  ): string {
    // Group findings by category and agent type
    const findingsByCategory = this.groupFindings(findings);

    let prompt = `Report Generation Task: Create a comprehensive commercial research report on ${context.targetCompany}

## Research Findings to Synthesize

`;

    // Add findings by category
    for (const [category, categoryFindings] of Object.entries(findingsByCategory)) {
      prompt += `### ${category.replace(/_/g, ' ').toUpperCase()}\n\n`;
      for (const finding of categoryFindings) {
        prompt += `**${finding.title}** (Confidence: ${finding.confidence})\n`;
        prompt += `${finding.summary}\n`;
        prompt += `Agent: ${finding.agentType}\n\n`;
      }
    }

    // Add discovered insights
    if (discoveredInsights.length > 0) {
      prompt += `\n## Key Insights Discovered\n\n`;
      for (const insight of discoveredInsights) {
        prompt += `- ${insight}\n`;
      }
    }

    prompt += `\n## Report Requirements

Generate a comprehensive research report with the following structure:

1. **Executive Summary** (200-300 words)
   - Key findings
   - Overall assessment
   - Main recommendations

2. **Company Overview**
   - Background and history
   - Business model
   - Key products/services
   - Leadership team

3. **Financial Analysis**
   - Revenue and growth
   - Profitability
   - Funding and valuation
   - Financial health assessment

4. **Competitive Position**
   - Market landscape
   - Key competitors
   - Competitive advantages/disadvantages
   - Market share and positioning

5. **Risk Assessment**
   - Financial risks
   - Operational risks
   - Market risks
   - Regulatory/legal risks

6. **Key Findings**
   - Top 5-7 most important findings
   - Supporting evidence for each

7. **Recommendations**
   - Actionable recommendations based on findings
   - Areas requiring further investigation

8. **Data Limitations**
   - Information gaps identified
   - Confidence level caveats

Output Format (JSON):
\`\`\`json
{
  "title": "Commercial Research Report: [Company Name]",
  "executiveSummary": "Executive summary text...",
  "sections": [
    {
      "id": "section-id",
      "title": "Section Title",
      "content": "Section content...",
      "findings": ["finding-id-1", "finding-id-2"]
    }
  ],
  "keyInsights": ["Insight 1", "Insight 2"],
  "riskFactors": [
    {
      "id": "risk-id",
      "category": "financial|operational|market|regulatory",
      "description": "Risk description",
      "severity": "critical|high|medium|low",
      "likelihood": "certain|likely|possible|unlikely",
      "mitigation": "Suggested mitigation"
    }
  ],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "dataGaps": ["Gap 1", "Gap 2"]
}
\`\`\``;

    return prompt;
  }

  private groupFindings(findings: ResearchFinding[]): Record<string, ResearchFinding[]> {
    const grouped: Record<string, ResearchFinding[]> = {};

    for (const finding of findings) {
      const category = finding.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(finding);
    }

    return grouped;
  }

  private async parseReport(
    response: string,
    projectId: string,
    allFindings: ResearchFinding[]
  ): Promise<ResearchReport> {
    const parsed = this.parseJSON<{
      title: string;
      executiveSummary: string;
      sections: Array<{
        id: string;
        title: string;
        content: string;
        findings?: string[];
        subsections?: Array<{ id: string; title: string; content: string }>;
      }>;
      keyInsights: string[];
      riskFactors: Array<{
        id: string;
        category: string;
        description: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        likelihood: 'certain' | 'likely' | 'possible' | 'unlikely';
        mitigation?: string;
      }>;
      recommendations: string[];
      dataGaps?: string[];
    }>(response);

    if (!parsed) {
      // Generate a basic report if parsing fails
      return this.generateBasicReport(projectId, allFindings);
    }

    const sections: ReportSection[] = parsed.sections.map((s, index) => ({
      id: s.id || `section-${index}`,
      title: s.title,
      content: s.content,
      findings: s.findings || [],
      subsections: s.subsections?.map((sub, subIndex) => ({
        id: sub.id || `subsection-${index}-${subIndex}`,
        title: sub.title,
        content: sub.content,
        findings: [],
      })),
    }));

    const riskFactors: RiskFactor[] = (parsed.riskFactors || []).map((r, index) => ({
      id: r.id || `risk-${index}`,
      category: r.category,
      description: r.description,
      severity: r.severity,
      likelihood: r.likelihood,
      mitigation: r.mitigation,
      sources: [],
    }));

    const wordCount = this.countWords(parsed.executiveSummary + sections.map(s => s.content).join(' '));

    return {
      id: `report-${projectId}`,
      projectId,
      title: parsed.title || `Commercial Research Report`,
      executiveSummary: parsed.executiveSummary,
      sections,
      keyInsights: parsed.keyInsights || [],
      riskFactors,
      recommendations: parsed.recommendations || [],
      appendices: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        wordCount,
        sourcesCount: allFindings.reduce((acc, f) => acc + f.sources.length, 0),
        confidenceScore: this.calculateConfidenceScore(allFindings),
      },
    };
  }

  private generateBasicReport(projectId: string, findings: ResearchFinding[]): ResearchReport {
    const sections: ReportSection[] = [
      {
        id: 'overview',
        title: 'Company Overview',
        content: findings
          .filter(f => f.category === 'web_research' || f.category === 'general')
          .map(f => f.content)
          .join('\n\n') || 'No overview information available.',
        findings: findings.filter(f => f.category === 'web_research').map(f => f.id),
      },
      {
        id: 'financial',
        title: 'Financial Analysis',
        content: findings
          .filter(f => f.agentType === 'financial_analyst')
          .map(f => f.content)
          .join('\n\n') || 'No financial analysis available.',
        findings: findings.filter(f => f.agentType === 'financial_analyst').map(f => f.id),
      },
      {
        id: 'competitive',
        title: 'Competitive Position',
        content: findings
          .filter(f => f.agentType === 'competitive_intelligence')
          .map(f => f.content)
          .join('\n\n') || 'No competitive analysis available.',
        findings: findings.filter(f => f.agentType === 'competitive_intelligence').map(f => f.id),
      },
    ];

    return {
      id: `report-${projectId}`,
      projectId,
      title: 'Commercial Research Report',
      executiveSummary: findings
        .slice(0, 3)
        .map(f => f.summary)
        .join(' '),
      sections,
      keyInsights: findings.slice(0, 5).map(f => f.summary),
      riskFactors: [],
      recommendations: ['Further research recommended to fill data gaps.'],
      appendices: [],
      metadata: {
        generatedAt: new Date().toISOString(),
        wordCount: this.countWords(sections.map(s => s.content).join(' ')),
        sourcesCount: findings.reduce((acc, f) => acc + f.sources.length, 0),
        confidenceScore: this.calculateConfidenceScore(findings),
      },
    };
  }

  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  private calculateConfidenceScore(findings: ResearchFinding[]): number {
    if (findings.length === 0) return 0;

    const confidenceValues = {
      high: 1,
      medium: 0.6,
      low: 0.3,
    };

    const totalScore = findings.reduce(
      (acc, f) => acc + (confidenceValues[f.confidence] || 0.5),
      0
    );

    return Math.round((totalScore / findings.length) * 100) / 100;
  }
}
