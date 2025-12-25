# Cost Optimization & Hibernation Guide

Since the Test Fest Tracker is used only every 2-3 months, you can significantly reduce costs by "hibernating" the infrastructure during off-months.

## 💰 Cost Comparison

| State          | Monthly Cost (Estimated) | Notes                                                      |
| :------------- | :----------------------- | :--------------------------------------------------------- |
| **Active**     | ~$100 - $150             | EKS Cluster, RDS, LB running 24/7                          |
| **Hibernated** | ~$5 - $10                | Paying only for ECR storage, S3 storage, and RDS Snapshots |

---

## 💤 How to Hibernate (Turn Off)

When the Test Fest is over, follow these steps to stop accruing costs:

### 1. Delete the Kubernetes Application

Remove the pods and the Load Balancer (ALB). The ALB is one of the most expensive "idle" resources.

```bash
kubectl delete -f k8s/
```

### 2. Snapshot and Delete RDS

Do **not** just destroy the RDS instance if you want to keep the data.

1. Go to the AWS Console -> RDS.
2. Select your `testfest-db`.
3. Actions -> **Delete**.
4. **IMPORTANT**: Select "Create final snapshot?" and name it `testfest-final-snapshot-[date]`.
5. This stops the hourly instance cost while keeping your data safe for $0.02/GB per month.

### 3. Destroy the App Infrastructure

Delete the EKS cluster and other app-level resources via Terraform.

```bash
cd terraform/testfest-app
terraform destroy
```

_Note: This will delete the EKS cluster but leave your baseline network (VPC/IAM) in `testfest-infra` intact, which costs nothing while idle._

---

## 🚀 How to Resume (Turn On)

When the next Test Fest is coming up:

### 1. Re-provision App Infrastructure

```bash
cd terraform/testfest-app
terraform apply
```

### 2. Restore RDS from Snapshot

1. Go to AWS Console -> RDS -> Snapshots.
2. Select your `testfest-final-snapshot`.
3. Actions -> **Restore Snapshot**.
4. Restore it using the same settings (instance class, VPC, Security Group) defined in your Terraform.
5. Once restored, update the `DATABASE_URL` in your `k8s/secret.yaml` if the endpoint address changed.

### 3. Re-deploy the Application

```bash
# Update kubeconfig for the new cluster
aws eks update-kubeconfig --region <REGION> --name testfest-eks

# Deploy
kubectl apply -f k8s/
```

---

## ⚡ Alternative: Scaling to Zero (Warm Standby)

If you want to keep the infrastructure but stop the "computing" costs:

1. **Scale Pods to 0**: `kubectl scale deployment testfest-tracker --replicas=0`
2. **Stop RDS Instance**: You can "Stop" an RDS instance for up to 7 days (AWS will auto-start it after that, so this is only for short breaks).

**Recommendation**: For a 2-3 month gap, the **Hibernate** method above is the best way to save the most money.
