---
name: devops-cicd
description: |
  Guide for building CI/CD pipelines, managing infrastructure as code, and
  implementing deployment best practices. Use when setting up pipelines,
  containerizing applications, or configuring infrastructure.
---

# DevOps & CI/CD

## When to use this skill

Use this skill when:

- Setting up or modifying CI/CD pipelines
- Containerizing applications with Docker
- Managing infrastructure as code
- Troubleshooting deployment failures
- Implementing monitoring and alerting

## CI/CD Pipeline Stages

### Build

- Install dependencies
- Compile/transpile code
- Generate artifacts
- Cache dependencies for speed

### Test

- Run unit tests
- Run integration tests
- Static analysis and linting
- Security scanning

### Deploy

- Deploy to staging environment
- Run smoke tests
- Deploy to production
- Verify deployment health

## Infrastructure as Code

### Terraform

```hcl
# Define resources declaratively
resource "aws_instance" "example" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t2.micro"
}
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "server.js"]
```

## Deployment Strategies

### Rolling Deployment

- Gradual replacement of instances
- Zero downtime
- Easy rollback

### Blue-Green Deployment

- Two identical environments
- Switch traffic atomically
- Fast rollback

### Canary Deployment

- Route small percentage to new version
- Monitor for issues
- Gradually increase traffic

## DevOps Checklist

- [ ] Pipeline runs on every commit
- [ ] Tests run before deployment
- [ ] Deployments are automated
- [ ] Rollback procedure is documented
- [ ] Infrastructure is version controlled
- [ ] Secrets are managed securely
- [ ] Monitoring is in place
- [ ] Alerts are configured
