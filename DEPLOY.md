# GCP Cloud Run Deployment Guide

This guide explains how to deploy the Commercial Research Workflow application to Google Cloud Platform using Cloud Run and Cloud Build.

## Architecture

The application is deployed as two Cloud Run services:

- **research-api**: Express API server with WebSocket support (port 8080)
- **research-dashboard**: Next.js frontend dashboard (port 8080)

## Prerequisites

1. A Google Cloud Platform account with billing enabled
2. The [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed
3. A GCP project created

## Initial Setup

### 1. Enable Required APIs

```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com
```

### 2. Configure IAM Permissions

Grant Cloud Build permission to deploy to Cloud Run:

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Run Admin role to Cloud Build service account
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

# Grant Service Account User role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

### 3. Store Secrets in Secret Manager

Store your API keys securely:

```bash
# Create secrets
echo -n "your-anthropic-api-key" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding ANTHROPIC_API_KEY \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Deployment Methods

### Method 1: Connect Repository (Recommended)

This method automatically triggers deployments when you push to your repository.

1. Go to [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Click **"Connect Repository"**
3. Select your source (GitHub, GitLab, Bitbucket, etc.)
4. Authenticate and select this repository
5. Create a trigger:
   - **Name**: `deploy-research-workflow`
   - **Event**: Push to a branch
   - **Branch**: `^main$` (or your preferred branch)
   - **Configuration**: Cloud Build configuration file
   - **Location**: `/cloudbuild.yaml`
6. Click **Create**

### Method 2: Manual Deployment

Deploy manually using the gcloud CLI:

```bash
# Submit build to Cloud Build
gcloud builds submit --config=cloudbuild.yaml
```

## Configuration

### Environment Variables

After initial deployment, configure the API service with your secrets:

```bash
# Update API service with Anthropic API key from Secret Manager
gcloud run services update research-api \
  --region us-central1 \
  --update-secrets="ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest"
```

### Custom Configuration

You can override default settings by modifying the `cloudbuild.yaml` substitutions:

```yaml
substitutions:
  _REGION: us-central1          # Change deployment region
  _API_SERVICE_NAME: research-api
  _DASHBOARD_SERVICE_NAME: research-dashboard
```

Or pass them during manual deployment:

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_REGION=europe-west1
```

## Database Considerations

The default configuration uses SQLite which stores data in the container's filesystem. This means:

- **Data is ephemeral**: Data is lost when the container restarts
- **Not suitable for production workloads with persistent data**

For production, consider:

1. **Cloud SQL (PostgreSQL)**: Recommended for persistent data
2. **Cloud Firestore**: For NoSQL document storage
3. **Cloud Storage**: For storing research reports and documents

To use Cloud SQL:

```bash
# Create a Cloud SQL instance
gcloud sql instances create research-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1

# Create database
gcloud sql databases create research --instance=research-db

# Update API service to connect to Cloud SQL
gcloud run services update research-api \
  --region us-central1 \
  --add-cloudsql-instances=$PROJECT_ID:us-central1:research-db \
  --update-env-vars="DATABASE_URL=postgres://..."
```

## Monitoring

### View Logs

```bash
# API service logs
gcloud run services logs read research-api --region us-central1

# Dashboard service logs
gcloud run services logs read research-dashboard --region us-central1
```

### View Service URLs

```bash
# Get API URL
gcloud run services describe research-api \
  --region us-central1 \
  --format='value(status.url)'

# Get Dashboard URL
gcloud run services describe research-dashboard \
  --region us-central1 \
  --format='value(status.url)'
```

## Scaling Configuration

The default configuration includes:

- **Minimum instances**: 0 (scales to zero when idle)
- **Maximum instances**: 10
- **Memory**: 1GB (API), 512MB (Dashboard)
- **CPU**: 1 vCPU
- **Request timeout**: 300 seconds

Modify these in `cloudbuild.yaml` or update running services:

```bash
gcloud run services update research-api \
  --region us-central1 \
  --min-instances=1 \
  --max-instances=20 \
  --memory=2Gi
```

## Troubleshooting

### Build Failures

Check build logs:

```bash
gcloud builds list --limit=5
gcloud builds log BUILD_ID
```

### Service Not Starting

Check service logs:

```bash
gcloud run services logs read research-api --region us-central1 --limit=50
```

### CORS Issues

Ensure the API service has the correct `DASHBOARD_URL` environment variable:

```bash
DASHBOARD_URL=$(gcloud run services describe research-dashboard --region us-central1 --format='value(status.url)')
gcloud run services update research-api --region us-central1 --update-env-vars="DASHBOARD_URL=$DASHBOARD_URL"
```

## Cost Optimization

- Use minimum instances = 0 for development environments
- Set appropriate memory limits (don't over-provision)
- Use Cloud Build's free tier (120 build-minutes/day)
- Consider using Artifact Registry instead of Container Registry for better pricing

## Security Best Practices

1. **Never commit API keys** - Use Secret Manager
2. **Enable authentication** - Remove `--allow-unauthenticated` for internal services
3. **Use IAM** - Implement Identity-Aware Proxy for user authentication
4. **Enable VPC** - Use VPC connectors for private networking
5. **Review logs** - Enable Cloud Audit Logs for compliance
