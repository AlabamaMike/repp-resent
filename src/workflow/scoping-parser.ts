import { v4 as uuidv4 } from 'uuid';
import YAML from 'yaml';
import { ScopingDocumentSchema, type ScopingDocument, type KeyQuestion } from '../types/index.js';

/**
 * Scoping Document Parser
 *
 * Parses and validates scoping documents from various formats:
 * - JSON
 * - YAML
 * - Plain text (with AI-assisted parsing)
 */
export class ScopingParser {
  /**
   * Parse a scoping document from JSON string
   */
  parseJSON(jsonString: string): ScopingDocument {
    try {
      const data = JSON.parse(jsonString);
      return this.validateAndEnrich(data);
    } catch (error) {
      throw new Error(`Failed to parse JSON scoping document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse a scoping document from YAML string
   */
  parseYAML(yamlString: string): ScopingDocument {
    try {
      const data = YAML.parse(yamlString);
      return this.validateAndEnrich(data);
    } catch (error) {
      throw new Error(`Failed to parse YAML scoping document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse from a simplified format (for quick project creation)
   */
  parseSimplified(input: {
    targetCompany: string;
    questions: string[];
    clientName?: string;
    objective?: string;
  }): ScopingDocument {
    const keyQuestions: KeyQuestion[] = input.questions.map((q, index) => ({
      id: `q-${index + 1}`,
      question: q,
      priority: 'high' as const,
      category: this.inferCategory(q),
    }));

    const now = new Date().toISOString();

    return this.validateAndEnrich({
      projectName: `Research: ${input.targetCompany}`,
      targetCompany: {
        name: input.targetCompany,
      },
      client: {
        name: input.clientName || 'Internal',
      },
      researchObjective: input.objective || `Comprehensive commercial research on ${input.targetCompany}`,
      keyQuestions,
      dataSources: {
        webSearch: true,
        newsArticles: true,
        financialReports: true,
      },
      outputFormat: 'detailed_report',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Auto-detect format and parse
   */
  parse(content: string): ScopingDocument {
    const trimmed = content.trim();

    // Try JSON first
    if (trimmed.startsWith('{')) {
      return this.parseJSON(content);
    }

    // Try YAML
    if (trimmed.includes(':') && !trimmed.startsWith('{')) {
      try {
        return this.parseYAML(content);
      } catch {
        // Fall through to error
      }
    }

    throw new Error('Unable to determine scoping document format. Please provide JSON or YAML.');
  }

  /**
   * Validate and enrich the scoping document
   */
  private validateAndEnrich(data: Record<string, unknown>): ScopingDocument {
    // Add IDs if missing
    if (!data.id) {
      data.id = uuidv4();
    }

    // Add timestamps if missing
    const now = new Date().toISOString();
    if (!data.createdAt) {
      data.createdAt = now;
    }
    if (!data.updatedAt) {
      data.updatedAt = now;
    }

    // Ensure key questions have IDs
    if (Array.isArray(data.keyQuestions)) {
      data.keyQuestions = (data.keyQuestions as Array<Record<string, unknown>>).map((q, index) => ({
        ...q,
        id: q.id || `q-${index + 1}`,
        priority: q.priority || 'medium',
        category: q.category || this.inferCategory(q.question as string),
      }));
    }

    // Set default data sources
    if (!data.dataSources) {
      data.dataSources = {
        webSearch: true,
        newsArticles: true,
        financialReports: true,
        socialMedia: false,
        patents: false,
        courtRecords: false,
      };
    }

    // Validate with Zod
    const result = ScopingDocumentSchema.safeParse(data);
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new Error(`Invalid scoping document: ${errors}`);
    }

    return result.data;
  }

  /**
   * Infer question category from question text
   */
  private inferCategory(question: string): KeyQuestion['category'] {
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('revenue') || lowerQuestion.includes('profit') ||
        lowerQuestion.includes('financial') || lowerQuestion.includes('funding') ||
        lowerQuestion.includes('valuation') || lowerQuestion.includes('cash')) {
      return 'financial';
    }

    if (lowerQuestion.includes('competitor') || lowerQuestion.includes('market share') ||
        lowerQuestion.includes('competitive') || lowerQuestion.includes('rival')) {
      return 'competitive';
    }

    if (lowerQuestion.includes('market') || lowerQuestion.includes('industry') ||
        lowerQuestion.includes('sector') || lowerQuestion.includes('trend')) {
      return 'market';
    }

    if (lowerQuestion.includes('ceo') || lowerQuestion.includes('founder') ||
        lowerQuestion.includes('leadership') || lowerQuestion.includes('executive') ||
        lowerQuestion.includes('management')) {
      return 'leadership';
    }

    if (lowerQuestion.includes('technology') || lowerQuestion.includes('tech') ||
        lowerQuestion.includes('platform') || lowerQuestion.includes('product') ||
        lowerQuestion.includes('innovation')) {
      return 'technology';
    }

    if (lowerQuestion.includes('legal') || lowerQuestion.includes('lawsuit') ||
        lowerQuestion.includes('regulation') || lowerQuestion.includes('compliance')) {
      return 'legal';
    }

    if (lowerQuestion.includes('operation') || lowerQuestion.includes('process') ||
        lowerQuestion.includes('supply chain') || lowerQuestion.includes('logistics')) {
      return 'operational';
    }

    if (lowerQuestion.includes('reputation') || lowerQuestion.includes('brand') ||
        lowerQuestion.includes('review') || lowerQuestion.includes('customer satisfaction')) {
      return 'reputation';
    }

    return 'custom';
  }

  /**
   * Generate a template scoping document
   */
  generateTemplate(): string {
    const template: ScopingDocument = {
      id: 'template-id',
      projectName: 'Commercial Research: [Company Name]',
      targetCompany: {
        name: '[Target Company Name]',
        website: 'https://example.com',
        industry: '[Industry]',
        headquarters: '[City, Country]',
        aliases: ['[Alternative Name 1]', '[Alternative Name 2]'],
      },
      client: {
        name: '[Client Name]',
        contactEmail: 'contact@client.com',
      },
      researchObjective: 'Conduct comprehensive commercial due diligence on [Company Name] to assess [specific purpose, e.g., potential acquisition, partnership, investment].',
      keyQuestions: [
        {
          id: 'q-1',
          question: 'What is the company\'s current financial health and growth trajectory?',
          priority: 'critical',
          category: 'financial',
          subQuestions: [
            'What is their annual revenue and growth rate?',
            'Are they profitable or burning cash?',
            'What is their funding history and current valuation?',
          ],
        },
        {
          id: 'q-2',
          question: 'Who are the main competitors and what is the competitive landscape?',
          priority: 'high',
          category: 'competitive',
          subQuestions: [
            'Who are the top 3-5 direct competitors?',
            'What is the estimated market share distribution?',
            'What are the key competitive differentiators?',
          ],
        },
        {
          id: 'q-3',
          question: 'What is the background and track record of the leadership team?',
          priority: 'high',
          category: 'leadership',
        },
        {
          id: 'q-4',
          question: 'Are there any legal, regulatory, or reputational concerns?',
          priority: 'medium',
          category: 'legal',
        },
      ],
      additionalContext: 'Include any additional context, constraints, or specific areas of focus here.',
      dataSources: {
        webSearch: true,
        newsArticles: true,
        financialReports: true,
        socialMedia: false,
        patents: false,
        courtRecords: false,
        customSources: ['https://specific-source.com/data'],
      },
      outputFormat: 'detailed_report',
      deadline: '2024-12-31',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return JSON.stringify(template, null, 2);
  }

  /**
   * Generate YAML template
   */
  generateYAMLTemplate(): string {
    const jsonTemplate = this.generateTemplate();
    const parsed = JSON.parse(jsonTemplate);
    return YAML.stringify(parsed);
  }
}

// Export singleton instance
export const scopingParser = new ScopingParser();
