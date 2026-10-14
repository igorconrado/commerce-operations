terraform {
  required_version = ">= 1.16.0, < 1.17.0"
  required_providers {
    aws = {
      source = "hashicorp/aws", version = "6.69.0"
    }

  }
}
provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project = "commerce-operations", Environment = "demo", ManagedBy = "terraform"
    }
  }
}
variable "region" {
  type    = string
  default = "us-east-1"
}
variable "github_repository" {
  type    = string
  default = "igorconrado/commerce-operations"
}
data "aws_caller_identity" "current" {}
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}
resource "aws_vpc" "demo" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_hostnames = true
}
resource "aws_subnet" "demo" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = "10.42.1.0/24"
  map_public_ip_on_launch = true
}
resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id
}
resource "aws_route_table" "demo" {
  vpc_id = aws_vpc.demo.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.demo.id
  }
}
resource "aws_route_table_association" "demo" {
  subnet_id      = aws_subnet.demo.id
  route_table_id = aws_route_table.demo.id
}
resource "aws_security_group" "demo" {
  name_prefix = "commerce-demo-"
  vpc_id      = aws_vpc.demo.id
  description = "No inbound public services, administration through SSM"
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_iam_role" "host" {
  name_prefix = "commerce-demo-host-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ec2.amazonaws.com"
      }, Action = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.host.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_instance_profile" "host" {
  name_prefix = "commerce-demo-"
  role        = aws_iam_role.host.name
}
resource "aws_ecr_repository" "app" {
  name                 = "commerce-operations-demo"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}
resource "aws_iam_role_policy" "host_pull" {
  role = aws_iam_role.host.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*"
      },
      {
        Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource = aws_ecr_repository.app.arn
      }
    ]
  })
}
resource "aws_instance" "demo" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = "t3.medium"
  subnet_id              = aws_subnet.demo.id
  vpc_security_group_ids = [aws_security_group.demo.id]
  iam_instance_profile   = aws_iam_instance_profile.host.name
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_type = "gp3"
    volume_size = 40
    encrypted   = true
  }
  credit_specification {
    cpu_credits = "standard"
  }
  user_data = <<-EOF
    #!/bin/bash
    set -eu
    dnf install -y docker
    systemctl enable --now docker
    install -d -m 700 /opt/commerce
  EOF
}
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
resource "aws_iam_role" "publisher" {
  name_prefix = "commerce-demo-publisher-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }, Action   = "sts:AssumeRoleWithWebIdentity",
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com", "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:demo"
        }
      }

    }]
  })
}
resource "aws_iam_role_policy" "publisher" {
  role = aws_iam_role.publisher.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [
      {
        Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*"
      },
      {
        Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage"], Resource = aws_ecr_repository.app.arn
      }
    ]
  })
}
output "inventory" {
  value = {
    instance_id = aws_instance.demo.id, vpc_id = aws_vpc.demo.id, subnet_id = aws_subnet.demo.id, repository = aws_ecr_repository.app.repository_url, publisher_role = aws_iam_role.publisher.arn, access = "SSM only, no ingress"
  }
}
