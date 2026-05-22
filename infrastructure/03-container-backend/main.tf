terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }

  required_version = ">= 1.4.0"
}

provider "aws" {
  region  = "us-east-1"
  profile = "leader-developer-personal"
}

#################################################
# VARIABLES
#################################################

variable "env" {
  type    = string
  default = "dev"
}

variable "ssh_allowed_cidr" {
  type        = string
  description = "CIDR autorizado para SSH. Restringe a tu IP: '203.0.113.10/32'"
  default     = "0.0.0.0/0"
}

variable "app_port" {
  type        = number
  description = "Puerto en el que escucha el contenedor Node.js"
  default     = 3000
}

variable "domain" {
  type        = string
  description = "Subdominio completo para la API (p.ej. content-distribution.alfredo-dominguez.dev)"
}

#################################################
# DATA SOURCES
#################################################

# Última AMI de Amazon Linux 2023 — arquitectura arm64 para t4g.micro (Free Tier actual)
data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }
}

#################################################
# VPC (mínima: 1 subnet pública con salida a internet)
#################################################

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = { Name = "vpc-backend-${var.env}", Env = var.env }
}

resource "aws_internet_gateway" "igw" {
  vpc_id = aws_vpc.main.id

  tags = { Name = "igw-backend-${var.env}", Env = var.env }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "us-east-1a" # t4g.micro no está disponible en us-east-1e
  map_public_ip_on_launch = true

  tags = { Name = "subnet-public-backend-${var.env}", Env = var.env }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }

  tags = { Name = "rt-public-backend-${var.env}", Env = var.env }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

#################################################
# SECURITY GROUP
#################################################

resource "aws_security_group" "ec2_sg" {
  name        = "ec2-backend-${var.env}-sg"
  description = "Permite SSH (22) y HTTP (80) hacia la instancia EC2"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  ingress {
    description = "HTTP (y validacion ACME de Lets Encrypt)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Salida libre (Docker pull, paquetes, etc.)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "ec2-backend-${var.env}-sg"
    Env  = var.env
  }
}

#################################################
# KEY PAIR (generado por Terraform, no se sube ninguna clave manual)
#################################################

resource "tls_private_key" "ec2_key" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "deployer" {
  key_name   = "ec2-backend-${var.env}-key"
  public_key = tls_private_key.ec2_key.public_key_openssh

  tags = {
    Name = "ec2-backend-${var.env}-key"
    Env  = var.env
  }
}

# Guarda la clave privada en disco para SSH y para el secreto EC2_SSH_KEY de GitHub Actions
resource "local_file" "private_key_pem" {
  content         = tls_private_key.ec2_key.private_key_openssh
  filename        = "${path.module}/ec2-backend-${var.env}.pem"
  file_permission = "0600"
}

#################################################
# EC2 INSTANCE
#################################################

resource "aws_instance" "backend" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t4g.micro" # Free Tier actual (cuentas 2024+): Graviton2 ARM64
  key_name               = aws_key_pair.deployer.key_name
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
  subnet_id              = aws_subnet.public.id

  # templatefile sustituye ${app_port}; las variables $nginx_var pasan sin cambios
  user_data = templatefile("${path.module}/user_data.sh", {
    app_port = var.app_port
    domain   = var.domain
  })

  # Recrear instancia si cambia el script de arranque
  user_data_replace_on_change = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 30 # mínimo requerido por la AMI de Amazon Linux 2023
    encrypted   = true
  }

  tags = {
    Name = "ec2-backend-${var.env}"
    Env  = var.env
  }
}

#################################################
# ELASTIC IP
#################################################

resource "aws_eip" "backend_eip" {
  instance = aws_instance.backend.id
  domain   = "vpc"

  tags = {
    Name = "ec2-backend-${var.env}-eip"
    Env  = var.env
  }
}

#################################################
# OUTPUTS
#################################################

output "instance_id" {
  description = "ID de la instancia EC2"
  value       = aws_instance.backend.id
}

output "elastic_ip" {
  description = "IP pública estática (úsala en el secreto EC2_HOST de GitHub Actions)"
  value       = aws_eip.backend_eip.public_ip
}

output "ssh_command" {
  description = "Comando para conectarse por SSH"
  value       = "ssh -i ~/.ssh/id_rsa ec2-user@${aws_eip.backend_eip.public_ip}"
}

output "api_url" {
  description = "URL raíz de la API REST"
  value       = "http://${aws_eip.backend_eip.public_ip}/api/v1"
}

output "ami_id" {
  description = "AMI de Amazon Linux 2023 utilizada"
  value       = data.aws_ami.al2023.id
}
