# Commercial Research Workflow

An agentic workflow system for deep commercial research on companies, powered by Claude Opus 4.5 and AgentDB for shared memory across agents.

## Overview

This project implements a multi-agent research system that:

- Takes a **scoping document** as input with target company and key questions
- Deploys specialized AI agents to research different aspects
- Uses **AgentDB** to provide shared memory across all agents
- Synthesizes findings into a comprehensive research report
- Provides a **web dashboard** for initiating and monitoring research

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Web Dashboard (Next.js)                     │
│  - Create research projects                                      │
│  - Monitor progress in real-time                                 │
│  - View findings and reports                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Server (Express)                        │
│  - REST endpoints for project management                         │
│  - WebSocket for real-time updates                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Research Orchestrator                         │
│  - Parses scoping documents                                      │
│  - Plans research strategy                                       │
│  - Dispatches and coordinates agents                             │
│  - Manages workflow phases                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  Web Researcher  │ │ Financial Analyst │ │ Competitive Intel │
│                  │ │                   │ │                   │
│ - Web search     │ │ - SEC filings     │ │ - Competitors     │
│ - News analysis  │ │ - Funding data    │ │ - Market analysis │
│ - Company info   │ │ - Financials      │ │ - Positioning     │
└────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentDB (Shared Memory)                       │
│  - Findings storage                                              │
│  - Source registry                                               │
│  - Cross-agent context                                           │
│  - Task coordination                                             │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Report Generator                              │
│  - Synthesizes all findings                                      │
│  - Generates executive summary                                   │
│  - Creates structured report                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Claude Opus 4.5 via Vertex AI** - Claude models accessed through Google Cloud's Vertex AI
- **AgentDB** - Shared memory database for agent coordination
- **TypeScript** - Type-safe implementation
- **Express** - API server with WebSocket support
- **Next.js** - React-based web dashboard
- **Socket.IO** - Real-time updates
- **SQLite** - Persistent storage via better-sqlite3
- **GCP Authentication** - User credentials for secure Vertex AI access

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- **GCP Project** with Vertex AI API enabled
- **GCP Credentials** (gcloud CLI installed and authenticated)

### GCP Setup

Before using this application, you need to set up your GCP project:

```bash
# 1. Enable the Vertex AI API
gcloud services enable aiplatform.googleapis.com

# 2. Authenticate with GCP (if not already done)
gcloud auth login

# 3. Set your default project
gcloud config set project YOUR_PROJECT_ID
```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd commercial-research-workflow

# Install dependencies
npm install

# Install dashboard dependencies
cd dashboard && npm install && cd ..

# Copy environment file
cp .env.example .env

# Edit .env and configure GCP settings:
# GCP_PROJECT_ID=your-gcp-project-id
# GCP_REGION=us-central1

# Initialize the database
mkdir -p data
npm run init-db
```

### Running the Application

```bash
# Start both API server and dashboard
npm run dev

# Or run separately:
npm run dev:api      # Start API server on port 3001
npm run dev:dashboard # Start dashboard on port 3000
```

### Using the CLI

```bash
# Start research from a scoping document
npm run research start ./examples/scoping-document.json

# Quick start with interactive prompts
npm run research quick

# Generate a scoping document template
npm run research template > my-scoping.json
npm run research template --format=yaml > my-scoping.yaml
```

## Scoping Document Format

The scoping document defines the research project:

```json
{
  "projectName": "Commercial Research: Acme Corp",
  "targetCompany": {
    "name": "Acme Corporation",
    "website": "https://acme.com",
    "industry": "Technology",
    "headquarters": "San Francisco, CA"
  },
  "client": {
    "name": "Investment Committee"
  },
  "researchObjective": "Evaluate Acme Corp as a potential acquisition target",
  "keyQuestions": [
    {
      "id": "q-1",
      "question": "What is the company's financial health?",
      "priority": "critical",
      "category": "financial"
    },
    {
      "id": "q-2",
      "question": "Who are the main competitors?",
      "priority": "high",
      "category": "competitive"
    }
  ],
  "dataSources": {
    "webSearch": true,
    "newsArticles": true,
    "financialReports": true
  },
  "outputFormat": "detailed_report"
}
```

### Question Categories

- `financial` - Revenue, profitability, funding, valuations
- `competitive` - Competitors, market share, positioning
- `market` - Market size, trends, opportunities
- `leadership` - Executive team, governance, track record
- `technology` - Products, innovation, tech stack
- `legal` - Lawsuits, regulatory issues, compliance
- `operational` - Operations, supply chain, processes
- `reputation` - Brand perception, customer satisfaction

### Priority Levels

- `critical` - Must answer, highest priority
- `high` - Important for decision-making
- `medium` - Good to know
- `low` - Nice to have if time permits

## API Reference

### Authentication

All API endpoints (except `/api/health` and `/api/templates`) require GCP authentication. Include your GCP access token in the Authorization header:

```bash
# Get your access token
ACCESS_TOKEN=$(gcloud auth print-access-token)

# Make authenticated requests
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "X-GCP-Project-ID: your-project-id" \
     http://localhost:3001/api/projects
```

**Required Headers:**
- `Authorization: Bearer <access_token>` - Your GCP access token
- `X-GCP-Project-ID: <project_id>` - Your GCP project ID (optional if `GCP_PROJECT_ID` env var is set)

### Projects

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/projects` | GET | List all projects | Yes |
| `/api/projects` | POST | Create from scoping document | Yes |
| `/api/projects/quick` | POST | Quick create with questions | Yes |
| `/api/projects/:id` | GET | Get project details | Yes |
| `/api/projects/:id/findings` | GET | Get project findings | Yes |
| `/api/projects/:id/sources` | GET | Get project sources | Yes |
| `/api/projects/:id/report` | GET | Get generated report | Yes |
| `/api/projects/:id/pause` | POST | Pause a running project | Yes |

### Templates

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/templates/scoping` | GET | Get scoping document template | No |

### Health Check

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/health` | GET | Service health status | No |

### WebSocket Events

Subscribe to project updates:
```javascript
socket.emit('subscribe:project', projectId);
socket.on('project:event', (event) => {
  // Handle real-time updates
});
```

Event types:
- `project:created` - New project started
- `project:updated` - Status/progress changed
- `project:completed` - Research finished
- `project:failed` - Research failed
- `agent:started` - Agent began work
- `agent:progress` - Agent progress update
- `agent:completed` - Agent finished
- `finding:discovered` - New finding added
- `report:completed` - Report generated

## Agent Types

### Web Researcher
Conducts web searches and analyzes online content:
- Company websites and press releases
- News articles and industry publications
- General company information

### Financial Analyst
Analyzes financial data:
- SEC filings (for public companies)
- Funding announcements
- Revenue and growth estimates
- Financial health indicators

### Competitive Intelligence
Analyzes the competitive landscape:
- Competitor identification
- Market positioning
- Competitive advantages/disadvantages
- Industry dynamics

### Report Generator
Synthesizes findings into reports:
- Executive summary
- Structured sections
- Key insights and recommendations
- Risk assessment

## Configuration

Environment variables:

### GCP / Vertex AI Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | - | GCP Project ID for Vertex AI (required for production) |
| `GCP_REGION` | `us-central1` | GCP region for Vertex AI |

### Fallback Settings (Local Development)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Direct Anthropic API key (only used when GCP credentials not provided) |
| `ANTHROPIC_MODEL` | `claude-opus-4-5-20251101` | Model to use |

### Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENTDB_PATH` | `./data/research.db` | Database path |
| `API_PORT` | `3001` | API server port |
| `DASHBOARD_PORT` | `3000` | Dashboard port |
| `MAX_CONCURRENT_AGENTS` | `5` | Max parallel agents |
| `MAX_RESEARCH_DEPTH` | `3` | Research iteration depth |

## Extending the System

### Adding New Agents

1. Create a new agent class extending `BaseAgent`:

```typescript
import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';

export class CustomAgent extends BaseAgent {
  constructor(memory: AgentDBClient) {
    super({
      name: 'Custom Agent',
      type: 'custom_agent',
      systemPrompt: 'Your agent instructions...',
    }, memory);
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    // Implementation
  }
}
```

2. Register the agent in the orchestrator

### Adding Data Sources

Integrate additional data sources by:

1. Adding tool definitions in agent classes
2. Implementing tool handlers that call external APIs
3. Registering sources in AgentDB

## Project Structure

```
.
├── src/
│   ├── agents/           # Agent implementations
│   │   ├── base-agent.ts
│   │   ├── web-researcher.ts
│   │   ├── financial-analyst.ts
│   │   ├── competitive-intelligence.ts
│   │   ├── report-generator.ts
│   │   └── orchestrator.ts
│   ├── api/              # API server
│   │   └── server.ts
│   ├── memory/           # AgentDB integration
│   │   └── agentdb-client.ts
│   ├── types/            # TypeScript types
│   │   └── index.ts
│   ├── workflow/         # Workflow utilities
│   │   └── scoping-parser.ts
│   └── cli.ts            # Command-line interface
├── dashboard/            # Next.js web dashboard
│   ├── app/
│   ├── lib/
│   └── ...
├── examples/             # Example scoping documents
├── data/                 # Database storage
└── package.json
```

## License

MIT
