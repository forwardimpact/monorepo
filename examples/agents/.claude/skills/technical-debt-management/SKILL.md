---
name: technical-debt-management
description: |
  Guide for identifying, prioritizing, and addressing technical debt. Use
  when assessing code quality issues, planning refactoring work, or making
  build vs fix decisions.
---

# Technical Debt Management

## When to use this skill

Use this skill when:

- Identifying technical debt in codebases
- Prioritizing debt for remediation
- Deciding whether to take on new debt
- Planning refactoring initiatives
- Balancing debt work with feature delivery

## Types of Technical Debt

### Code Debt

- Duplicated code (DRY violations)
- Complex, hard-to-understand code
- Missing or inadequate tests
- Inconsistent coding patterns
- Dead or unused code

### Architecture Debt

- Tight coupling between components
- Missing abstractions
- Inappropriate technology choices
- Scalability limitations
- Security vulnerabilities

### Dependency Debt

- Outdated libraries and frameworks
- Unsupported dependencies
- Version conflicts
- License compliance issues

### Documentation Debt

- Missing or outdated docs
- Undocumented APIs
- Tribal knowledge not captured
- Stale comments in code

## Debt Assessment

### Impact Dimensions

- **Velocity**: How much does it slow development?
- **Risk**: What could go wrong?
- **Scope**: How much code is affected?
- **Effort**: How hard is it to fix?

### Prioritization Matrix

| Impact | Effort | Priority       |
| ------ | ------ | -------------- |
| High   | Low    | Do first       |
| High   | High   | Plan carefully |
| Low    | Low    | Quick wins     |
| Low    | High   | Defer          |

## Strategic Debt Decisions

### When to Accept Debt

- Time-to-market is critical
- Requirements are uncertain
- Short-lived code (prototypes, experiments)
- Clear plan to address later
- Business value justifies risk

### When to Avoid Debt

- Core system components
- Security-sensitive code
- High-change-frequency areas
- No plan to address later
- Debt compounds existing issues

## Debt Reduction Strategies

### Incremental Improvement

- Boy Scout Rule: Leave code better than you found it
- Refactor while adding features
- Small, continuous improvements
- Low risk, steady progress

### Dedicated Investment

- Scheduled refactoring sprints
- Tech debt percentage in each sprint
- Major rewrites when justified
- Higher risk, larger improvements

## Documentation Template

For each debt item:

- **Description**: What is the debt?
- **Impact**: How does it affect us?
- **Effort**: How hard to fix (T-shirt size)?
- **Owner**: Who can address it?
- **Plan**: When/how will it be fixed?

## Technical Debt Checklist

- [ ] Debt is documented with context
- [ ] Impact and effort are assessed
- [ ] Prioritization criteria are clear
- [ ] Debt work is visible in planning
- [ ] New debt is intentional and documented
- [ ] Regular reviews of debt backlog
- [ ] Metrics track debt trends
