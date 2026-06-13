# Attendance System — Terraform Infrastructure
# This configures cloud provider resources for production deployment.
# Supports AWS EKS, RDS (PostgreSQL), ElastiCache (Redis), and S3.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.25"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
  }

  backend "s3" {
    bucket         = "attendance-system-tfstate"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "attendance-system-tf-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "attendance-system"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
