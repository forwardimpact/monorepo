---
name: full-stack-development
description: |
  Guide for building complete solutions across the full technology stack.
  Use when asked to implement features spanning frontend, backend, database,
  and infrastructure layers.
---

# Full-Stack Development

## When to use this skill

Use this skill when:

- Building features that span multiple layers
- Implementing end-to-end functionality
- Working across frontend, backend, and infrastructure
- Debugging issues that cross layer boundaries

## Technology Stack

### Primary Languages

- **JavaScript/TypeScript**: Frontend and Node.js backend
- **Python**: Backend APIs and data processing

### Infrastructure

- **Terraform**: Cloud infrastructure as code
- **CloudFormation**: AWS-specific infrastructure
- **Docker**: Containerization

## Layer Responsibilities

### Frontend

- User interface and experience
- Client-side validation
- API integration
- State management

### Backend API

- Business logic
- Data validation
- Authentication/authorization
- External service integration

### Database

- Data persistence
- Query optimization
- Schema migrations
- Data integrity

### Infrastructure

- Deployment pipelines
- Environment configuration
- Scaling and reliability
- Monitoring and logging

## Development Process

### 1. Start with the Interface

- Define the API contract first
- Frontend and backend can work in parallel
- Clear interface = fewer integration issues

### 2. Build Vertically

- Complete one feature end-to-end before starting another
- Validates assumptions early
- Delivers demonstrable progress

### 3. Test Across Layers

- Unit tests per layer
- Integration tests across layers
- End-to-end tests for critical paths

## Full-Stack Checklist

- [ ] API contract is defined
- [ ] Frontend connects to backend correctly
- [ ] Database schema supports the feature
- [ ] Error handling spans all layers
- [ ] Feature works end-to-end
- [ ] Deployment is automated
