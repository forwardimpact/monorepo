---
name: pattern-generalization
description: |
  Guide for extracting reusable patterns from specific solutions. Use when
  identifying candidates for generalization, designing abstractions, or
  building platform capabilities from field-validated solutions.
---

# Pattern Generalization

## When to use this skill

Use this skill when:

- Identifying solutions that could benefit other teams
- Extracting reusable components from custom code
- Designing abstractions for common patterns
- Building platform capabilities from field solutions
- Deciding when to generalize vs keep custom

## Generalization Criteria

### When to Generalize

- Pattern appears in 3+ implementations
- Solution has been validated in production
- Multiple teams would benefit
- Core logic is stable and understood
- Customization needs are well-defined

### When to Keep Custom

- Only one team needs it
- Requirements are still evolving
- Context is highly specific
- Generalization cost exceeds benefit
- Speed to market is critical

## Abstraction Design

### Principles

- Solve the common case simply
- Allow escape hatches for edge cases
- Make the right thing easy, wrong thing possible
- Prefer composition over configuration
- Hide complexity, expose simplicity

### Trade-offs

- **Flexibility vs Simplicity**: More options = more complexity
- **Generality vs Performance**: Generic solutions may be slower
- **Reusability vs Fit**: Shared code may not fit any use case perfectly
- **Maintainability vs Features**: More features = more maintenance

## Extraction Process

### 1. Identify the Pattern

- What's common across implementations?
- What varies between uses?
- What are the extension points?
- What are the invariants?

### 2. Design the Interface

- Start with the simplest API that works
- Make common cases one-liners
- Provide sensible defaults
- Document customization options

### 3. Validate in New Context

- Test with a different team/use case
- Gather feedback on API usability
- Identify missing flexibility
- Refine based on real usage

### 4. Document and Publish

- Clear getting-started guide
- Examples for common patterns
- Migration guide from custom solutions
- Support and contribution process

## Generalization Anti-patterns

- **Premature generalization**: Abstracting before understanding
- **Kitchen sink**: Adding every possible feature
- **Leaky abstraction**: Implementation details exposed
- **Configuration overload**: Too many options to understand
- **Orphaned abstraction**: No clear owner or support

## Pattern Generalization Checklist

- [ ] Pattern validated in multiple contexts
- [ ] Clear benefit over custom solutions
- [ ] Simple API for common cases
- [ ] Extension points for customization
- [ ] Documentation and examples ready
- [ ] Migration path from existing solutions
- [ ] Ownership and support defined
