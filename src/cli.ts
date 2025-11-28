#!/usr/bin/env node

import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import 'dotenv/config';

import { getOrchestrator } from './agents/orchestrator.js';
import { scopingParser } from './workflow/scoping-parser.js';

const args = process.argv.slice(2);
const command = args[0];

function printHelp(): void {
  console.log(`
Commercial Research Workflow CLI

Usage:
  npm run research <command> [options]

Commands:
  start <file>     Start a new research project from a scoping document
  quick            Start a quick research with interactive prompts
  template         Generate a scoping document template
  status <id>      Check the status of a research project
  help             Show this help message

Examples:
  npm run research start ./scoping.json
  npm run research start ./scoping.yaml
  npm run research quick
  npm run research template --format json > scoping.json
  npm run research template --format yaml > scoping.yaml

Environment Variables:
  ANTHROPIC_API_KEY     Your Anthropic API key (required)
  AGENTDB_PATH          Path to AgentDB database (default: ./data/research.db)
  MAX_CONCURRENT_AGENTS Maximum concurrent agent executions (default: 5)
`);
}

async function startResearch(filePath: string): Promise<void> {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Ensure data directory exists
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  console.log('📄 Reading scoping document...');
  const content = readFileSync(filePath, 'utf-8');

  console.log('🔍 Parsing scoping document...');
  const scopingDocument = scopingParser.parse(content);

  console.log(`\n📋 Research Project: ${scopingDocument.projectName}`);
  console.log(`🎯 Target: ${scopingDocument.targetCompany.name}`);
  console.log(`❓ Questions: ${scopingDocument.keyQuestions.length}`);
  console.log('');

  const orchestrator = getOrchestrator();

  // Set up event listeners
  orchestrator.on('event', (event) => {
    switch (event.type) {
      case 'project:updated':
        const payload = event.payload as { status: string; progress: number; currentPhase: string };
        console.log(`\n📊 Status: ${payload.status} (${payload.progress}%)`);
        console.log(`   Phase: ${payload.currentPhase}`);
        break;
      case 'agent:started':
        const agentPayload = event.payload as { agentType: string; question: string };
        console.log(`\n🤖 Agent Started: ${agentPayload.agentType}`);
        console.log(`   Task: ${agentPayload.question || 'Processing'}`);
        break;
      case 'finding:discovered':
        const findingPayload = event.payload as { agentType: string; findingsCount: number };
        console.log(`\n✨ New Findings: ${findingPayload.findingsCount} from ${findingPayload.agentType}`);
        break;
      case 'report:completed':
        console.log('\n📝 Report generated successfully!');
        break;
      case 'project:completed':
        console.log('\n✅ Research project completed!');
        break;
      case 'project:failed':
        const errorPayload = event.payload as { error: string };
        console.error(`\n❌ Project failed: ${errorPayload.error}`);
        break;
    }
  });

  console.log('🚀 Starting research workflow...\n');
  const project = await orchestrator.startProject(scopingDocument);
  console.log(`Project ID: ${project.id}`);

  // Keep the process running until complete
  await new Promise<void>((resolve) => {
    const checkStatus = setInterval(() => {
      const currentProject = orchestrator.getProject(project.id);
      if (currentProject?.status === 'completed' || currentProject?.status === 'failed') {
        clearInterval(checkStatus);

        if (currentProject.status === 'completed') {
          console.log('\n' + '='.repeat(60));
          console.log('RESEARCH SUMMARY');
          console.log('='.repeat(60));
          console.log(`Total Findings: ${currentProject.findings.length}`);
          console.log(`Total Sources: ${currentProject.metadata.totalSources}`);
          console.log(`Total Tokens Used: ${currentProject.metadata.totalTokensUsed}`);

          if (currentProject.report) {
            console.log('\n📄 Executive Summary:');
            console.log(currentProject.report.executiveSummary);
          }
        }

        orchestrator.close();
        resolve();
      }
    }, 1000);
  });
}

async function generateTemplate(format: string): Promise<void> {
  if (format === 'yaml') {
    console.log(scopingParser.generateYAMLTemplate());
  } else {
    console.log(scopingParser.generateTemplate());
  }
}

async function quickStart(): Promise<void> {
  // Interactive quick start
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('\n🚀 Quick Research Setup\n');

  const targetCompany = await question('Target company name: ');
  if (!targetCompany.trim()) {
    console.error('Error: Company name is required');
    rl.close();
    process.exit(1);
  }

  console.log('\nEnter your research questions (one per line, empty line to finish):');
  const questions: string[] = [];
  let q = await question('Question 1: ');
  while (q.trim()) {
    questions.push(q.trim());
    q = await question(`Question ${questions.length + 1}: `);
  }

  if (questions.length === 0) {
    console.log('No questions provided. Using default questions.');
    questions.push(
      `What is ${targetCompany}'s financial health and growth trajectory?`,
      `Who are ${targetCompany}'s main competitors?`,
      `What is the background of ${targetCompany}'s leadership team?`
    );
  }

  rl.close();

  // Ensure data directory exists
  const dataDir = resolve(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const scopingDocument = scopingParser.parseSimplified({
    targetCompany: targetCompany.trim(),
    questions,
  });

  console.log(`\n📋 Research Project: ${scopingDocument.projectName}`);
  console.log(`🎯 Target: ${scopingDocument.targetCompany.name}`);
  console.log(`❓ Questions: ${scopingDocument.keyQuestions.length}`);

  const orchestrator = getOrchestrator();

  orchestrator.on('event', (event) => {
    switch (event.type) {
      case 'project:updated':
        const payload = event.payload as { status: string; progress: number; currentPhase: string };
        process.stdout.write(`\r📊 Progress: ${payload.progress}% - ${payload.currentPhase}                    `);
        break;
      case 'project:completed':
        console.log('\n\n✅ Research completed!');
        break;
      case 'project:failed':
        const errorPayload = event.payload as { error: string };
        console.error(`\n\n❌ Failed: ${errorPayload.error}`);
        break;
    }
  });

  console.log('\n🚀 Starting research...\n');
  const project = await orchestrator.startProject(scopingDocument);

  // Wait for completion
  await new Promise<void>((resolve) => {
    const checkStatus = setInterval(() => {
      const currentProject = orchestrator.getProject(project.id);
      if (currentProject?.status === 'completed' || currentProject?.status === 'failed') {
        clearInterval(checkStatus);

        if (currentProject.status === 'completed' && currentProject.report) {
          console.log('\n' + '='.repeat(60));
          console.log('EXECUTIVE SUMMARY');
          console.log('='.repeat(60));
          console.log(currentProject.report.executiveSummary);
        }

        orchestrator.close();
        resolve();
      }
    }, 1000);
  });
}

// Main execution
async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('Set it with: export ANTHROPIC_API_KEY=your-api-key');
    process.exit(1);
  }

  switch (command) {
    case 'start':
      const filePath = args[1];
      if (!filePath) {
        console.error('Error: Please provide a scoping document file path');
        console.error('Usage: npm run research start <file>');
        process.exit(1);
      }
      await startResearch(resolve(process.cwd(), filePath));
      break;

    case 'quick':
      await quickStart();
      break;

    case 'template':
      const formatArg = args.find(a => a.startsWith('--format='));
      const format = formatArg ? formatArg.split('=')[1] : 'json';
      await generateTemplate(format);
      break;

    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
