---
name: architecture-design
description: |
  Guide for designing software systems and making architectural decisions.
  Use when asked to design a system, evaluate architecture options, or
  make structural decisions about code organization.
---

# Architecture & Design

## When to use this skill

Use this skill when:

- Designing new systems or major features
- Evaluating architectural options and trade-offs
- Making decisions about code organization and structure
- Reviewing or improving existing architecture

## Design Process

### 1. Understand Requirements

Before designing, clarify:

- What problem are we solving?
- What are the non-functional requirements (scale, latency, availability)?
- What are the constraints (existing systems, team skills, timeline)?
- What will change over time?

### 2. Identify Key Decisions

Architecture is the set of decisions that are hard to change:

- Data storage and schema design
- Service boundaries and communication patterns
- Synchronous vs asynchronous processing
- Stateful vs stateless components

### 3. Evaluate Trade-offs

Every architectural choice has trade-offs:

- Consistency vs availability
- Simplicity vs flexibility
- Performance vs maintainability
- Build vs buy

Document trade-offs explicitly.

### 4. Design for Change

Good architecture accommodates change:

- Separate what changes from what stays the same
- Define clear interfaces between components
- Prefer composition over inheritance
- Make dependencies explicit

## Common Patterns

### Service Architecture

- Microservices: Independent deployment, clear boundaries
- Monolith: Simpler deployment, easier refactoring
- Modular monolith: Boundaries within single deployment

### Data Patterns

- Event sourcing: Full audit trail, complex queries
- CQRS: Separate read and write models
- Repository pattern: Abstract data access

### Communication Patterns

- REST: Synchronous, request-response
- Event-driven: Asynchronous, loose coupling
- gRPC: Efficient, strongly typed

## Architecture Checklist

- [ ] Requirements are clearly understood
- [ ] Key decisions are documented with rationale
- [ ] Trade-offs are explicit
- [ ] Failure modes are considered
- [ ] Scalability requirements are addressed
- [ ] Security implications are reviewed
- [ ] Dependencies are minimal and explicit
