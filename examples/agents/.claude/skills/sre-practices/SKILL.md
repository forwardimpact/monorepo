---
name: sre-practices
description: |
  Guide for ensuring system reliability through observability, incident
  response, and capacity planning. Use when designing monitoring, handling
  incidents, setting SLOs, or improving system resilience.
---

# Site Reliability Engineering

## When to use this skill

Use this skill when:

- Designing monitoring and alerting
- Defining SLIs, SLOs, and error budgets
- Handling or preparing for incidents
- Conducting post-mortems
- Planning for capacity and resilience

## Service Level Concepts

### SLI (Service Level Indicator)

Quantitative measure of service behavior:

- Request latency (p50, p95, p99)
- Error rate (% of failed requests)
- Availability (% of successful requests)
- Throughput (requests per second)

### SLO (Service Level Objective)

Target value for an SLI:

- "99.9% of requests complete in < 200ms"
- "Error rate < 0.1% over 30 days"
- "99.95% availability monthly"

### Error Budget

Allowed unreliability: 100% - SLO

- 99.9% SLO = 0.1% error budget
- ~43 minutes downtime per month
- Spend on features or reliability

## Observability

### Three Pillars

- **Metrics**: Aggregated numeric data (counters, gauges, histograms)
- **Logs**: Discrete event records with context
- **Traces**: Request flow across services

### Alerting Principles

- Alert on symptoms, not causes
- Every alert should be actionable
- Reduce noise ruthlessly
- Page only for user-impacting issues
- Use severity levels appropriately

## Incident Response

### Incident Lifecycle

1. **Detection**: Automated alerts or user reports
2. **Triage**: Assess severity and impact
3. **Mitigation**: Stop the bleeding first
4. **Resolution**: Fix the underlying issue
5. **Post-mortem**: Learn and improve

### During an Incident

- Communicate early and often
- Focus on mitigation before root cause
- Document actions in real-time
- Escalate when needed
- Update stakeholders regularly

## Post-Mortem Process

### Blameless Culture

- Focus on systems, not individuals
- Assume good intentions
- Ask "how did the system allow this?"
- Share findings openly

### Post-Mortem Template

1. Incident summary
2. Timeline of events
3. Root cause analysis
4. What went well
5. What could be improved
6. Action items with owners

## Resilience Patterns

- **Timeouts**: Don't wait forever
- **Retries**: With exponential backoff
- **Circuit breakers**: Fail fast when downstream is unhealthy
- **Bulkheads**: Isolate failures
- **Graceful degradation**: Partial functionality over total failure

## SRE Checklist

- [ ] SLIs defined for key user journeys
- [ ] SLOs set with stakeholder agreement
- [ ] Error budget tracking in place
- [ ] Alerts are actionable and low-noise
- [ ] Runbooks exist for common issues
- [ ] Incident response process documented
- [ ] Post-mortem culture established
- [ ] Resilience patterns implemented
