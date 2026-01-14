---
name: data-modeling
description: |
  Guide for designing database schemas, data structures, and data
  architectures. Use when designing tables, optimizing queries, or
  making decisions about data storage technologies.
---

# Data Modeling

## When to use this skill

Use this skill when:

- Designing database schemas
- Optimizing query performance
- Choosing storage technologies
- Planning schema migrations
- Balancing normalization with performance

## Schema Design

### Normalization

- **1NF**: Atomic values, no repeating groups
- **2NF**: No partial dependencies
- **3NF**: No transitive dependencies
- Normalize first, then denormalize strategically

### Denormalization Trade-offs

- Improves read performance
- Complicates writes and updates
- Risk of data inconsistency
- Use for read-heavy workloads

## Data Store Selection

### Relational (SQL)

- Strong consistency requirements
- Complex queries and joins
- ACID transactions needed
- Well-defined schema

### Document (NoSQL)

- Flexible, evolving schemas
- Hierarchical data
- Horizontal scaling priority
- Read-heavy workloads

### Key-Value

- Simple lookup patterns
- Extreme performance needs
- Caching layer
- Session storage

### Time Series

- Temporal data patterns
- High write throughput
- Time-based queries
- Sensor and metrics data

## Indexing Strategy

### When to Index

- Columns in WHERE clauses
- Join columns
- ORDER BY columns
- High-cardinality columns

### Index Trade-offs

- Faster reads, slower writes
- Storage overhead
- Maintenance cost
- Query planner complexity

## Schema Migrations

### Safe Migration Practices

- Make changes backward compatible
- Add columns before using them
- Migrate data before dropping columns
- Test migrations on production-like data

## Data Modeling Checklist

- [ ] Requirements understood
- [ ] Appropriate storage technology selected
- [ ] Schema normalized appropriately
- [ ] Indexes support query patterns
- [ ] Migration plan is safe
- [ ] Backward compatibility maintained
