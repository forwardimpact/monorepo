---
name: code-quality-review
description: |
  Guide for reviewing code quality, identifying issues, and suggesting
  improvements. Use when asked to review code, check for best practices,
  or conduct code reviews.
---

# Code Quality & Review

## Stage Guidance

### Plan Stage

**Focus:** Understand code review scope and establish review criteria.
Consider what quality standards apply.


**Activities:**
- Identify code review scope
- Understand applicable standards
- Plan review approach
- Consider risk level

**Ready for Code when:**
- [ ] Review scope is clear
- [ ] Standards are understood
- [ ] Review approach is planned
- [ ] Risk level is assessed

### Code Stage

**Focus:** Write clean, maintainable, tested code. Follow project
conventions and ensure adequate coverage.


**Activities:**
- Write readable, well-structured code
- Add appropriate tests
- Follow project conventions
- Document non-obvious logic

**Ready for Review when:**
- [ ] Code compiles and passes all tests
- [ ] Changes are covered by tests
- [ ] Code follows project conventions
- [ ] No unnecessary complexity

### Review Stage

**Focus:** Verify correctness, maintainability, and adherence to
standards. Ensure no code is shipped that isn't understood.


**Activities:**
- Verify code does what it claims
- Check test coverage
- Review for maintainability
- Confirm style compliance

**Ready for Complete when:**
- [ ] No obvious security vulnerabilities
- [ ] Error handling is appropriate
- [ ] Documentation updated if needed
- [ ] No code you don't fully understand

## Reference

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
