/**
 * Configuration validation and management
 * Validates all required environment variables at startup
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Validate and return configuration object
 * Exits process if required variables are missing or invalid
 * Allows dependency injection for env and exit function for testing
 */
function validateConfig(env = process.env, exitFn = process.exit) {
  const errors = [];
  const warnings = [];

  // Required configuration
  const DATABASE_URL = env.DATABASE_URL;
  if (!DATABASE_URL) {
    errors.push('DATABASE_URL is required');
  }

  // Session secret validation
  const SESSION_SECRET = env.SESSION_SECRET;
  if (!SESSION_SECRET) {
    errors.push('SESSION_SECRET is required');
  } else if (SESSION_SECRET === 'change_me_session_secret') {
    errors.push('SESSION_SECRET must not use the default value "change_me_session_secret"');
  } else if (SESSION_SECRET.length < 32) {
    warnings.push('SESSION_SECRET should be at least 32 characters long for security');
  }

  // Schema validation
  const SCHEMA = ((env.DB_SCHEMA || 'testfest').replace(/[^a-zA-Z0-9_]/g, '')) || 'testfest';
  const ALLOWED_SCHEMAS = ['testfest'];
  if (!ALLOWED_SCHEMAS.includes(SCHEMA)) {
    errors.push(`DB_SCHEMA must be one of: ${ALLOWED_SCHEMAS.join(', ')} (got: ${SCHEMA})`);
  }

  // Port validation
  const PORT = parseInt(env.PORT || '3000', 10);
  if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    errors.push('PORT must be a valid port number (1-65535)');
  }

  // SSO Configuration validation - SSO is required except in test mode
  const ENTRA_ISSUER = env.ENTRA_ISSUER;
  const ENTRA_CLIENT_ID = env.ENTRA_CLIENT_ID;
  const ENTRA_CLIENT_SECRET = env.ENTRA_CLIENT_SECRET;

  // Use env.NODE_ENV, defaulting to process.env.NODE_ENV if not in injected env (though ideally it should be)
  const isTestMode = env.NODE_ENV === 'test';

  if (!isTestMode) {
    if (!ENTRA_ISSUER || !ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET) {
      errors.push('Entra ID SSO configuration is required. Please configure ENTRA_ISSUER, ENTRA_CLIENT_ID, and ENTRA_CLIENT_SECRET');
    }
  } else {
    console.warn('⚠️  TEST MODE: SSO validation bypassed (NODE_ENV=test)');
  }

  // Jira configuration validation (optional but warn if partially configured)
  const JIRA_BASE_URL = env.JIRA_BASE_URL;
  const JIRA_EMAIL = env.JIRA_EMAIL;
  const JIRA_API_TOKEN = env.JIRA_API_TOKEN;
  const JIRA_PROJECT_KEY = env.JIRA_PROJECT_KEY;

  const jiraConfigured = [JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY].filter(Boolean).length;
  if (jiraConfigured > 0 && jiraConfigured < 4) {
    warnings.push('Jira integration is partially configured. Set all of: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY');
  }

  // Tags validation
  const TAGS = (env.TAGS || 'duplicate,as-designed,low-priority').split(',').map((s) => s.trim()).filter(Boolean);
  if (TAGS.length === 0) {
    warnings.push('No TAGS configured, using defaults');
  }

  // Print warnings
  if (warnings.length > 0) {
    console.warn('\n⚠️  Configuration Warnings:');
    warnings.forEach(warning => console.warn(`  - ${warning}`));
    console.warn('');
  }

  // Print errors and exit if any
  if (errors.length > 0) {
    console.error('\n❌ Configuration Errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease fix these configuration errors and try again.\n');
    exitFn(1);
    // If exitFn is mocked and doesn't exit, we return partial/invalid config, but caller should handle exit
  } else {
    console.log('✅ Configuration validated successfully\n');
  }

  // Return validated configuration
  return {
    PORT,
    SESSION_SECRET,
    DATABASE_URL,
    SCHEMA,
    ENTRA_ISSUER: env.ENTRA_ISSUER,
    ENTRA_CLIENT_ID: env.ENTRA_CLIENT_ID,
    ENTRA_CLIENT_SECRET: env.ENTRA_CLIENT_SECRET,
    ENTRA_REDIRECT_URI: env.ENTRA_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`,
    GROUPIER_EMAILS: (env.GROUPIER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    TAGS,
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
    JIRA_ISSUE_TYPE: env.JIRA_ISSUE_TYPE || 'Bug',
  };
}

module.exports = { validateConfig };
