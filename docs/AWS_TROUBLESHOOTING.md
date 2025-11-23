# AWS Deployment Troubleshooting Guide

Common issues and solutions for AWS deployment of Test Fest Tracker.

---

## Deployment Issues

### Issue 1: "No default VPC found"

**Error**: Script exits with "No default VPC found. Please create a VPC first."

**Solution**:
```bash
# Create a default VPC
aws ec2 create-default-vpc

# Or use a specific VPC
export VPC_ID=vpc-xxxxxx
./scripts/deploy-to-aws.sh
```

---

### Issue 2: "Not enough subnet IDs for RDS"

**Error**: "Need at least 2 subnets in different AZs"

**Solution**:
```bash
# List all subnets in your VPC
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].[SubnetId,AvailabilityZone]'

# If you only have 1 subnet, create another in a different AZ
aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b
```

---

### Issue 3: Docker Build Fails

**Error**: "docker: command not found" or build errors

**Solution**:
```bash
# Check Docker is running
docker ps

# If not running (macOS)
open -a Docker

# Wait for Docker to start, then retry
./scripts/deploy-to-aws.sh
```

---

## Runtime Issues

### Issue 4: ECS Tasks Keep Failing

**Diagnosis**:
```bash
# Check service events
aws ecs describe-services \
  --cluster testfest-cluster \
  --services testfest-service \
  --query 'services[0].events[0:5]'

# Check CloudWatch logs
aws logs tail /ecs/testfest --follow --since 30m
```

**Common Causes**:

#### Health Check Failing
```bash
# Check if /health endpoint is responding
curl http://ALB_DNS/health

# View task definition health check
aws ecs describe-task-definition \
  --task-definition testfest-task \
  --query 'taskDefinition.containerDefinitions[0].healthCheck'
```

#### Database Connection Failed
Check logs for: `Error: connect ETIMEDOUT` or `ECONNREFUSED`

**Solution**:
```bash
# Verify security group allows ECS -> RDS
aws ec2 describe-security-groups \
  --group-ids $RDS_SG \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`5432`]'

# Should show source security group = ECS_SG
# If not, add the rule:
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG \
  --protocol tcp \
  --port 5432 \
  --source-group $ECS_SG
```

#### Missing Environment Variables
Check logs for: `Configuration Errors` or `required variables missing`

**Solution**:
```bash
# Verify task definition has all env vars
aws ecs describe-task-definition \
  --task-definition testfest-task \
  --query 'taskDefinition.containerDefinitions[0].environment'

# Update and re-register task definition with correct values
# See AWS_QUICK_START.md for updating env vars
```

---

### Issue 5: "OIDC not configured" Error

**Error in logs**: `OIDC not configured` or SSO login redirects to error

**Solution**:

1. **Verify Entra ID credentials are set**:
   ```bash
   aws ecs describe-task-definition \
     --task-definition testfest-task \
     --query 'taskDefinition.containerDefinitions[0].environment[?name==`ENTRA_ISSUER`]'
   ```

2. **Check secrets are accessible**:
   ```bash
   # Verify SSM parameter exists
   aws ssm get-parameter \
     --name /testfest/entra-client-secret \
     --with-decryption
   
   # Check task execution role has permission
   aws iam get-role-policy \
     --role-name ecsTaskExecutionRole \
     --policy-name AmazonECSTaskExecutionRolePolicy
   ```

3. **Update task definition with correct values**

---

### Issue 6: Load Balancer 502 Bad Gateway

**Error**: ALB returns 502 when accessing the app

**Diagnosis**:
```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN

# Should show "State": "healthy"
```

**Common Causes**:

#### No Healthy Targets
```bash
# Check ECS service has running tasks
aws ecs describe-services \
  --cluster testfest-cluster \
  --services testfest-service \
  --query 'services[0].{Running:runningCount,Desired:desiredCount}'

# If runningCount = 0, check why tasks are failing (see Issue 4)
```

#### Wrong Port Mapping
```bash
# Verify container port matches target group
aws ecs describe-task-definition \
  --task-definition testfest-task \
  --query 'taskDefinition.containerDefinitions[0].portMappings'

# Should be port 3000
```

#### Security Group Blocks Traffic
```bash
# Verify ECS SG allows traffic from ALB SG on port 3000
aws ec2 describe-security-groups \
  --group-ids $ECS_SG \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`3000`]'
```

---

### Issue 7: WebSocket Connection Fails

**Error in browser console**: `WebSocket connection failed`

**Diagnosis**:
```bash
# Test WebSocket with wscat (install: npm install -g wscat)
wscat -c ws://YOUR_ALB_DNS/socket.io/?EIO=4&transport=websocket
```

**Solutions**:

1. **Enable sticky sessions** (required for WebSocket):
   ```bash
   aws elbv2 modify-target-group-attributes \
     --target-group-arn $TG_ARN \
     --attributes Key=stickiness.enabled,Value=true \
                  Key=stickiness.type,Value=lb_cookie \
                  Key=stickiness.lb_cookie.duration_seconds,Value=86400
   ```

2. **Verify ALB listener timeout**:
   ```bash
   # Update idle timeout to 60 seconds
   aws elbv2 modify-load-balancer-attributes \
     --load-balancer-arn $ALB_ARN \
     --attributes Key=idle_timeout.timeout_seconds,Value=60
   ```

---

### Issue 8: File Uploads Not Working

**Error**: Files upload but are lost after container restart

**Cause**: Files are stored in container, not persistent storage

**Solution**: Implement S3 upload (see `AWS_S3_UPLOADS.md`) or use EFS:

```bash
# Create EFS file system
aws efs create-file-system \
  --performance-mode generalPurpose \
  --throughput-mode bursting \
  --encrypted \
  --tags Key=Name,Value=testfest-uploads

# Mount to ECS tasks (update task definition)
# See: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/efs-volumes.html
```

---

## Performance Issues

### Issue 9: Slow Response Times

**Diagnosis**:
```bash
# Check CPU/memory usage
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=testfest-service Name=ClusterName,Value=testfest-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

**Solutions**:

1. **Increase task resources**:
   ```json
   // Update task definition
   {
     "cpu": "1024",  // was 512
     "memory": "2048"  // was 1024
   }
   ```

2. **Scale horizontally**:
   ```bash
   aws ecs update-service \
     --cluster testfest-cluster \
     --service testfest-service \
     --desired-count 2
   ```

3. **Optimize database**:
   ```bash
   # Upgrade RDS instance
   aws rds modify-db-instance \
     --db-instance-identifier testfest-db \
     --db-instance-class db.t4g.small \
     --apply-immediately
   ```

---

### Issue 10: Database Connection Pool Exhausted

**Error in logs**: `too many clients already`

**Solution**:

1. **Increase RDS max_connections**:
   ```bash
   # Create parameter group
   aws rds create-db-parameter-group \
     --db-parameter-group-name testfest-params \
     --db-parameter-group-family postgres15 \
     --description "Custom params for testfest"
   
   # Modify max_connections
   aws rds modify-db-parameter-group \
     --db-parameter-group-name testfest-params \
     --parameters "ParameterName=max_connections,ParameterValue=100,ApplyMethod=immediate"
   
   # Apply to DB instance
   aws rds modify-db-instance \
     --db-instance-identifier testfest-db \
     --db-parameter-group-name testfest-params
   ```

2. **Configure connection pooling in app** (already configured in `server.js`):
   ```javascript
   const pool = new Pool({
     connectionString: DATABASE_URL,
     max: 10  // Limit per task
   });
   ```

---

## Cost Issues

### Issue 11: Unexpected High Costs

**Diagnosis**:
```bash
# Get detailed cost breakdown
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d "-7 days" +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=SERVICE,Type=USAGE_TYPE
```

**Common Causes**:

1. **NAT Gateway** (~$33/month if accidentally created)
2. **Data transfer** (large file uploads/downloads)
3. **CloudWatch Logs** (verbose logging)
4. **Elastic IPs** (unused = $3.60/month each)

**Solutions**:
```bash
# Delete unused NAT gateways
aws ec2 describe-nat-gateways --filter "Name=state,Values=available"
aws ec2 delete-nat-gateway --nat-gateway-id nat-xxxxx

# Reduce log retention
aws logs put-retention-policy \
  --log-group-name /ecs/testfest \
  --retention-in-days 3

# Delete unused elastic IPs
aws ec2 describe-addresses --query 'Addresses[?AssociationId==null].AllocationId'
aws ec2 release-address --allocation-id eipalloc-xxxxx
```

---

## Monitoring & Alerts

### Set Up Alarms for Common Issues

```bash
# Task count alarm
aws cloudwatch put-metric-alarm \
  --alarm-name testfest-no-running-tasks \
  --alarm-description "Alert when no tasks are running" \
  --metric-name RunningTaskCount \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --dimensions Name=ServiceName,Value=testfest-service Name=ClusterName,Value=testfest-cluster

# High CPU alarm
aws cloudwatch put-metric-alarm \
  --alarm-name testfest-high-cpu \
  --alarm-description "Alert when CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ECS \
  --statistic Average \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ServiceName,Value=testfest-service Name=ClusterName,Value=testfest-cluster

# Unhealthy target alarm
aws cloudwatch put-metric-alarm \
  --alarm-name testfest-unhealthy-targets \
  --alarm-description "Alert when targets are unhealthy" \
  --metric-name UnHealthyHostCount \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=TargetGroup,Value=targetgroup/testfest-tg/xxxxx Name=LoadBalancer,Value=app/testfest-alb/xxxxx
```

---

## Getting Help

### Useful Commands

```bash
# View all ECS events (last 100)
aws ecs describe-services \
  --cluster testfest-cluster \
  --services testfest-service \
  --query 'services[0].events[0:100]' \
  --output table

# Get task ARNs
aws ecs list-tasks \
  --cluster testfest-cluster \
  --service-name testfest-service

# Describe specific task
aws ecs describe-tasks \
  --cluster testfest-cluster \
  --tasks arn:aws:ecs:region:account:task/xxxxx

# Execute into running container (for debugging)
aws ecs execute-command \
  --cluster testfest-cluster \
  --task TASK_ARN \
  --container testfest \
  --interactive \
  --command "/bin/sh"
```

### Enable ECS Exec for Debugging

Add to task definition:
```json
{
  "enableExecuteCommand": true
}
```

Then update service:
```bash
aws ecs update-service \
  --cluster testfest-cluster \
  --service testfest-service \
  --enable-execute-command
```

---

### Support Resources

- **AWS Support**: https://console.aws.amazon.com/support/
- **ECS Troubleshooting**: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/troubleshooting.html
- **RDS Troubleshooting**: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_Troubleshooting.html
- **Community**: https://repost.aws/
- **Project Issues**: https://github.com/yourorg/testfest/issues

---

**Last Updated**: November 2025
