---
name: cloud-platforms
description: |
  Guide for working with cloud infrastructure and services. Use when
  deploying to cloud, selecting cloud services, configuring infrastructure,
  or solving cloud-specific challenges.
---

# Cloud Platforms

## When to use this skill

Use this skill when:

- Deploying applications to cloud environments
- Selecting appropriate cloud services
- Configuring cloud infrastructure
- Optimizing cloud costs and performance
- Implementing cloud security best practices

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

## Cloud Checklist

- [ ] Service selection matches requirements
- [ ] Multi-AZ deployment for availability
- [ ] Security groups properly configured
- [ ] IAM follows least privilege
- [ ] Data encrypted at rest and in transit
- [ ] Monitoring and alerting in place
- [ ] Cost controls established
- [ ] Infrastructure defined as code
