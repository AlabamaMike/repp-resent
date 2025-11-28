import { Request, Response, NextFunction } from 'express';
import { OAuth2Client, GoogleAuth } from 'google-auth-library';

/**
 * GCP Authentication context attached to requests
 */
export interface GCPAuthContext {
  projectId: string;
  accessToken: string;
  email?: string;
  tokenExpiry?: Date;
}

/**
 * Extended Express Request with GCP auth context
 */
export interface AuthenticatedRequest extends Request {
  gcpAuth: GCPAuthContext;
}

/**
 * Configuration for GCP authentication
 */
export interface GCPAuthConfig {
  /** Required GCP project ID for Vertex AI */
  projectId?: string;
  /** GCP region for Vertex AI (default: us-central1) */
  region?: string;
  /** Whether to allow unauthenticated access (for health checks) */
  allowUnauthenticatedPaths?: string[];
}

const oauth2Client = new OAuth2Client();

/**
 * Validate a GCP access token and extract user information
 */
async function validateAccessToken(accessToken: string): Promise<{
  email?: string;
  expiry?: Date;
  valid: boolean;
}> {
  try {
    const tokenInfo = await oauth2Client.getTokenInfo(accessToken);
    return {
      email: tokenInfo.email,
      expiry: tokenInfo.expiry_date ? new Date(tokenInfo.expiry_date) : undefined,
      valid: true,
    };
  } catch (error) {
    console.error('Token validation failed:', error);
    return { valid: false };
  }
}

/**
 * Extract access token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Create GCP authentication middleware
 *
 * Users must provide their GCP credentials via Bearer token in Authorization header.
 * These credentials are used as Application Default Credentials for Vertex AI calls.
 */
export function createGCPAuthMiddleware(config: GCPAuthConfig = {}) {
  const allowedPaths = config.allowUnauthenticatedPaths || ['/api/health'];
  const defaultProjectId = config.projectId || process.env.GCP_PROJECT_ID;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip authentication for allowed paths
    if (allowedPaths.some(path => req.path === path || req.path.startsWith(path + '/'))) {
      return next();
    }

    // Extract access token from header
    const accessToken = extractBearerToken(req.headers.authorization);

    if (!accessToken) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing GCP access token. Provide Bearer token in Authorization header.',
        hint: 'Run: gcloud auth print-access-token',
      });
      return;
    }

    // Validate the token
    const tokenInfo = await validateAccessToken(accessToken);

    if (!tokenInfo.valid) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired GCP access token.',
        hint: 'Run: gcloud auth print-access-token',
      });
      return;
    }

    // Get project ID from header or config
    const projectId = req.headers['x-gcp-project-id'] as string || defaultProjectId;

    if (!projectId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'GCP Project ID is required. Set X-GCP-Project-ID header or GCP_PROJECT_ID environment variable.',
      });
      return;
    }

    // Attach auth context to request
    (req as AuthenticatedRequest).gcpAuth = {
      projectId,
      accessToken,
      email: tokenInfo.email,
      tokenExpiry: tokenInfo.expiry,
    };

    next();
  };
}

/**
 * Get Application Default Credentials for use in agents
 *
 * This function creates a GoogleAuth instance that uses the provided
 * access token as the credential source for Vertex AI API calls.
 */
export function createAuthFromToken(accessToken: string, projectId: string): GoogleAuth {
  return new GoogleAuth({
    credentials: {
      type: 'authorized_user',
      client_id: 'vertexai-client',
      client_secret: '',
      refresh_token: accessToken,
    },
    projectId,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
}

/**
 * Helper to get GCP auth context from request
 */
export function getGCPAuth(req: Request): GCPAuthContext | undefined {
  return (req as AuthenticatedRequest).gcpAuth;
}

/**
 * Configuration required for Vertex AI client initialization
 */
export interface VertexAIConfig {
  projectId: string;
  region: string;
  accessToken: string;
}

/**
 * Get Vertex AI configuration from auth context and environment
 */
export function getVertexAIConfig(authContext: GCPAuthContext): VertexAIConfig {
  return {
    projectId: authContext.projectId,
    region: process.env.GCP_REGION || 'us-central1',
    accessToken: authContext.accessToken,
  };
}
