---
name: developer-experience
description: |
  Guide for improving developer experience and creating self-service
  platforms. Use when designing golden paths, creating getting-started
  guides, reducing developer friction, or building internal platforms.
---

# Developer Experience

## When to use this skill

Use this skill when:

- Designing developer onboarding experiences
- Creating golden paths for common workflows
- Building self-service platform capabilities
- Reducing friction in developer workflows
- Writing getting-started documentation

## Golden Path Design

### Principles

- Opinionated but not restrictive
- Works out of the box with minimal configuration
- Covers 80% of use cases well
- Easy to discover, hard to miss

### Components

- **Templates**: Starter projects with best practices
- **CLI tools**: Automate common tasks
- **Documentation**: Clear, task-focused guides
- **Examples**: Working code for common patterns

## Friction Log Process

### Observation

1. Shadow developers doing real tasks
2. Note every hesitation, confusion, or workaround
3. Time how long each step takes
4. Record what documentation they consult

### Analysis

- Categorize friction points (tooling, docs, process)
- Identify patterns across multiple observations
- Prioritize by frequency × severity
- Distinguish symptoms from root causes

### Action

- Quick wins: Fix in days, high impact
- Medium-term: Requires design, weeks
- Strategic: Platform changes, months

## Self-Service Design

### Day 1 Experience

- New developer can deploy in < 1 hour
- No tickets or approvals needed
- Immediate feedback on success/failure
- Clear next steps after initial success

### Day 50 Experience

- Common tasks are still easy
- Edge cases are documented
- Escape hatches exist for advanced needs
- Platform grows with team needs

## Documentation Standards

### Getting Started Guides

- Prerequisites clearly listed
- Copy-paste commands that work
- Expected output shown
- Troubleshooting for common issues

### Reference Documentation

- Complete API coverage
- Examples for every feature
- Search-friendly structure
- Kept in sync with code

## DX Checklist

- [ ] New developer can get started without help
- [ ] Golden path covers common use cases
- [ ] Friction points are documented and prioritized
- [ ] Self-service for common operations
- [ ] Documentation is discoverable and accurate
- [ ] Feedback mechanisms exist
- [ ] Metrics track developer productivity
