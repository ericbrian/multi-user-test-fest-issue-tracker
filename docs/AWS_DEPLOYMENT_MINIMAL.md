# Minimal AWS Deployment Guide

This guide provides the **smallest possible AWS footprint** for deploying the Test Fest Tracker application, with options from cheapest to most production-ready.

---

## Option 1: AWS Lightsail (Smallest Budget: ~$15-20/month)

**Best for:** Development, small teams, proof-of-concept

### Architecture
- **Compute**: Lightsail Container Service (512 MB RAM, 0.25 vCPU) - $7/month
- **Database**: Lightsail PostgreSQL (1 GB RAM, 1 vCPU) - $15/month
- **Storage**: 20 GB SSD included
- **Total**: ~$22/month

### Setup Steps

#### 1. Create Lightsail Database

```bash
aws lightsail create-relational-database \
  --relational-database-name testfest-db \
  --relational-database-blueprint-id postgres_15 \
  --relational-database-bundle-id micro_2_0 \
  --master-database-name testfest \
  --master-username dbadmin \
  --master-user-password "YourSecurePassword123!" \
  --publicly-accessible
```

Get connection details:
```bash
aws lightsail get-relational-database --relational-database-name testfest-db
```

#### 2. Push Docker Image to ECR

```bash
# Already configured in your bitbucket-pipelines.yml
# Or manually:
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
export REPOSITORY=testfest-repo

# Create ECR repository
aws ecr create-repository --repository-name ${REPOSITORY} --region ${AWS_REGION}

# Build and push
docker build -t ${REPOSITORY}:latest .
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
docker tag ${REPOSITORY}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY}:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY}:latest
```

#### 3. Create Lightsail Container Service

```bash
aws lightsail create-container-service \
  --service-name testfest-app \
  --power micro \
  --scale 1
```

#### 4. Deploy Container

Create `lightsail-deployment.json`:

```json
{
  "containers": {
    "testfest": {
      "image": "<AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/testfest-repo:latest",
      "ports": {
        "3000": "HTTP"
      },
      "environment": {
        "NODE_ENV": "production",
        "PORT": "3000",
        "DATABASE_URL": "postgresql://dbadmin:YourPassword@<lightsail-db-endpoint>:5432/testfest",
        "SESSION_SECRET": "<generated-secret>",
        "ENTRA_ISSUER": "https://login.microsoftonline.com/<tenant-id>/v2.0",
        "ENTRA_CLIENT_ID": "<your-client-id>",
        "ENTRA_CLIENT_SECRET": "<your-secret>",
        "ENTRA_REDIRECT_URI": "https://<your-lightsail-domain>/auth/callback"
      }
    }
  },
  "publicEndpoint": {
    "containerName": "testfest",
    "containerPort": 3000,
    "healthCheck": {
      "path": "/health",
      "intervalSeconds": 30
    }
  }
}
```

Deploy:
```bash
aws lightsail create-container-service-deployment \
  --service-name testfest-app \
  --cli-input-json file://lightsail-deployment.json
```

**Limitations:**
- No WebSocket support (Socket.IO won't work in real-time mode)
- File uploads stored in container (lost on restart)
- Single instance only

---

## Option 2: ECS Fargate Spot + RDS (Cost-Optimized: ~$30-40/month)

**Best for:** Small production apps, cost-sensitive deployments

### Architecture
- **Compute**: ECS Fargate Spot (0.5 vCPU, 1 GB RAM) - ~$10-15/month
- **Database**: RDS PostgreSQL t4g.micro (1 vCPU, 1 GB RAM) - ~$15/month
- **Load Balancer**: Application Load Balancer - ~$16/month
- **Storage**: S3 for uploads - ~$1/month
- **Total**: ~$42-47/month

### Setup Files

I'll create the necessary configuration files for this deployment.

#### 1. Create VPC and Networking (One-time setup)

```bash
# Get default VPC
export VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)

# Get subnets (use at least 2 in different AZs)
aws ec2 describe-subnets --filters "Name=vpc-id,Values=${VPC_ID}" --query "Subnets[*].SubnetId" --output text
```

#### 2. Create Security Groups

```bash
# Security group for ALB (allows HTTP/HTTPS)
export ALB_SG=$(aws ec2 create-security-group \
  --group-name testfest-alb-sg \
  --description "ALB for Test Fest Tracker" \
  --vpc-id ${VPC_ID} \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id ${ALB_SG} \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

aws ec2 authorize-security-group-ingress \
  --group-id ${ALB_SG} \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# Security group for ECS tasks
export ECS_SG=$(aws ec2 create-security-group \
  --group-name testfest-ecs-sg \
  --description "ECS tasks for Test Fest Tracker" \
  --vpc-id ${VPC_ID} \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id ${ECS_SG} \
  --protocol tcp --port 3000 \
  --source-group ${ALB_SG}

# Security group for RDS
export RDS_SG=$(aws ec2 create-security-group \
  --group-name testfest-rds-sg \
  --description "RDS for Test Fest Tracker" \
  --vpc-id ${VPC_ID} \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id ${RDS_SG} \
  --protocol tcp --port 5432 \
  --source-group ${ECS_SG}
```

#### 3. Create S3 Bucket for Uploads

```bash
export BUCKET_NAME=testfest-uploads-$(date +%s)

aws s3 mb s3://${BUCKET_NAME}

# Set lifecycle policy to reduce costs
cat > lifecycle.json << 'EOF'
{
  "Rules": [
    {
      "Id": "DeleteOldUploads",
      "Status": "Enabled",
      "ExpirationInDays": 90,
      "NoncurrentVersionExpirationInDays": 30
    }
  ]
}
EOF

aws s3api put-bucket-lifecycle-configuration \
  --bucket ${BUCKET_NAME} \
  --lifecycle-configuration file://lifecycle.json
```

#### 4. Create RDS Database (Smallest Instance)

```bash
# Get subnet IDs for DB subnet group
export SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query "Subnets[0:2].SubnetId" --output text)

# Create DB subnet group
aws rds create-db-subnet-group \
  --db-subnet-group-name testfest-db-subnet \
  --db-subnet-group-description "Subnet group for Test Fest DB" \
  --subnet-ids ${SUBNET_IDS}

# Create RDS instance (t4g.micro - cheapest ARM-based)
aws rds create-db-instance \
  --db-instance-identifier testfest-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 15.4 \
  --master-username dbadmin \
  --master-user-password "$(openssl rand -base64 32)" \
  --allocated-storage 20 \
  --vpc-security-group-ids ${RDS_SG} \
  --db-subnet-group-name testfest-db-subnet \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-publicly-accessible

# Wait for creation (takes 5-10 minutes)
aws rds wait db-instance-available --db-instance-identifier testfest-db

# Get endpoint
export DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier testfest-db \
  --query "DBInstances[0].Endpoint.Address" --output text)

echo "Database endpoint: ${DB_ENDPOINT}"
```

#### 5. Create Application Load Balancer

```bash
# Get subnet IDs (need at least 2 in different AZs)
export SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query "Subnets[0:2].SubnetId" --output text | tr '\t' ' ')

# Create ALB
export ALB_ARN=$(aws elbv2 create-load-balancer \
  --name testfest-alb \
  --subnets ${SUBNET_IDS} \
  --security-groups ${ALB_SG} \
  --scheme internet-facing \
  --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

# Create target group (for ECS services)
export TG_ARN=$(aws elbv2 create-target-group \
  --name testfest-tg \
  --protocol HTTP \
  --port 3000 \
  --vpc-id ${VPC_ID} \
  --target-type ip \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# Create listener
aws elbv2 create-listener \
  --load-balancer-arn ${ALB_ARN} \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=forward,TargetGroupArn=${TG_ARN}

# Get ALB DNS name
aws elbv2 describe-load-balancers \
  --load-balancer-arns ${ALB_ARN} \
  --query 'LoadBalancers[0].DNSName' --output text
```

#### 6. Create ECS Cluster and Task Definition

```bash
# Create ECS cluster
aws ecs create-cluster --cluster-name testfest-cluster

# Create IAM role for ECS task execution
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name ecsTaskExecutionRole \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name ecsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Create task role for S3 access
cat > task-role-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::${BUCKET_NAME}/*"
    }
  ]
}
EOF

aws iam create-role \
  --role-name testfestTaskRole \
  --assume-role-policy-document file://trust-policy.json

aws iam put-role-policy \
  --role-name testfestTaskRole \
  --policy-name S3Upload \
  --policy-document file://task-role-policy.json

# Store secrets in SSM Parameter Store (cheaper than Secrets Manager)
export DB_PASSWORD=$(aws rds describe-db-instances \
  --db-instance-identifier testfest-db \
  --query 'DBInstances[0].MasterUsername' --output text)

aws ssm put-parameter \
  --name /testfest/db-password \
  --value "${DB_PASSWORD}" \
  --type SecureString

aws ssm put-parameter \
  --name /testfest/session-secret \
  --value "$(openssl rand -base64 32)" \
  --type SecureString

aws ssm put-parameter \
  --name /testfest/entra-client-secret \
  --value "YOUR_ENTRA_SECRET" \
  --type SecureString
```

#### 7. Register Task Definition

Create `task-definition.json`:

```json
{
  "family": "testfest-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::<ACCOUNT_ID>:role/testfestTaskRole",
  "containerDefinitions": [
    {
      "name": "testfest",
      "image": "<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/testfest-repo:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "essential": true,
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "PORT",
          "value": "3000"
        },
        {
          "name": "DATABASE_URL",
          "value": "postgresql://dbadmin:PASSWORD@<DB_ENDPOINT>:5432/postgres"
        },
        {
          "name": "ENTRA_ISSUER",
          "value": "https://login.microsoftonline.com/<TENANT_ID>/v2.0"
        },
        {
          "name": "ENTRA_CLIENT_ID",
          "value": "YOUR_CLIENT_ID"
        },
        {
          "name": "ENTRA_REDIRECT_URI",
          "value": "https://<ALB_DNS>/auth/callback"
        }
      ],
      "secrets": [
        {
          "name": "SESSION_SECRET",
          "valueFrom": "/testfest/session-secret"
        },
        {
          "name": "ENTRA_CLIENT_SECRET",
          "valueFrom": "/testfest/entra-client-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/testfest",
          "awslogs-region": "<REGION>",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

Register it:
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

#### 8. Create ECS Service with Fargate Spot

```bash
# Get subnet IDs
export SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query "Subnets[*].SubnetId" --output text | tr '\t' ',')

# Create service
aws ecs create-service \
  --cluster testfest-cluster \
  --service-name testfest-service \
  --task-definition testfest-task \
  --desired-count 1 \
  --launch-type FARGATE \
  --platform-version LATEST \
  --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_IDS}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=${TG_ARN},containerName=testfest,containerPort=3000" \
  --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1,base=0
```

---

## Option 3: AppRunner (Simplest: ~$25-35/month)

**Best for:** Minimal ops overhead, automatic scaling

AWS App Runner is the simplest option but doesn't support WebSocket (Socket.IO limitation).

```bash
# Create App Runner service
aws apprunner create-service \
  --service-name testfest \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/testfest-repo:latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "DATABASE_URL": "postgresql://...",
          "SESSION_SECRET": "...",
          "ENTRA_ISSUER": "...",
          "ENTRA_CLIENT_ID": "...",
          "ENTRA_CLIENT_SECRET": "..."
        }
      }
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  }'
```

⚠️ **Note**: App Runner doesn't support WebSocket connections, so real-time updates won't work.

---

## Cost Comparison

| Option | Monthly Cost | WebSocket Support | Complexity | Best For |
|--------|--------------|-------------------|------------|----------|
| Lightsail | $15-22 | ❌ No | Low | Dev/Testing |
| ECS Fargate Spot | $30-47 | ✅ Yes | Medium | Production |
| App Runner | $25-35 | ❌ No | Very Low | Simple apps |

---

## File Upload Optimization

To keep costs minimal, modify the app to use S3 for uploads instead of local storage:

### Option A: Add S3 SDK (Recommended)

Install AWS SDK:
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

See the separate guide in `AWS_S3_UPLOADS.md` for implementation details.

### Option B: Use EFS (More expensive)

Mount EFS volume to ECS tasks (~$10/month extra for 20 GB).

---

## Recommended Minimal Setup

For **smallest footprint with WebSocket support**:

1. **ECS Fargate Spot** (0.5 vCPU, 1 GB) - $10-15/month
2. **RDS t4g.micro** - $15/month  
3. **ALB** - $16/month
4. **S3** - $1/month
5. **CloudWatch Logs** - $2/month

**Total: ~$44/month** with full WebSocket and file upload support.

---

## Deployment Automation Script

I'll create a deployment script that sets everything up automatically.

See `deploy-to-aws.sh` for the complete automated deployment.

---

## Monitoring & Maintenance

### CloudWatch Alarms (Free tier eligible)

```bash
# CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name testfest-high-cpu \
  --alarm-description "Alert when CPU exceeds 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2

# Memory alarm
aws cloudwatch put-metric-alarm \
  --alarm-name testfest-high-memory \
  --alarm-description "Alert when memory exceeds 80%" \
  --metric-name MemoryUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

---

## Next Steps

1. Choose your deployment option
2. Run the appropriate setup commands
3. Update Entra ID redirect URI to your ALB DNS or custom domain
4. Set up Route 53 for custom domain (optional, $0.50/month per zone)
5. Add SSL certificate via ACM (free)

For complete automation, use the deployment script I'll create next.
