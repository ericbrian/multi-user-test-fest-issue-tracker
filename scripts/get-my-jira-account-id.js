#!/usr/bin/env node
/**
 * Helper script to get your Jira account ID
 */

require('dotenv').config();
const { JiraService } = require('../src/services/jiraService');

const config = {
  JIRA_BASE_URL: process.env.JIRA_BASE_URL,
  JIRA_EMAIL: process.env.JIRA_EMAIL,
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,
};

const jiraService = new JiraService(config);

async function getMyAccountId() {
  if (!jiraService.isConfigured()) {
    console.error('❌ Jira is not configured. Please set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, and JIRA_PROJECT_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔍 Looking up Jira account ID for:', config.JIRA_EMAIL);
  console.log('📍 Jira instance:', config.JIRA_BASE_URL);
  console.log('');

  try {
    const accountId = await jiraService.getAccountIdByEmail(config.JIRA_EMAIL);

    if (accountId) {
      console.log('✅ Your Jira Account ID:', accountId);
      console.log('');
      console.log('You can also view your profile at:');
      console.log(`${config.JIRA_BASE_URL.replace(/\/$/, '')}/jira/people/${accountId}`);
    } else {
      console.log('❌ Could not find Jira user with email:', config.JIRA_EMAIL);
      console.log('');
      console.log('This could mean:');
      console.log('  - The email doesn\'t match a Jira user');
      console.log('  - Your API token doesn\'t have "Browse users" permission');
      console.log('  - The user account is inactive');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

getMyAccountId();
