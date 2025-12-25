# Deploying Test Fest Tracker to AWS EKS

This guide outlines the steps to prepare and deploy the Test Fest Tracker application to an Amazon EKS (Elastic Kubernetes Service) cluster.

## Prerequisites

1.  **AWS CLI** configured with appropriate permissions.
2.  **kubectl** installed.
3.  **eksctl** installed (recommended for cluster creation).
4.  **Docker** installed and running.
5.  **Helm** (optional, for installing the AWS Load Balancer Controller).

## Provisioning Infrastructure

You have two main options for setting up the AWS resources:

### Option A: Manual/Scripted (easier for quick tests)

Use `eksctl` as described below.

### Option B: Terraform (recommended for production)

The Terraform setup is split into two directories to accommodate organizational security boundaries:

1.  **`terraform/testfest-infra/`**: Baseline infrastructure (VPC, Subnets, IAM Roles). Send this to your Ops/Security team if you don't have permissions to create networks or IAM roles.
2.  **`terraform/testfest-app/`**: Application-specific resources (EKS, RDS, ECR, S3). You can run this once Ops provides the VPC and IAM information.

Refer to the READMEs in each folder for specific usage instructions.

## Step 1: Create an EKS Cluster (Manual Option)

```bash
eksctl create cluster \
  --name testfest-cluster \
  --region us-east-1 \
  --fargate
```

_Note: Using `--fargate` makes it serverless, which is easier to manage but has some limitations (e.g., no EBS volumes)._

## Step 2: Set up ECR Repository

If you haven't already, create an ECR repository:

```bash
aws ecr create-repository --repository-name testfest-repo
```

Build and push your image (replace `<ACCOUNT_ID>` and `<REGION>`):

```bash
# Login to ECR
aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com

# Build, tag and push
docker build -t testfest-repo .
docker tag testfest-repo:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/testfest-repo:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/testfest-repo:latest
```

## Step 3: Install AWS Load Balancer Controller

To use the `Ingress` resource, you must install the AWS Load Balancer Controller in your cluster. Follow the [official AWS documentation](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html).

## Step 4: Configure Database (RDS)

It is highly recommended to use **Amazon RDS (PostgreSQL)** for production data.

1.  Create an RDS instance in the same VPC as your EKS cluster.
2.  Ensure the security group allows inbound traffic on port 5432 from the EKS nodes/Fargate pods.
3.  Get the connection string: `postgresql://dbadmin:password@host:5432/testfest`.

## Step 5: Prepare Kubernetes Manifests

The manifests are located in the `k8s/` directory.

### 1. Configure ConfigMap

Edit `k8s/configmap.yaml` with your non-sensitive settings (Entra IDs, etc.).

### 2. Create Secrets

Copy `k8s/secret.yaml.template` to `k8s/secret.yaml` and update with base64 encoded values:

```bash
echo -n 'your_db_url' | base64
```

### 3. Update Deployment

Update the image path in `k8s/deployment.yaml` with your ECR repository URL.

## Step 6: Deploy to EKS

Apply the manifests in order:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```

## Step 7: Shared Storage (Optional but Recommended)

If you scale the application to multiple pods, the `uploads/` directory must be shared.

- **Option A: S3 (Cloud Native)**: Modify the application to use S3 for storage.
- **Option B: Amazon EFS**: Mount an EFS volume to `/usr/src/app/uploads`. This requires the EFS CSI Driver.

## Monitoring

Check pod status:

```bash
kubectl get pods
kubectl logs -f deployment/testfest-tracker
```

Check ingress status:

```bash
kubectl get ingress testfest-ingress
```

The ADDRESS column will show the ALB DNS name once it's provisioned.
