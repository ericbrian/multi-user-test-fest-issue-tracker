# AWS Deployment Cost Calculator

## Minimal Production Setup (Recommended)

### Components Breakdown

| Component | Specification | Monthly Cost | Notes |
|-----------|---------------|--------------|-------|
| **ECS Fargate Spot** | 0.5 vCPU, 1 GB RAM | $10.44 | 70% savings vs on-demand |
| **RDS PostgreSQL** | db.t4g.micro (1 vCPU, 1 GB) | $14.60 | ARM-based, cheapest option |
| **Application Load Balancer** | Standard ALB | $16.20 | Required for WebSocket support |
| **ALB Data Transfer** | 10 GB/month estimate | $0.80 | $0.008/GB processed |
| **S3 Storage** | 20 GB | $0.46 | $0.023/GB + requests |
| **CloudWatch Logs** | 5 GB/month | $2.50 | $0.50/GB ingested |
| **Data Transfer** | 10 GB outbound | $0.90 | First 10TB: $0.09/GB |
| **ECR Storage** | 2 GB | $0.20 | $0.10/GB |
| | | | |
| **TOTAL** | | **~$45.70/month** | Assumes moderate usage |

### Usage Assumptions
- **Compute**: 1 task running 24/7 (730 hours/month)
- **Database**: Single t4g.micro instance
- **Requests**: ~100,000 requests/month
- **Data transfer**: 10 GB outbound/month
- **Logs**: 5 GB/month (7-day retention)

---

## Cost Optimization Scenarios

### Scenario 1: Development / Testing (~$30/month)

**Changes from minimal setup:**
- Remove ALB (use public IP directly) - Save $16.20
- Use Lightsail Database instead of RDS - Save $0

**Total: ~$29/month**

⚠️ **Limitations:**
- No WebSocket support (Socket.IO won't work)
- Single instance only
- No SSL certificate support

### Scenario 2: Small Production (~$46/month)

This is the **recommended minimal production setup** (shown above).

✅ **Includes:**
- WebSocket support for Socket.IO
- Auto-healing (ECS restarts failed containers)
- Health checks
- CloudWatch monitoring

### Scenario 3: Medium Production (~$120/month)

**Upgrades:**
- ECS Fargate: 2 tasks (0.5 vCPU, 1 GB each) - $20.88
- RDS: db.t4g.small (2 vCPU, 2 GB) - $29.20
- Multi-AZ RDS for HA - +$29.20
- ALB: Same - $16.20
- S3, Logs, etc: ~$5

**Total: ~$120/month**

✅ **Benefits:**
- High availability (Multi-AZ database)
- 2x application capacity
- Better performance

### Scenario 4: High Availability (~$250/month)

**Upgrades:**
- ECS Fargate: 4 tasks across 2 AZs - $41.76
- RDS: db.t3.medium Multi-AZ (2 vCPU, 4 GB) - $120
- ALB: Same - $16.20
- NAT Gateway for private subnets - $32.85
- EFS for shared uploads - $30
- Other costs - $10

**Total: ~$250/month**

✅ **Enterprise features:**
- Full redundancy
- Auto-scaling ready
- Shared file storage (EFS)
- Private subnets with NAT

---

## Cost by Feature

### Required for Basic Functionality

| Feature | Cost/Month | Optional? |
|---------|------------|-----------|
| Compute (ECS Fargate Spot) | $10.44 | ❌ Required |
| Database (RDS t4g.micro) | $14.60 | ❌ Required |
| Load Balancer (for WebSocket) | $16.20 | ⚠️ Needed for Socket.IO |
| S3 (file uploads) | $0.46 | ✅ Can use local storage |
| CloudWatch Logs | $2.50 | ✅ Can disable |

**Absolute minimum**: ~$27/month (compute + database + logs)  
**Recommended minimum**: ~$46/month (includes ALB)

---

## Regional Pricing Differences

Prices shown are for **us-east-1** (N. Virginia). Other regions may vary:

| Region | ECS Fargate Spot | RDS t4g.micro | ALB |
|--------|------------------|---------------|-----|
| us-east-1 | $10.44 | $14.60 | $16.20 |
| us-west-2 | $10.44 | $14.60 | $16.20 |
| eu-west-1 | $11.49 | $16.06 | $17.82 |
| ap-southeast-1 | $12.18 | $17.52 | $17.82 |

💡 **Tip**: Use us-east-1 for lowest costs.

---

## Free Tier Benefits (First 12 Months)

If you're on AWS Free Tier, you can save:

| Service | Free Tier | Savings/Month |
|---------|-----------|---------------|
| RDS | 750 hours t2.micro/t3.micro | ~$15 (different instance class) |
| ALB | 750 hours + 15 LCUs | ~$16 for first month |
| S3 | 5 GB storage + 20k requests | ~$0.50 |
| CloudWatch | 5 GB logs + 10 metrics | ~$2.50 |

**First month total**: ~$10 (only pay for Fargate)  
**After free tier**: ~$46/month

⚠️ **Note**: Free tier is for t2/t3 instances. Our script uses t4g (ARM) for better pricing after free tier.

---

## Cost Reduction Strategies

### 1. Use Fargate Spot (Already Configured)
**Savings**: 70% on compute  
**Risk**: Rare interruptions (< 5% chance)

### 2. Reduce Log Retention
```bash
aws logs put-retention-policy \
  --log-group-name /ecs/testfest \
  --retention-in-days 3
```
**Savings**: ~$1-2/month

### 3. Enable S3 Lifecycle Policies
```bash
# Transition to Glacier after 90 days
aws s3api put-bucket-lifecycle-configuration \
  --bucket testfest-uploads-xxx \
  --lifecycle-configuration file://lifecycle-policy.json
```
**Savings**: ~$0.30/month (assuming 10GB old uploads)

### 4. Use Reserved Instances for RDS (1-year commitment)
**Savings**: 30-40% on RDS costs (~$5/month)

### 5. Schedule On/Off for Dev Environments
```bash
# Stop database at night (dev only)
aws rds stop-db-instance --db-instance-identifier testfest-db
```
**Savings**: ~$10/month for dev environments

### 6. Use CloudFront for Static Assets
If you have many images, serve them via CloudFront CDN  
**Cost**: ~$2/month for 10 GB transfer  
**Savings**: Reduces ALB data transfer costs

---

## Cost Monitoring

### Set Up Billing Alerts

```bash
# Create SNS topic for alerts
aws sns create-topic --name billing-alerts

# Subscribe your email
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:billing-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# Create CloudWatch alarm for $50 threshold
aws cloudwatch put-metric-alarm \
  --alarm-name MonthlyBillingAlert \
  --alarm-description "Alert when monthly charges exceed $50" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --evaluation-periods 1 \
  --threshold 50 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:ACCOUNT_ID:billing-alerts
```

### View Current Costs

```bash
# Get current month-to-date costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d "-1 month" +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics "UnblendedCost" \
  --group-by Type=SERVICE
```

---

## Comparison: AWS vs Alternatives

| Platform | Monthly Cost | Setup Complexity | WebSocket Support |
|----------|--------------|------------------|-------------------|
| **AWS ECS Fargate** | $46 | Medium | ✅ Yes |
| Heroku (Hobby) | $7 + $9 = $16 | Low | ✅ Yes |
| Heroku (Standard) | $25 + $50 = $75 | Low | ✅ Yes |
| DigitalOcean App Platform | $12 + $15 = $27 | Low | ✅ Yes |
| Railway | ~$20 | Very Low | ✅ Yes |
| Render | $7 + $7 = $14 | Low | ✅ Yes |
| AWS Lightsail | $22 | Low | ❌ No |
| Google Cloud Run | ~$25 | Medium | ⚠️ Limited |

💡 **Why AWS despite higher cost?**
- Full control over resources
- Better for enterprise environments
- AWS credits often available
- Integration with existing AWS infrastructure
- Better security/compliance features

---

## Sample Monthly Bill (Minimal Setup)

```
AWS Billing Statement - December 2025
==========================================

ECS Fargate Spot
  730 hours @ $0.014306/hour           $10.44

RDS PostgreSQL t4g.micro  
  730 hours @ $0.020/hour               $14.60

Application Load Balancer
  730 hours @ $0.0225/hour              $16.43

S3 Storage
  20 GB @ $0.023/GB                      $0.46

CloudWatch Logs
  5 GB ingested @ $0.50/GB               $2.50

Data Transfer Out
  10 GB @ $0.09/GB                       $0.90

ECR Storage
  2 GB @ $0.10/GB                        $0.20

------------------------------------------
TOTAL:                                 $45.53
==========================================
```

---

## Questions?

**Q: Can I go cheaper than $46/month?**  
A: Yes, but you'll lose WebSocket support. Consider Render.com ($14/mo) or Railway ($20/mo) for cheaper alternatives with WebSocket.

**Q: What if I exceed my budget?**  
A: Set up billing alarms and AWS Budgets. You can also enable spending limits.

**Q: Does this include SSL/HTTPS?**  
A: ACM certificates are FREE. You'll need Route 53 ($0.50/mo per hosted zone) for custom domain.

**Q: How much will it cost for 1,000 users?**  
A: Depends on usage, but likely $100-150/month with 2-3 Fargate tasks and a t4g.small database.

---

**Last Updated**: November 2025  
**Prices**: Based on us-east-1 pricing, subject to change

For latest pricing, see: https://aws.amazon.com/pricing/
