terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }

  required_version = ">= 1.4.0"
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

# ── Data sources ──────────────────────────────────────────────────────────────

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ── Locals: naming & tags aplicados a todos los recursos ─────────────────────

locals {
  prefix = "img-proc-${var.env}"

  tags = {
    Project      = "aws-event-driven-image-processing-platform"
    Architecture = "event-driven-serverless"
    Environment  = var.env
    ManagedBy    = "terraform"
    Owner        = "Alfredo Jose Dominguez Hernandez"
    Repository   = "aws-event-driven-image-processing-platform"
  }
}
