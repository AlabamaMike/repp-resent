# Complete GCP Deployment Guide

This guide walks you through every step to deploy the Commercial Research Workflow application to Google Cloud Platform. All steps can be executed through the Google Cloud Console web interface.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create a GCP Project](#2-create-a-gcp-project)
3. [Enable Billing](#3-enable-billing)
4. [Enable Required APIs](#4-enable-required-apis)
5. [Set Up Cloud Shell](#5-set-up-cloud-shell)
6. [Configure IAM Permissions](#6-configure-iam-permissions)
7. [Store Secrets in Secret Manager](#7-store-secrets-in-secret-manager)
8. [Connect Your Repository](#8-connect-your-repository)
9. [Create Cloud Build Trigger](#9-create-cloud-build-trigger)
10. [Run the Deployment](#10-run-the-deployment)
11. [Configure Cloud Run Services](#11-configure-cloud-run-services)
12. [Test Your Deployment](#12-test-your-deployment)
13. [Set Up Monitoring](#13-set-up-monitoring)
14. [Optional: Set Up Cloud SQL](#14-optional-set-up-cloud-sql)
15. [Troubleshooting](#15-troubleshooting)
16. [Cost Management](#16-cost-management)
17. [Cleanup](#17-cleanup)

---

## 1. Prerequisites

Before starting, ensure you have:

- A Google account
- A credit card for billing (you won't be charged if you stay within free tier limits)
- This repository pushed to GitHub, GitLab, Bitbucket, or Cloud Source Repositories

**Estimated time:** 30-45 minutes for full deployment

**Estimated cost:** ~$5-10/month with minimal usage (scales to zero when idle)

---

## 2. Create a GCP Project

### Step 2.1: Navigate to Google Cloud Console

1. Open your browser and go to: **https://console.cloud.google.com**
2. Sign in with your Google account

### Step 2.2: Create a New Project

1. Click the **project dropdown** at the top of the page (next to "Google Cloud")
2. In the modal that appears, click **"NEW PROJECT"** in the top right
3. Fill in the project details:
   - **Project name:** `research-workflow` (or your preferred name)
   - **Organization:** Select your organization or leave as "No organization"
   - **Location:** Select a folder or leave as "No organization"
4. Click **"CREATE"**
5. Wait for the project to be created (you'll see a notification)

### Step 2.3: Select Your Project

1. Click the **project dropdown** again
2. Select your newly created project: `research-workflow`
3. Verify the project name appears in the header

> **Note:** Save your Project ID - you'll need it later. Find it in:
> **Navigation menu (☰) → IAM & Admin → Settings**
>
> Your Project ID might look like: `research-workflow-123456`

---

## 3. Enable Billing

### Step 3.1: Navigate to Billing

1. Click the **Navigation menu (☰)** in the top left
2. Scroll down and click **"Billing"**

### Step 3.2: Link a Billing Account

1. If you see "This project has no billing account", click **"LINK A BILLING ACCOUNT"**
2. If you don't have a billing account:
   - Click **"CREATE BILLING ACCOUNT"**
   - Follow the prompts to add payment information
   - New accounts get $300 free credit for 90 days
3. Select your billing account and click **"SET ACCOUNT"**

### Step 3.3: Verify Billing is Enabled

1. You should see your billing account linked to the project
2. The Billing overview should show your project under "Projects linked to this billing account"

---

## 4. Enable Required APIs

You need to enable several APIs for the deployment to work.

### Step 4.1: Navigate to API Library

1. Click the **Navigation menu (☰)**
2. Go to **"APIs & Services"** → **"Library"**

### Step 4.2: Enable Each API

For each API below, search for it and enable it:

#### 4.2.1: Cloud Build API
1. Search for **"Cloud Build API"**
2. Click on **"Cloud Build API"** in the results
3. Click **"ENABLE"**
4. Wait for it to enable (may take a few seconds)

#### 4.2.2: Cloud Run Admin API
1. Click **"APIs & Services"** → **"Library"** again
2. Search for **"Cloud Run Admin API"**
3. Click on it and click **"ENABLE"**

#### 4.2.3: Container Registry API
1. Search for **"Container Registry API"**
2. Click on it and click **"ENABLE"**

#### 4.2.4: Secret Manager API
1. Search for **"Secret Manager API"**
2. Click on it and click **"ENABLE"**

#### 4.2.5: Vertex AI API
1. Search for **"Vertex AI API"**
2. Click on it and click **"ENABLE"**

### Step 4.3: Verify APIs are Enabled

1. Go to **Navigation menu (☰)** → **"APIs & Services"** → **"Enabled APIs & services"**
2. Verify you see these APIs listed:
   - Cloud Build API
   - Cloud Run Admin API
   - Container Registry API
   - Secret Manager API
   - Vertex AI API

> **Alternative: Enable via Cloud Shell**
>
> If you prefer using commands, open Cloud Shell (see Section 5) and run:
> ```bash
> gcloud services enable \
>   cloudbuild.googleapis.com \
>   run.googleapis.com \
>   containerregistry.googleapis.com \
>   secretmanager.googleapis.com \
>   aiplatform.googleapis.com
> ```

---

## 5. Set Up Cloud Shell

Cloud Shell provides a browser-based terminal with gcloud pre-installed.

### Step 5.1: Open Cloud Shell

1. Click the **Cloud Shell icon** (terminal icon `>_`) in the top right of the console
2. A terminal panel will open at the bottom of your browser
3. Wait for Cloud Shell to provision (first time takes ~30 seconds)

### Step 5.2: Verify Your Project

Run these commands to verify your setup:

```bash
# Check your current project
gcloud config get-value project

# If it's not your project, set it:
gcloud config set project YOUR_PROJECT_ID
```

### Step 5.3: Get Project Details

Run this command to get important project information you'll need later:

```bash
# Display project ID and number
echo "Project ID: $(gcloud config get-value project)"
echo "Project Number: $(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')"
```

**Write down these values - you'll need them in the next steps.**

---

## 6. Configure IAM Permissions

Cloud Build needs permission to deploy to Cloud Run and access Vertex AI.

### Step 6.1: Navigate to IAM

1. Click the **Navigation menu (☰)**
2. Go to **"IAM & Admin"** → **"IAM"**

### Step 6.2: Find the Cloud Build Service Account

1. Look for a service account with the email format:
   ```
   YOUR_PROJECT_NUMBER@cloudbuild.gserviceaccount.com
   ```
2. If you don't see it, you may need to run a Cloud Build first (it will be created automatically)

### Step 6.3: Add Cloud Run Admin Role

1. Find the Cloud Build service account row
2. Click the **pencil icon (Edit principal)** on the right
3. Click **"+ ADD ANOTHER ROLE"**
4. In the dropdown, search for and select **"Cloud Run Admin"**
5. Click **"SAVE"**

### Step 6.4: Add Service Account User Role

1. Find the Cloud Build service account again
2. Click the **pencil icon (Edit principal)**
3. Click **"+ ADD ANOTHER ROLE"**
4. Search for and select **"Service Account User"**
5. Click **"SAVE"**

### Step 6.5: Add Vertex AI User Role to Compute Service Account

The Cloud Run services need access to Vertex AI:

1. Find the Compute Engine default service account:
   ```
   YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com
   ```
2. Click the **pencil icon (Edit principal)**
3. Click **"+ ADD ANOTHER ROLE"**
4. Search for and select **"Vertex AI User"**
5. Click **"SAVE"**

> **Alternative: Configure via Cloud Shell**
>
> Run these commands in Cloud Shell:
> ```bash
> PROJECT_ID=$(gcloud config get-value project)
> PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
>
> # Grant Cloud Run Admin to Cloud Build
> gcloud projects add-iam-policy-binding $PROJECT_ID \
>   --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
>   --role="roles/run.admin"
>
> # Grant Service Account User to Cloud Build
> gcloud projects add-iam-policy-binding $PROJECT_ID \
>   --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
>   --role="roles/iam.serviceAccountUser"
>
> # Grant Vertex AI User to Compute service account
> gcloud projects add-iam-policy-binding $PROJECT_ID \
>   --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
>   --role="roles/aiplatform.user"
> ```

---

## 7. Store Secrets in Secret Manager

If you want to use the direct Anthropic API as a fallback (optional).

### Step 7.1: Navigate to Secret Manager

1. Click the **Navigation menu (☰)**
2. Go to **"Security"** → **"Secret Manager"**

### Step 7.2: Create a Secret (Optional - for Anthropic API fallback)

1. Click **"+ CREATE SECRET"**
2. Fill in:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Secret value:** Paste your Anthropic API key
3. Click **"CREATE SECRET"**

### Step 7.3: Grant Access to the Secret

1. Click on the secret name **"ANTHROPIC_API_KEY"**
2. Go to the **"PERMISSIONS"** tab
3. Click **"+ GRANT ACCESS"**
4. In **"New principals"**, enter:
   ```
   YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com
   ```
5. In **"Role"**, select **"Secret Manager Secret Accessor"**
6. Click **"SAVE"**

> **Note:** This step is optional. The application is designed to use Vertex AI with user-provided GCP credentials. The Anthropic API key is only used as a fallback for local development.

---

## 8. Connect Your Repository

### Step 8.1: Navigate to Cloud Build

1. Click the **Navigation menu (☰)**
2. Go to **"CI/CD"** → **"Cloud Build"**

### Step 8.2: Connect Repository

1. In the left sidebar, click **"Repositories"** (2nd generation)
2. Click **"CREATE HOST CONNECTION"**

### Step 8.3: Select Your Source Provider

Choose your repository host:

#### For GitHub:

1. Select **"GitHub"**
2. Click **"CONNECT"**
3. Click **"INSTALL IN A NEW ACCOUNT"** or select an existing installation
4. Authorize Google Cloud Build to access your GitHub account
5. Select the repositories you want to connect (select your research-workflow repo)
6. Click **"CONNECT"**

#### For GitLab:

1. Select **"GitLab"**
2. Follow the prompts to authorize and connect your GitLab account

#### For Bitbucket:

1. Select **"Bitbucket"**
2. Follow the prompts to authorize and connect your Bitbucket account

### Step 8.4: Link the Repository

1. After connecting, click **"LINK REPOSITORY"**
2. Select your host connection
3. Select your repository from the list
4. Click **"LINK"**

---

## 9. Create Cloud Build Trigger

### Step 9.1: Navigate to Triggers

1. In Cloud Build, click **"Triggers"** in the left sidebar
2. Click **"+ CREATE TRIGGER"**

### Step 9.2: Configure the Trigger

Fill in the trigger details:

1. **Name:** `deploy-research-workflow`
2. **Description:** `Deploy API and Dashboard to Cloud Run`
3. **Region:** Leave as "global" or select your preferred region
4. **Event:** Select **"Push to a branch"**

### Step 9.3: Configure Source

1. **Source:**
   - **Repository:** Select your linked repository
   - **Branch:** `^main$` (or your preferred branch, e.g., `^master$`)

### Step 9.4: Configure Build

1. **Configuration:**
   - **Type:** Select **"Cloud Build configuration file"**
   - **Location:** `/ cloudbuild.yaml`

### Step 9.5: Create the Trigger

1. Review your settings
2. Click **"CREATE"**

---

## 10. Run the Deployment

### Step 10.1: Manual Trigger (First Deployment)

1. In the **Triggers** list, find your `deploy-research-workflow` trigger
2. Click **"RUN"** on the right side
3. Select the branch (e.g., `main`)
4. Click **"RUN TRIGGER"**

### Step 10.2: Monitor the Build

1. Click on the build that just started (or go to **"History"** in the left sidebar)
2. You'll see the build progress through these steps:
   - `build-api` - Building the API Docker image
   - `build-dashboard` - Building the Dashboard Docker image
   - `push-api` - Pushing API image to Container Registry
   - `push-dashboard` - Pushing Dashboard image to Container Registry
   - `deploy-api` - Deploying API to Cloud Run
   - `deploy-dashboard` - Deploying Dashboard to Cloud Run
   - `update-api-cors` - Configuring CORS settings

### Step 10.3: Wait for Completion

The build typically takes 5-10 minutes. You'll see:
- ✓ Green checkmarks for successful steps
- ✗ Red X for failed steps

### Step 10.4: View Build Logs

Click on any step to view detailed logs. This is helpful for debugging if something fails.

---

## 11. Configure Cloud Run Services

### Step 11.1: Navigate to Cloud Run

1. Click the **Navigation menu (☰)**
2. Go to **"Serverless"** → **"Cloud Run"**

### Step 11.2: Verify Services are Deployed

You should see two services:
- `research-api`
- `research-dashboard`

### Step 11.3: Get Service URLs

1. Click on **"research-dashboard"**
2. At the top, you'll see the URL like:
   ```
   https://research-dashboard-XXXXXXXXXX-uc.a.run.app
   ```
3. **Save this URL** - this is your dashboard access point

4. Go back and click on **"research-api"**
5. Save the API URL as well

### Step 11.4: Configure API Service (Optional - Add Secrets)

If you created the ANTHROPIC_API_KEY secret:

1. Click on **"research-api"**
2. Click **"EDIT & DEPLOY NEW REVISION"**
3. Go to **"Container(s)"** tab
4. Scroll down to **"SECRETS"**
5. Click **"+ REFERENCE A SECRET"**
6. Select **"ANTHROPIC_API_KEY"**
7. For **"Reference method"**, select **"Exposed as environment variable"**
8. **Name:** `ANTHROPIC_API_KEY`
9. Click **"DONE"**
10. Click **"DEPLOY"**

---

## 12. Test Your Deployment

### Step 12.1: Test the API Health Check

1. Open a new browser tab
2. Go to your API URL + `/api/health`:
   ```
   https://research-api-XXXXXXXXXX-uc.a.run.app/api/health
   ```
3. You should see:
   ```json
   {"status":"healthy","timestamp":"..."}
   ```

### Step 12.2: Access the Dashboard

1. Open a new browser tab
2. Go to your Dashboard URL:
   ```
   https://research-dashboard-XXXXXXXXXX-uc.a.run.app
   ```
3. You should see the Research Workflow dashboard

### Step 12.3: Test with GCP Authentication

The application requires GCP authentication. In Cloud Shell:

```bash
# Get your access token
ACCESS_TOKEN=$(gcloud auth print-access-token)
PROJECT_ID=$(gcloud config get-value project)

# Test authenticated API call
curl -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H "X-GCP-Project-ID: $PROJECT_ID" \
     https://research-api-XXXXXXXXXX-uc.a.run.app/api/projects
```

You should see an empty array `[]` or a list of projects.

### Step 12.4: Create a Test Research Project

Using Cloud Shell:

```bash
ACCESS_TOKEN=$(gcloud auth print-access-token)
PROJECT_ID=$(gcloud config get-value project)
API_URL="https://research-api-XXXXXXXXXX-uc.a.run.app"

# Create a quick research project
curl -X POST "$API_URL/api/projects/quick" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-GCP-Project-ID: $PROJECT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Anthropic",
    "questions": ["What products does the company offer?", "Who are the founders?"]
  }'
```

---

## 13. Set Up Monitoring

### Step 13.1: View Cloud Run Metrics

1. Go to **Cloud Run** → click on **"research-api"**
2. Click the **"METRICS"** tab
3. You can see:
   - Request count
   - Request latencies
   - Container instance count
   - Memory utilization
   - CPU utilization

### Step 13.2: View Logs

1. In Cloud Run, click the **"LOGS"** tab
2. You'll see real-time logs from your service
3. Use filters to search for specific log entries

### Step 13.3: Set Up Alerts (Optional)

1. Go to **Navigation menu (☰)** → **"Monitoring"** → **"Alerting"**
2. Click **"+ CREATE POLICY"**
3. Configure alerts for:
   - High error rate
   - High latency
   - High resource usage

### Step 13.4: Enable Cloud Trace (Optional)

For detailed request tracing:

1. Go to **Navigation menu (☰)** → **"Trace"**
2. View distributed traces across your services

---

## 14. Optional: Set Up Cloud SQL

For persistent data storage (replaces ephemeral SQLite):

### Step 14.1: Navigate to Cloud SQL

1. Click **Navigation menu (☰)** → **"Databases"** → **"SQL"**
2. Click **"CREATE INSTANCE"**

### Step 14.2: Create PostgreSQL Instance

1. Select **"Choose PostgreSQL"**
2. Fill in:
   - **Instance ID:** `research-db`
   - **Password:** Set a strong password (save it!)
   - **Region:** `us-central1` (same as Cloud Run)
   - **Database version:** PostgreSQL 15
3. Click **"Create Instance"** (takes several minutes)

### Step 14.3: Create a Database

1. Once created, click on the instance
2. Go to **"Databases"** tab
3. Click **"CREATE DATABASE"**
4. Name: `research`
5. Click **"CREATE"**

### Step 14.4: Configure Cloud Run to Connect

1. Go to **Cloud Run** → **"research-api"**
2. Click **"EDIT & DEPLOY NEW REVISION"**
3. Go to **"Container(s)"** tab
4. Scroll to **"Cloud SQL connections"**
5. Click **"ADD CONNECTION"**
6. Select your instance: `research-db`
7. Add environment variable:
   - **Name:** `DATABASE_URL`
   - **Value:** `postgres://postgres:YOUR_PASSWORD@localhost/research?host=/cloudsql/PROJECT_ID:us-central1:research-db`
8. Click **"DEPLOY"**

---

## 15. Troubleshooting

### Build Failures

#### Check Build Logs
1. Go to **Cloud Build** → **"History"**
2. Click on the failed build
3. Click on the failed step to see detailed logs

#### Common Issues:

**"Permission denied" errors:**
- Ensure IAM permissions are set correctly (Section 6)
- Check that all required APIs are enabled (Section 4)

**"Container failed to start":**
- Check Cloud Run logs for startup errors
- Verify environment variables are set correctly

**"Dockerfile not found":**
- Ensure `cloudbuild.yaml` is in the repository root
- Check the repository is properly linked

### Service Not Responding

1. Check if the service is deployed:
   ```bash
   gcloud run services list --region us-central1
   ```

2. Check service logs:
   ```bash
   gcloud run services logs read research-api --region us-central1 --limit 50
   ```

3. Check if minimum instances are 0 (cold start may take time):
   - First request after idle period may take 10-30 seconds

### CORS Issues

If the dashboard can't connect to the API:

1. Check the `DASHBOARD_URL` environment variable on the API service
2. Go to **Cloud Run** → **"research-api"** → **"Variables & Secrets"**
3. Verify `DASHBOARD_URL` matches your dashboard service URL

### Authentication Errors

1. Ensure your access token is fresh:
   ```bash
   gcloud auth print-access-token
   ```

2. Verify the `X-GCP-Project-ID` header matches your project

3. Check that Vertex AI API is enabled

---

## 16. Cost Management

### Understand the Costs

| Service | Free Tier | Cost After Free Tier |
|---------|-----------|---------------------|
| Cloud Run | 2M requests/month, 400K GB-seconds | ~$0.40/million requests |
| Cloud Build | 120 build-minutes/day | ~$0.003/build-minute |
| Container Registry | 500 MB storage | ~$0.10/GB/month |
| Vertex AI (Claude) | Pay per token | Varies by model |
| Cloud SQL (optional) | None | ~$7/month minimum |

### Set Budget Alerts

1. Go to **Navigation menu (☰)** → **"Billing"**
2. Click **"Budgets & alerts"**
3. Click **"+ CREATE BUDGET"**
4. Set:
   - **Budget name:** `Research Workflow Budget`
   - **Amount:** Your monthly limit (e.g., $10)
   - **Alert thresholds:** 50%, 90%, 100%
5. Click **"FINISH"**

### Optimize Costs

1. **Use min-instances = 0** (already configured) to scale to zero when idle
2. **Delete unused container images** in Container Registry
3. **Use f1-micro Cloud SQL** if you need database persistence

---

## 17. Cleanup

To delete all resources and stop incurring charges:

### Delete Cloud Run Services

1. Go to **Cloud Run**
2. Select **"research-api"**
3. Click **"DELETE"**
4. Repeat for **"research-dashboard"**

### Delete Container Images

1. Go to **Container Registry** → **"Images"**
2. Select and delete all images

### Delete Cloud SQL (if created)

1. Go to **Cloud SQL**
2. Click on the instance
3. Click **"DELETE"**

### Delete Secrets

1. Go to **Secret Manager**
2. Delete any secrets you created

### Delete the Project (Nuclear Option)

To delete everything at once:

1. Go to **IAM & Admin** → **"Settings"**
2. Click **"SHUT DOWN"**
3. Enter the project ID and click **"SHUT DOWN"**

---

## Quick Reference Commands

Run these in Cloud Shell for common tasks:

```bash
# View deployed services
gcloud run services list --region us-central1

# Get service URLs
gcloud run services describe research-api --region us-central1 --format='value(status.url)'
gcloud run services describe research-dashboard --region us-central1 --format='value(status.url)'

# View recent logs
gcloud run services logs read research-api --region us-central1 --limit 20

# Trigger a new deployment
gcloud builds submit --config=cloudbuild.yaml

# View build history
gcloud builds list --limit 5

# Get access token for API calls
gcloud auth print-access-token

# Update service memory
gcloud run services update research-api --region us-central1 --memory 2Gi

# Update service max instances
gcloud run services update research-api --region us-central1 --max-instances 20
```

---

## Summary

You have successfully deployed the Commercial Research Workflow to GCP:

| Component | URL |
|-----------|-----|
| Dashboard | `https://research-dashboard-XXX.run.app` |
| API | `https://research-api-XXX.run.app` |
| Health Check | `https://research-api-XXX.run.app/api/health` |

**Next Steps:**
1. Access the dashboard and create your first research project
2. Set up budget alerts to control costs
3. Configure monitoring and alerting for production use
4. Consider Cloud SQL if you need persistent data storage

**Support:**
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
