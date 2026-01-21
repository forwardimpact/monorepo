---
name: technical-debt-management
description: |
  Guide for identifying, prioritizing, and addressing technical debt. Use
  when assessing code quality issues, planning refactoring work, or making
  build vs fix decisions.
---

# Technical Debt Management

## Stage Guidance

### Plan Stage

**Focus:** Assess technical debt and prioritize based on impact and effort.
Decide whether to accept, defer, or address debt.

**Activities:**

- Identify and document technical debt
- Assess impact and effort for each item
- Prioritize using impact/effort matrix
- Decide accept, defer, or address

**Ready for Code when:**

- [ ] Debt is documented with context
- [ ] Impact and effort are assessed
- [ ] Prioritization criteria are clear
- [ ] Decision is documented

### Code Stage

**Focus:** Address debt incrementally while delivering features. Document
intentional debt clearly.

**Activities:**

- Apply Boy Scout Rule (leave code better)
- Refactor while adding features
- Document new intentional debt
- Track debt in backlog

**Ready for Review when:**

- [ ] Debt work is visible in planning
- [ ] New debt is intentional and documented
- [ ] Code quality improved where touched
- [ ] Technical debt backlog updated

### Review Stage

**Focus:** Validate debt reduction and ensure new debt is intentional and
documented.

**Activities:**

- Review debt reduction progress
- Verify new debt is documented
- Check debt backlog currency
- Assess overall technical health

**Ready for Complete when:**

- [ ] Debt reduction validated
- [ ] New debt justified and documented
- [ ] Backlog is current
- [ ] Metrics track debt trends

## Reference

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
