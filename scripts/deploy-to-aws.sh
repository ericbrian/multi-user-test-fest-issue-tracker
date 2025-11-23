#!/bin/bash
set -e

# AWS Minimal Deployment Script for Test Fest Tracker
# This script deploys the application using ECS Fargate Spot with minimal cost

echo "🚀 Test Fest Tracker - AWS Minimal Deployment"
echo "=============================================="
echo ""

# Configuration
export AWS_REGION="${AWS_REGION:-us-east-1}"
export CLUSTER_NAME="${CLUSTER_NAME:-testfest-cluster}"
export SERVICE_NAME="${SERVICE_NAME:-testfest-service}"
export REPOSITORY_NAME="${REPOSITORY_NAME:-testfest-repo}"
export DB_INSTANCE_ID="${DB_INSTANCE_ID:-testfest-db}"
export ALB_NAME="${ALB_NAME:-testfest-alb}"
export BUCKET_NAME="${BUCKET_NAME:-testfest-uploads-$(date +%s)}"

# Get AWS Account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "📋 Configuration:"
echo "  Region: ${AWS_REGION}"
echo "  Account ID: ${AWS_ACCOUNT_ID}"
echo "  Cluster: ${CLUSTER_NAME}"
echo ""

# Step 1: Get VPC and Network Info
echo "🔍 Step 1: Getting VPC and network information..."
export VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text --region ${AWS_REGION})
if [ -z "$VPC_ID" ]; then
  echo "❌ No default VPC found. Please create a VPC first."
  exit 1
fi

export SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=${VPC_ID}" \
  --query "Subnets[0:2].SubnetId" \
  --output text \
  --region ${AWS_REGION})

echo "  VPC ID: ${VPC_ID}"
echo "  Subnets: ${SUBNET_IDS}"
echo ""

# Step 2: Create Security Groups
echo "🔒 Step 2: Creating security groups..."

# ALB Security Group
if ! aws ec2 describe-security-groups --filters "Name=group-name,Values=testfest-alb-sg" --region ${AWS_REGION} --query "SecurityGroups[0].GroupId" --output text 2>/dev/null | grep -q 'sg-'; then
  export ALB_SG=$(aws ec2 create-security-group \
    --group-name testfest-alb-sg \
    --description "ALB for Test Fest Tracker" \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} \
    --query 'GroupId' --output text)
  
  aws ec2 authorize-security-group-ingress \
    --group-id ${ALB_SG} \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 \
    --region ${AWS_REGION}
  
  echo "  Created ALB SG: ${ALB_SG}"
else
  export ALB_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=testfest-alb-sg" \
    --region ${AWS_REGION} \
    --query "SecurityGroups[0].GroupId" --output text)
  echo "  Using existing ALB SG: ${ALB_SG}"
fi

# ECS Security Group
if ! aws ec2 describe-security-groups --filters "Name=group-name,Values=testfest-ecs-sg" --region ${AWS_REGION} --query "SecurityGroups[0].GroupId" --output text 2>/dev/null | grep -q 'sg-'; then
  export ECS_SG=$(aws ec2 create-security-group \
    --group-name testfest-ecs-sg \
    --description "ECS tasks for Test Fest Tracker" \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} \
    --query 'GroupId' --output text)
  
  aws ec2 authorize-security-group-ingress \
    --group-id ${ECS_SG} \
    --protocol tcp --port 3000 \
    --source-group ${ALB_SG} \
    --region ${AWS_REGION}
  
  echo "  Created ECS SG: ${ECS_SG}"
else
  export ECS_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=testfest-ecs-sg" \
    --region ${AWS_REGION} \
    --query "SecurityGroups[0].GroupId" --output text)
  echo "  Using existing ECS SG: ${ECS_SG}"
fi

# RDS Security Group
if ! aws ec2 describe-security-groups --filters "Name=group-name,Values=testfest-rds-sg" --region ${AWS_REGION} --query "SecurityGroups[0].GroupId" --output text 2>/dev/null | grep -q 'sg-'; then
  export RDS_SG=$(aws ec2 create-security-group \
    --group-name testfest-rds-sg \
    --description "RDS for Test Fest Tracker" \
    --vpc-id ${VPC_ID} \
    --region ${AWS_REGION} \
    --query 'GroupId' --output text)
  
  aws ec2 authorize-security-group-ingress \
    --group-id ${RDS_SG} \
    --protocol tcp --port 5432 \
    --source-group ${ECS_SG} \
    --region ${AWS_REGION}
  
  echo "  Created RDS SG: ${RDS_SG}"
else
  export RDS_SG=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=testfest-rds-sg" \
    --region ${AWS_REGION} \
    --query "SecurityGroups[0].GroupId" --output text)
  echo "  Using existing RDS SG: ${RDS_SG}"
fi

echo ""

# Step 3: Create S3 Bucket
echo "🪣 Step 3: Creating S3 bucket for uploads..."
if ! aws s3 ls "s3://${BUCKET_NAME}" 2>/dev/null; then
  aws s3 mb "s3://${BUCKET_NAME}" --region ${AWS_REGION}
  
  # Enable versioning (optional)
  aws s3api put-bucket-versioning \
    --bucket ${BUCKET_NAME} \
    --versioning-configuration Status=Enabled
  
  echo "  Created bucket: ${BUCKET_NAME}"
else
  echo "  Using existing bucket: ${BUCKET_NAME}"
fi
echo ""

# Step 4: Create RDS Database
echo "🗄️  Step 4: Creating RDS database (this takes 5-10 minutes)..."
if ! aws rds describe-db-instances --db-instance-identifier ${DB_INSTANCE_ID} --region ${AWS_REGION} 2>/dev/null; then
  
  # Generate secure password
  export DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-30)
  
  # Create subnet group
  if ! aws rds describe-db-subnet-groups --db-subnet-group-name testfest-db-subnet --region ${AWS_REGION} 2>/dev/null; then
    aws rds create-db-subnet-group \
      --db-subnet-group-name testfest-db-subnet \
      --db-subnet-group-description "Subnet group for Test Fest DB" \
      --subnet-ids ${SUBNET_IDS} \
      --region ${AWS_REGION} \
      --tags "Key=Application,Value=TestFest"
  fi
  
  # Create database
  aws rds create-db-instance \
    --db-instance-identifier ${DB_INSTANCE_ID} \
    --db-instance-class db.t4g.micro \
    --engine postgres \
    --engine-version 15.4 \
    --master-username dbadmin \
    --master-user-password "${DB_PASSWORD}" \
    --allocated-storage 20 \
    --vpc-security-group-ids ${RDS_SG} \
    --db-subnet-group-name testfest-db-subnet \
    --backup-retention-period 7 \
    --storage-encrypted \
    --no-publicly-accessible \
    --region ${AWS_REGION} \
    --tags "Key=Application,Value=TestFest"
  
  echo "  Database creation initiated..."
  echo "  Waiting for database to be available (this may take 5-10 minutes)..."
  aws rds wait db-instance-available --db-instance-identifier ${DB_INSTANCE_ID} --region ${AWS_REGION}
  
  # Store password in SSM
  aws ssm put-parameter \
    --name /testfest/db-password \
    --value "${DB_PASSWORD}" \
    --type SecureString \
    --region ${AWS_REGION} \
    --overwrite 2>/dev/null || true
  
  echo "  ✅ Database created successfully"
else
  echo "  ℹ️  Database already exists"
fi

export DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier ${DB_INSTANCE_ID} \
  --query "DBInstances[0].Endpoint.Address" \
  --output text \
  --region ${AWS_REGION})

echo "  Database endpoint: ${DB_ENDPOINT}"
echo ""

# Step 5: Create Application Load Balancer
echo "⚖️  Step 5: Creating Application Load Balancer..."
if ! aws elbv2 describe-load-balancers --names ${ALB_NAME} --region ${AWS_REGION} 2>/dev/null; then
  
  SUBNET_ARRAY=(${SUBNET_IDS})
  
  export ALB_ARN=$(aws elbv2 create-load-balancer \
    --name ${ALB_NAME} \
    --subnets ${SUBNET_ARRAY[@]} \
    --security-groups ${ALB_SG} \
    --scheme internet-facing \
    --type application \
    --region ${AWS_REGION} \
    --tags "Key=Application,Value=TestFest" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  
  echo "  Created ALB: ${ALB_ARN}"
else
  export ALB_ARN=$(aws elbv2 describe-load-balancers \
    --names ${ALB_NAME} \
    --region ${AWS_REGION} \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)
  echo "  Using existing ALB: ${ALB_ARN}"
fi

# Create target group
if ! aws elbv2 describe-target-groups --names testfest-tg --region ${AWS_REGION} 2>/dev/null; then
  export TG_ARN=$(aws elbv2 create-target-group \
    --name testfest-tg \
    --protocol HTTP \
    --port 3000 \
    --vpc-id ${VPC_ID} \
    --target-type ip \
    --health-check-path /health \
    --health-check-interval-seconds 30 \
    --region ${AWS_REGION} \
    --tags "Key=Application,Value=TestFest" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  
  echo "  Created target group: ${TG_ARN}"
else
  export TG_ARN=$(aws elbv2 describe-target-groups \
    --names testfest-tg \
    --region ${AWS_REGION} \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  echo "  Using existing target group: ${TG_ARN}"
fi

# Create listener
if ! aws elbv2 describe-listeners --load-balancer-arn ${ALB_ARN} --region ${AWS_REGION} 2>/dev/null | grep -q 'Listeners'; then
  aws elbv2 create-listener \
    --load-balancer-arn ${ALB_ARN} \
    --protocol HTTP \
    --port 80 \
    --default-actions Type=forward,TargetGroupArn=${TG_ARN} \
    --region ${AWS_REGION} \
    --tags "Key=Application,Value=TestFest"
  
  echo "  Created listener"
fi

export ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns ${ALB_ARN} \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --region ${AWS_REGION})

echo "  ALB DNS: ${ALB_DNS}"
echo ""

# Step 6: Create IAM Roles
echo "👤 Step 6: Creating IAM roles..."

# Task execution role
if ! aws iam get-role --role-name ecsTaskExecutionRole 2>/dev/null; then
  cat > /tmp/trust-policy.json << 'EOF'
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
    --assume-role-policy-document file:///tmp/trust-policy.json
  
  aws iam attach-role-policy \
    --role-name ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
  
  echo "  Created task execution role"
else
  echo "  Task execution role already exists"
fi

# Task role for S3 access
if ! aws iam get-role --role-name testfestTaskRole 2>/dev/null; then
  cat > /tmp/task-role-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${BUCKET_NAME}/*",
        "arn:aws:s3:::${BUCKET_NAME}"
      ]
    }
  ]
}
EOF
  
  aws iam create-role \
    --role-name testfestTaskRole \
    --assume-role-policy-document file:///tmp/trust-policy.json
  
  aws iam put-role-policy \
    --role-name testfestTaskRole \
    --policy-name S3Upload \
    --policy-document file:///tmp/task-role-policy.json
  
  echo "  Created task role"
else
  echo "  Task role already exists"
fi

echo ""

# Step 7: Create ECR Repository
echo "📦 Step 7: Setting up ECR repository..."
if ! aws ecr describe-repositories --repository-names ${REPOSITORY_NAME} --region ${AWS_REGION} 2>/dev/null; then
  aws ecr create-repository --repository-name ${REPOSITORY_NAME} --region ${AWS_REGION}
  echo "  Created ECR repository: ${REPOSITORY_NAME}"
else
  echo "  ECR repository already exists"
fi
echo ""

# Step 8: Build and Push Docker Image
echo "🐳 Step 8: Building and pushing Docker image..."
echo "  Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "  Building image..."
docker build -t ${REPOSITORY_NAME}:latest .

echo "  Tagging image..."
docker tag ${REPOSITORY_NAME}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY_NAME}:latest

echo "  Pushing image to ECR..."
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY_NAME}:latest

echo "  ✅ Image pushed successfully"
echo ""

# Step 9: Store Secrets
echo "🔐 Step 9: Storing secrets in SSM Parameter Store..."

# Generate session secret if not exists
if ! aws ssm get-parameter --name /testfest/session-secret --region ${AWS_REGION} 2>/dev/null; then
  aws ssm put-parameter \
    --name /testfest/session-secret \
    --value "$(openssl rand -base64 32)" \
    --type SecureString \
    --region ${AWS_REGION}
  echo "  Created session secret"
fi

echo ""
echo "⚠️  IMPORTANT: You need to set the following SSM parameters manually:"
echo ""
echo "  aws ssm put-parameter --name /testfest/entra-client-secret --value 'YOUR_SECRET' --type SecureString --region ${AWS_REGION}"
echo ""
read -p "Press Enter after you've set the Entra client secret, or Ctrl+C to exit..."

# Step 10: Create ECS Cluster
echo "🎯 Step 10: Creating ECS cluster..."
if ! aws ecs describe-clusters --clusters ${CLUSTER_NAME} --region ${AWS_REGION} 2>/dev/null | grep -q 'ACTIVE'; then
  aws ecs create-cluster --cluster-name ${CLUSTER_NAME} --region ${AWS_REGION}
  echo "  Created cluster: ${CLUSTER_NAME}"
else
  echo "  Cluster already exists"
fi
echo ""

# Step 11: Register Task Definition
echo "📝 Step 11: Registering task definition..."

# Get DB password from SSM
export DB_PASSWORD_PARAM="/testfest/db-password"

cat > /tmp/task-definition.json << EOF
{
  "family": "testfest-task",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/testfestTaskRole",
  "containerDefinitions": [
    {
      "name": "testfest",
      "image": "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPOSITORY_NAME}:latest",
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
          "value": "postgresql://dbadmin@${DB_ENDPOINT}:5432/postgres"
        },
        {
          "name": "ENTRA_ISSUER",
          "value": "${ENTRA_ISSUER:-https://login.microsoftonline.com/YOUR_TENANT/v2.0}"
        },
        {
          "name": "ENTRA_CLIENT_ID",
          "value": "${ENTRA_CLIENT_ID:-YOUR_CLIENT_ID}"
        },
        {
          "name": "ENTRA_REDIRECT_URI",
          "value": "http://${ALB_DNS}/auth/callback"
        }
      ],
      "secrets": [
        {
          "name": "SESSION_SECRET",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/testfest/session-secret"
        },
        {
          "name": "ENTRA_CLIENT_SECRET",
          "valueFrom": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/testfest/entra-client-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/testfest",
          "awslogs-region": "${AWS_REGION}",
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
EOF

aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-definition.json \
  --region ${AWS_REGION}

echo "  Task definition registered"
echo ""

# Step 12: Create ECS Service
echo "🚢 Step 12: Creating ECS service with Fargate Spot..."

SUBNET_LIST=$(echo ${SUBNET_IDS} | tr '\t' ',')

if ! aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_REGION} 2>/dev/null | grep -q 'ACTIVE'; then
  aws ecs create-service \
    --cluster ${CLUSTER_NAME} \
    --service-name ${SERVICE_NAME} \
    --task-definition testfest-task \
    --desired-count 1 \
    --launch-type FARGATE \
    --platform-version LATEST \
    --network-configuration "awsvpcConfiguration={subnets=[${SUBNET_LIST}],securityGroups=[${ECS_SG}],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=${TG_ARN},containerName=testfest,containerPort=3000" \
    --capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=1,base=0 \
    --region ${AWS_REGION}
  
  echo "  ✅ Service created successfully"
else
  echo "  Service already exists, updating..."
  aws ecs update-service \
    --cluster ${CLUSTER_NAME} \
    --service ${SERVICE_NAME} \
    --force-new-deployment \
    --region ${AWS_REGION}
  
  echo "  ✅ Service updated"
fi

echo ""
echo "=============================================="
echo "✅ Deployment Complete!"
echo "=============================================="
echo ""
echo "📊 Resources Created:"
echo "  - RDS Database: ${DB_INSTANCE_ID} (${DB_ENDPOINT})"
echo "  - S3 Bucket: ${BUCKET_NAME}"
echo "  - ALB: ${ALB_DNS}"
echo "  - ECS Cluster: ${CLUSTER_NAME}"
echo "  - ECS Service: ${SERVICE_NAME}"
echo ""
echo "🌐 Your application will be available at:"
echo "  http://${ALB_DNS}"
echo ""
echo "⚠️  Next Steps:"
echo "  1. Update Entra ID redirect URI to: http://${ALB_DNS}/auth/callback"
echo "  2. Set environment variables if not already set:"
echo "     export ENTRA_ISSUER='https://login.microsoftonline.com/YOUR_TENANT/v2.0'"
echo "     export ENTRA_CLIENT_ID='YOUR_CLIENT_ID'"
echo "  3. Wait 2-3 minutes for the service to start"
echo "  4. Monitor deployment:"
echo "     aws ecs describe-services --cluster ${CLUSTER_NAME} --services ${SERVICE_NAME} --region ${AWS_REGION}"
echo ""
echo "💰 Estimated Monthly Cost: ~$42-47"
echo ""
