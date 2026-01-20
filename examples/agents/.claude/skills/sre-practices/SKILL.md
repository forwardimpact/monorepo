---
name: sre-practices
description: |
  Guide for ensuring system reliability through observability, incident
  response, and capacity planning. Use when designing monitoring, handling
  incidents, setting SLOs, or improving system resilience.
---

# Site Reliability Engineering

## Stage Guidance

### Plan Stage

**Focus:** Define reliability requirements, SLIs/SLOs, and observability
strategy. Plan for resilience and capacity needs.


**Activities:**
- Define SLIs for key user journeys
- Set SLOs with stakeholder agreement
- Plan observability strategy (metrics, logs, traces)
- Identify failure modes and resilience patterns
- Define alerting thresholds

**Ready for Code when:**
- [ ] SLIs defined for key user journeys
- [ ] SLOs set with stakeholder agreement
- [ ] Monitoring strategy is planned
- [ ] Failure modes are identified
- [ ] Alerting thresholds are defined

### Code Stage

**Focus:** Implement observability, resilience patterns, and operational
tooling. Build systems that fail gracefully and recover quickly.


**Activities:**
- Implement metrics, logging, and tracing
- Configure alerts based on SLOs
- Implement resilience patterns (timeouts, retries, circuit breakers)
- Create runbooks for common issues
- Set up error budget tracking

**Ready for Review when:**
- [ ] Comprehensive monitoring is in place
- [ ] Alerts are actionable and low-noise
- [ ] Resilience patterns are implemented
- [ ] Runbooks exist for common issues
- [ ] Error budget tracking is in place

### Review Stage

**Focus:** Verify reliability implementation meets SLOs and operational
readiness. Ensure incident response procedures are in place.


**Activities:**
- Validate SLOs are measurable
- Test failure scenarios
- Review runbook completeness
- Verify incident response procedures
- Check alert quality and coverage

**Ready for Complete when:**
- [ ] SLOs are measurable and validated
- [ ] Failure scenarios are tested
- [ ] Incident response process documented
- [ ] Post-mortem culture established
- [ ] Disaster recovery approach is tested

## Reference

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
