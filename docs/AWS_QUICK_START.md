# AWS Deployment Quick Start

## Prerequisites

1. **AWS CLI installed and configured**
   ```bash
   aws configure
   ```

2. **Docker installed and running**

3. **Entra ID App Registration** with:
   - Client ID
   - Client Secret
   - Tenant ID

---

## Fastest Deployment (ECS Fargate Spot)

### One-Command Deploy

```bash
# Set your Entra ID credentials
export ENTRA_ISSUER="https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0"
export ENTRA_CLIENT_ID="your-client-id"

# Run deployment script
./scripts/deploy-to-aws.sh
```

The script will:
1. ✅ Create VPC resources and security groups
2. ✅ Create S3 bucket for uploads
3. ✅ Create RDS PostgreSQL database (t4g.micro)
4. ✅ Create Application Load Balancer
5. ✅ Create IAM roles
6. ✅ Build and push Docker image to ECR
7. ✅ Deploy to ECS Fargate Spot

**Deployment time**: ~15-20 minutes (most of it is RDS creation)

**Cost**: ~$42-47/month

---

## Manual Deployment Steps

If you prefer to deploy manually or customize the setup, see the full guide: [`docs/AWS_DEPLOYMENT_MINIMAL.md`](./AWS_DEPLOYMENT_MINIMAL.md)

---

## Post-Deployment

### 1. Get Application URL

```bash
aws elbv2 describe-load-balancers \
  --names testfest-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text
```

### 2. Update Entra ID Redirect URI

In Azure Portal → App Registrations → Your App:
- Add redirect URI: `http://YOUR_ALB_DNS/auth/callback`

### 3. Set Entra Client Secret (if not done during deployment)

```bash
aws ssm put-parameter \
  --name /testfest/entra-client-secret \
  --value 'YOUR_CLIENT_SECRET' \
  --type SecureString \
  --region us-east-1
```

### 4. Monitor Deployment

```bash
# Check service status
aws ecs describe-services \
  --cluster testfest-cluster \
  --services testfest-service \
  --query 'services[0].deployments[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# View logs
aws logs tail /ecs/testfest --follow
```

### 5. Test Health Endpoint

```bash
curl http://YOUR_ALB_DNS/health
```

---

## Common Issues

### Service Won't Start

**Check logs:**
```bash
aws logs tail /ecs/testfest --follow --since 10m
```

**Common causes:**
- Missing or invalid SSO credentials
- Database connection issues
- Incorrect environment variables

### Database Connection Failed

**Verify security group allows connection:**
```bash
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=testfest-rds-sg" \
  --query "SecurityGroups[0].IpPermissions"
```

### Task Keeps Restarting

**Check task definition:**
```bash
aws ecs describe-task-definition \
  --task-definition testfest-task \
  --query 'taskDefinition.containerDefinitions[0].environment'
```

---

## Updating the Application

### Deploy New Version

```bash
# Build and push new image
docker build -t testfest-repo:latest .

aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

docker tag testfest-repo:latest \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/testfest-repo:latest

docker push \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com/testfest-repo:latest

# Force new deployment
aws ecs update-service \
  --cluster testfest-cluster \
  --service testfest-service \
  --force-new-deployment
```

### Update Environment Variables

1. Update task definition in `task-definition.json`
2. Register new version:
   ```bash
   aws ecs register-task-definition --cli-input-json file://task-definition.json
   ```
3. Update service:
   ```bash
   aws ecs update-service \
     --cluster testfest-cluster \
     --service testfest-service \
     --task-definition testfest-task
   ```

---

## Scaling

### Increase Task Count

```bash
aws ecs update-service \
  --cluster testfest-cluster \
  --service testfest-service \
  --desired-count 2
```

### Enable Auto Scaling

```bash
# Register scalable target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/testfest-cluster/testfest-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 \
  --max-capacity 4

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/testfest-cluster/testfest-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-scaling \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 75.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    },
    "ScaleInCooldown": 300,
    "ScaleOutCooldown": 60
  }'
```

---

## Cost Optimization Tips

1. **Use Fargate Spot** (already configured)
   - 70% cheaper than on-demand
   - Minimal interruptions for web apps

2. **Right-size RDS**
   - Start with t4g.micro ($15/mo)
   - Monitor CPU/memory usage
   - Upgrade only if needed

3. **Enable RDS Storage Auto-scaling**
   ```bash
   aws rds modify-db-instance \
     --db-instance-identifier testfest-db \
     --max-allocated-storage 100
   ```

4. **Set S3 Lifecycle Policies**
   - Transition old uploads to Glacier after 90 days
   - Delete files older than 1 year

5. **Use CloudWatch Logs Insights Sparingly**
   - Logs are $0.50/GB ingested
   - Set retention to 7 days for cost savings

---

## Cleanup / Teardown

**To delete all resources:**

```bash
# Delete ECS service
aws ecs delete-service \
  --cluster testfest-cluster \
  --service testfest-service \
  --force

# Delete ECS cluster
aws ecs delete-cluster --cluster testfest-cluster

# Delete ALB
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names testfest-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN

# Delete target group
TG_ARN=$(aws elbv2 describe-target-groups \
  --names testfest-tg \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)
aws elbv2 delete-target-group --target-group-arn $TG_ARN

# Delete RDS (remove protection first if enabled)
aws rds delete-db-instance \
  --db-instance-identifier testfest-db \
  --skip-final-snapshot

# Empty and delete S3 bucket
aws s3 rm s3://YOUR_BUCKET_NAME --recursive
aws s3 rb s3://YOUR_BUCKET_NAME

# Delete ECR repository
aws ecr delete-repository \
  --repository-name testfest-repo \
  --force

# Delete security groups
aws ec2 delete-security-group --group-name testfest-alb-sg
aws ec2 delete-security-group --group-name testfest-ecs-sg
aws ec2 delete-security-group --group-name testfest-rds-sg

# Delete SSM parameters
aws ssm delete-parameter --name /testfest/session-secret
aws ssm delete-parameter --name /testfest/entra-client-secret
aws ssm delete-parameter --name /testfest/db-password
```

---

## Support

- **Full deployment guide**: [`docs/AWS_DEPLOYMENT_MINIMAL.md`](./AWS_DEPLOYMENT_MINIMAL.md)
- **General deployment checklist**: [`docs/DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md)
- **AWS CLI reference**: https://awscli.amazonaws.com/v2/documentation/api/latest/reference/index.html
