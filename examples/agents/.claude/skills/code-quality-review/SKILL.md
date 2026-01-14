---
name: code-quality-review
description: |
  Guide for reviewing code quality, identifying issues, and suggesting
  improvements. Use when asked to review code, check for best practices,
  or conduct code reviews.
---

# Code Quality & Review

## When to use this skill

Use this skill when:

- Reviewing code for quality issues
- Checking code against best practices
- Conducting or assisting with code reviews
- Verifying AI-generated code before committing

## Review Process

### 1. Correctness First

Before anything else, verify the code does what it claims:

- Does it implement the intended behavior?
- Are there logic errors or off-by-one bugs?
- Does it handle all specified requirements?
- Are error conditions handled appropriately?

### 2. Test Coverage

Check that changes are properly tested:

- Unit tests for new functionality
- Edge cases and error conditions
- Integration tests where appropriate
- Tests are readable and maintainable

### 3. Maintainability

Evaluate long-term code health:

- Clear naming (variables, functions, classes)
- Appropriate abstraction levels
- No unnecessary duplication (DRY)
- Single responsibility principle applied

### 4. Code Style

Verify consistency with project standards:

- Follows project coding conventions
- Consistent formatting and indentation
- Appropriate comments for non-obvious logic
- Documentation updated if needed

## Quality Checklist

- [ ] Code compiles and passes all tests
- [ ] Changes are covered by tests
- [ ] No obvious security vulnerabilities
- [ ] Error handling is appropriate
- [ ] Code follows project conventions
- [ ] No unnecessary complexity
- [ ] Documentation updated if needed
- [ ] No code you don't fully understand
