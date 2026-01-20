---
name: full-stack-development
description: |
  Guide for building complete solutions across the full technology stack.
  Use when asked to implement features spanning frontend, backend, database,
  and infrastructure layers.
---

# Full-Stack Development

## Stage Guidance

### Plan Stage

**Focus:** Design the full-stack solution architecture. Define API
contracts and plan layer interactions.


**Activities:**
- Define the API contract first
- Plan frontend and backend responsibilities
- Design database schema
- Plan infrastructure requirements

**Ready for Code when:**
- [ ] API contract is defined
- [ ] Layer responsibilities are clear
- [ ] Database schema is planned
- [ ] Infrastructure approach is decided

### Code Stage

**Focus:** Build vertically—complete one feature end-to-end before
starting another. Validates assumptions early.


**Activities:**
- Implement API endpoints
- Build frontend integration
- Create database schema and queries
- Configure infrastructure as needed
- Test across layers

**Ready for Review when:**
- [ ] Frontend connects to backend correctly
- [ ] Database schema supports the feature
- [ ] Error handling spans all layers
- [ ] Feature works end-to-end
- [ ] Deployment is automated

### Review Stage

**Focus:** Verify integration across layers and ensure deployment
readiness.


**Activities:**
- Test integration across all layers
- Verify error handling end-to-end
- Check deployment configuration
- Review documentation

**Ready for Complete when:**
- [ ] Integration tests pass
- [ ] Deployment verified
- [ ] Documentation is complete
- [ ] Feature is production-ready

## Reference

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
