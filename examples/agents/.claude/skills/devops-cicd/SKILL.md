---
name: devops-cicd
description: |
  Guide for building CI/CD pipelines, managing infrastructure as code, and
  implementing deployment best practices. Use when setting up pipelines,
  containerizing applications, or configuring infrastructure.
---

# DevOps & CI/CD

## Stage Guidance

### Plan Stage

**Focus:** Plan CI/CD pipeline architecture and infrastructure requirements.
Consider deployment strategies and monitoring needs.

**Activities:**

- Define pipeline stages (build, test, deploy)
- Identify infrastructure requirements
- Plan deployment strategy (rolling, blue-green, canary)
- Consider monitoring and alerting needs
- Plan secret management approach

**Ready for Code when:**

- [ ] Pipeline architecture is documented
- [ ] Deployment strategy is chosen and justified
- [ ] Infrastructure requirements are identified
- [ ] Monitoring approach is defined

### Code Stage

**Focus:** Implement CI/CD pipelines and infrastructure as code. Follow best
practices for containerization and deployment automation.

**Activities:**

- Configure CI/CD pipeline stages
- Implement infrastructure as code (Terraform, CloudFormation)
- Create Dockerfiles with security best practices
- Set up monitoring and alerting
- Configure secret management
- Implement deployment automation

**Ready for Review when:**

- [ ] Pipeline runs on every commit
- [ ] Tests run before deployment
- [ ] Deployments are automated
- [ ] Infrastructure is version controlled
- [ ] Secrets are managed securely
- [ ] Monitoring is in place

### Review Stage

**Focus:** Verify pipeline reliability, security, and operational readiness.
Ensure rollback procedures work and documentation is complete.

**Activities:**

- Verify pipeline runs successfully end-to-end
- Test rollback procedures
- Review security configurations
- Validate monitoring and alerts
- Check documentation completeness

**Ready for Complete when:**

- [ ] Pipeline is tested and reliable
- [ ] Rollback procedure is documented and tested
- [ ] Alerts are configured and tested
- [ ] Runbooks exist for common issues

## Reference

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
