# Heroku to AWS Migration Strategic Plan

This document outlines the high-level roadmap for migrating the Test Fest Issue Tracker from Heroku to AWS. The goal is a zero-downtime (or minimal maintenance window) transition with verified security and data integrity.

## Phase 1: Application Readiness (The "Cloud-Native" Refactor)

Before we touch AWS, the application must be decoupled from the local environment and Heroku-specific patterns.

- [ ] **Decouple Storage**: Replace local filesystem uploads with an S3-compatible service layer.
- [ ] **Statelessness**: Ensure the app can run across multiple pods (Redis adapter for Socket.IO).
- [ ] **Config Hardening**: Update environment variable validation to support AWS ARNs and internal networking.
- [ ] **Containerization**: Finalize the `Dockerfile` and verify it runs locally with production-like settings.

## Phase 2: AWS Landing Zone Infrastructure

Provisioning the environment where the app will live.

- [ ] **Compute (EKS/ECS)**: Spin up the Kubernetes cluster or ECS service.
- [ ] **Database (RDS)**: Provision a Postgres instance (Multi-AZ for production reliability).
- [ ] **Networking**: Setup VPC, Subnets, and an Internal ALB (Application Load Balancer) to keep the app behind the firewall.
- [ ] **IAM**: Configure IRSA (IAM Roles for Service Accounts) so the app can talk to S3/RDS without static keys.

## Phase 3: Pilot Deployment (Non-Production)

Verifying the migration steps in a safe, isolated environment.

- [ ] **CI/CD Pipeline**: Update GitHub Actions or Bitbucket Pipelines to push images to AWS ECR.
- [ ] **Test Deployment**: Deploy the container to a "Staging" namespace in AWS.
- [ ] **Verification**: Confirm Entra SSO flows work with the new redirect URIs.

## Phase 4: Data Migration Strategy

Moving the "Memory" of the app from Heroku to AWS.

- [ ] **Storage Migration**: Sync existing `./uploads` from Heroku/local to the new S3 bucket.
- [ ] **Database Migration**:
  - **Option A (Downtime)**: `pg_dump` from Heroku and `pg_restore` to RDS.
  - **Option B (Zero-Downtime)**: AWS Database Migration Service (DMS) for continuous replication.

## Phase 5: Production Cutover

The final switch.

- [ ] **Pre-Flight**: Lower TTL on DNS records.
- [ ] **Maintenance Window**: Set the Heroku app to "Maintenance Mode."
- [ ] **Final Sync**: Perform a final DB sync and S3 sync.
- [ ] **DNS Switch**: Point the target domain to the AWS ALB.
- [ ] **Validation**: Run the smoke test suite (Login, Room Join, Issue Create).

## Phase 6: Heroku Decommissioning

- [ ] **Monitoring**: Monitor AWS logs for 48 hours for any anomalies.
- [ ] **Cleanup**: Delete Heroku apps and remove Heroku-specific environment variables.
- [ ] **Cost Audit**: Confirm AWS resources are sized correctly.

---

### Migration Checklist Summary

| Task                             |   Status    | Owner    |
| :------------------------------- | :---------: | :------- |
| Cloud-Native Code Refactor       | In Progress | App Team |
| AWS Infrastructure (Terraform)   |   Drafted   | DevOps   |
| Migration Verification (Staging) |   Pending   | QA       |
| Data Sync (Heroku -> RDS)        |   Pending   | DBA      |
| Production Cutover               |   Pending   | Lead     |
