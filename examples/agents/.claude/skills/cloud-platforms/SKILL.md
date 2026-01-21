---
name: cloud-platforms
description: |
  Guide for working with cloud infrastructure and services. Use when
  deploying to cloud, selecting cloud services, configuring infrastructure,
  or solving cloud-specific challenges.
---

# Cloud Platforms

## Stage Guidance

### Plan Stage

**Focus:** Select appropriate cloud services and design for availability,
security, and cost efficiency.

**Activities:**

- Identify service requirements
- Select appropriate cloud services
- Plan for high availability
- Consider security and cost

**Ready for Code when:**

- [ ] Service selection matches requirements
- [ ] Availability approach planned
- [ ] Security model defined
- [ ] Cost controls considered

### Code Stage

**Focus:** Implement cloud infrastructure with security best practices. Use
infrastructure as code for reproducibility.

**Activities:**

- Define infrastructure as code
- Configure security groups and IAM
- Set up monitoring and alerting
- Implement deployment automation

**Ready for Review when:**

- [ ] Multi-AZ deployment for availability
- [ ] Security groups properly configured
- [ ] IAM follows least privilege
- [ ] Data encrypted at rest and in transit
- [ ] Infrastructure defined as code

### Review Stage

**Focus:** Validate security, availability, and operational readiness. Ensure
cost controls are in place.

**Activities:**

- Verify security configuration
- Test availability and failover
- Review cost projections
- Validate monitoring coverage

**Ready for Complete when:**

- [ ] Security review completed
- [ ] Monitoring and alerting in place
- [ ] Cost controls established
- [ ] Operational runbooks exist

## Reference

## Service Categories

### Compute

- **VMs/EC2**: Full control, any workload
- **Containers/ECS/GKE**: Portable, scalable applications
- **Serverless/Lambda**: Event-driven, pay-per-use
- **Kubernetes**: Container orchestration at scale

### Storage

- **Object Storage (S3/GCS)**: Unstructured data, backups, static assets
- **Block Storage (EBS)**: VM disks, databases
- **File Storage (EFS)**: Shared file systems
- **Archive (Glacier)**: Long-term, infrequent access

### Databases

- **Managed SQL (RDS/Cloud SQL)**: Relational, ACID transactions
- **NoSQL (DynamoDB/Firestore)**: Flexible schema, high scale
- **Cache (ElastiCache/Memorystore)**: Low-latency data access
- **Data Warehouse (Redshift/BigQuery)**: Analytics at scale

### Messaging

- **Queues (SQS/Cloud Tasks)**: Decoupled processing
- **Pub/Sub (SNS/Cloud Pub/Sub)**: Event distribution
- **Streaming (Kinesis/Dataflow)**: Real-time data processing

## Cloud-Native Design

### Principles

- Design for failure (everything fails eventually)
- Use managed services when possible
- Automate everything (infrastructure as code)
- Monitor and alert on all services

### High Availability

- Deploy across multiple availability zones
- Use load balancers for traffic distribution
- Implement health checks and auto-healing
- Design for graceful degradation

### Security

- Principle of least privilege for IAM
- Encrypt data at rest and in transit
- Use security groups and network policies
- Rotate credentials regularly

## Cost Optimization

- Right-size instances based on actual usage
- Use reserved instances for predictable workloads
- Leverage spot/preemptible instances for fault-tolerant work
- Set up billing alerts and budgets
- Delete unused resources
