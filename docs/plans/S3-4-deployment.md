# S3-4: Production Deployment Setup

## Overview

This document outlines the production-ready deployment configurations for the Chai omnichannel AI platform, covering staging and production environments with high availability, monitoring, and automated deployment procedures.

## Prerequisites

### Infrastructure Requirements

- **Docker**: Version 20.10+ with Docker Compose v2+
- **Container Registry**: GitHub Container Registry (ghcr.io) or equivalent
- **Server Resources**:
  - Staging: 16 CPU cores, 32GB RAM, 500GB SSD
  - Production: 32 CPU cores, 64GB RAM, 1TB SSD
- **Network**: Public IP with DNS configured for:
  - `staging.chai.example.com`
  - `chai.example.com`
  - `portal.chai.example.com`
  - `grafana.chai.example.com`

### Software Requirements

- Node.js `>=24.12 <25` (see root `package.json` `engines`) and pnpm 11.13.1
- PostgreSQL 17.6+
- Redis 7.4+
- TLS certificates (Let's Encrypt or commercial)

### Access Requirements

- Docker registry authentication
- Server SSH access with deployment user
- Database credentials
- Connector credentials for any non-mock providers (WhatsApp Meta, Midtrans, JNE, OpenAI/Anthropic, Google Calendar)

## Architecture Overview

### Staging Environment

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (1 replica)                     │
│              Load Balancer + Reverse Proxy               │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────┼────────────────┐
    │            │                │
    ▼            ▼                ▼
┌────────┐  ┌──────────┐    ┌──────────┐
│  API   │  │  Owner   │    │  Client  │
│(3 reps)│  │ Console  │    │  Portal  │
└────┬───┘  │(2 reps)  │    │ (2 reps) │
     │      └──────────┘    └──────────┘
     │
     ├──────────────────────────────────┐
     │                                  │
     ▼                                  ▼
┌─────────────┐              ┌─────────────────┐
│  Workers    │              │   PostgreSQL    │
│ (8 types)   │              │   (1 instance)  │
└─────────────┘              └─────────────────┘
     │
     ▼
┌─────────────┐
│    Redis    │
│ (1 instance)│
└─────────────┘
```

**Services**:
- API: 3 replicas
- Realtime Gateway: 2 replicas
- Workers: 2 replicas each (channel, automation, payment, logistics)
- Frontend: 2 replicas each (owner-console, client-portal)
- PostgreSQL: 1 instance
- Redis: 1 instance
- Nginx: 1 replica (public edge — fixed host ports 80/443)

### Production Environment

```
┌─────────────────────────────────────────────────────────┐
│                    Nginx (1 replica)                     │
│              Load Balancer + TLS Termination             │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────┼────────────────┐
    │            │                │
    ▼            ▼                ▼
┌────────┐  ┌──────────┐    ┌──────────┐
│  API   │  │  Owner   │    │  Client  │
│(5 reps)│  │ Console  │    │  Portal  │
└────┬───┘  │(3 reps)  │    │ (3 reps) │
     │      └──────────┘    └──────────┘
     │
     ├──────────────────────────────────┐
     │                                  │
     ▼                                  ▼
┌─────────────┐              ┌─────────────────┐
│  Workers    │              │   PostgreSQL    │
│ (8 types)   │              │   (1 instance)  │
└─────────────┘              └─────────────────┘
     │                                  │
     ▼                                  ▼
┌─────────────┐              ┌─────────────────┐
│Redis Master │              │Redis Sentinel   │
│ + Sentinel  │              │  (3 instances)  │
└─────────────┘              └─────────────────┘

┌─────────────────────────────────────────────┐
│         Monitoring Stack                     │
│  Prometheus + Grafana + OpenTelemetry       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         Log Aggregation (ELK)               │
│  Elasticsearch + Logstash + Kibana          │
└─────────────────────────────────────────────┘
```

**Services**:
- API: 5 replicas
- Realtime Gateway: 3 replicas
- Workers: 2-3 replicas each
- Frontend: 3 replicas each
- PostgreSQL: 1 instance (tuned for production)
- Redis: 1 master + 3 sentinels (HA)
- Nginx: 1 replica (public edge — publishes fixed host ports 80/443, so it cannot be replicated on a single Compose node)
- Prometheus: 1 instance
- Grafana: 1 instance
- OpenTelemetry Collector: 1 instance
- Elasticsearch: 1 instance
- Logstash: 1 instance
- Kibana: 1 instance

## Environment Comparison

| Aspect | Staging | Production |
|--------|---------|------------|
| **API Replicas** | 3 | 5 |
| **Worker Replicas** | 1-2 | 2-3 |
| **Frontend Replicas** | 2 | 3 |
| **Redis HA** | No | Yes (Sentinel) |
| **TLS** | Optional | Required |
| **Monitoring** | Basic | Full stack |
| **Log Aggregation** | No | ELK stack |
| **Database Tuning** | Default | Production-tuned |
| **Rate Limiting** | Moderate | Strict |
| **Backup Strategy** | Manual | Automated |
| **Deployment** | Direct | Rolling update |

## Staging Deployment Steps

### 1. Initial Setup

```bash
# Clone repository
git clone https://github.com/chai-platform/chai.git
cd chai

# Copy environment configuration
cp infra/staging/.env.example infra/staging/.env

# Edit .env with actual values
nano infra/staging/.env
```

**Required variables**:
- `POSTGRES_PASSWORD`: Strong random password
- `REDIS_PASSWORD`: Strong random password
- `AUTH_TOKEN_SECRET`: shared token-signing secret, **minimum 32 characters**.
  `apps/api` and `apps/realtime-gateway` throw at startup in production if it is
  unset or shorter (`apps/api/src/auth/token-config.ts`); use the same value
  across api, realtime-gateway, and client-portal.
- Connector credentials only for providers you switch off mock (see `PROVIDER_*`
  in `.env.example`); every connector defaults to a safe mock.

### 2. Deploy to Staging

```bash
# Make deploy script executable
chmod +x scripts/staging/deploy.sh

# Run deployment
./scripts/staging/deploy.sh --tag v1.0.0

# Or with auto-generated tag (git SHA)
./scripts/staging/deploy.sh
```

**Deployment process**:
1. Install dependencies (`pnpm install`)
2. Build all packages (`pnpm turbo build`)
3. Build Docker images
4. Tag images with version
5. Push to container registry
6. Deploy services with Docker Compose
7. Wait for health checks
8. Verify endpoints

### 3. Verify Deployment

```bash
# Check service status
docker compose -f infra/staging/docker-compose.yml ps

# View logs
docker compose -f infra/staging/docker-compose.yml logs -f api

# Test health endpoints
curl http://localhost/health
curl http://localhost/api/health

# Run smoke tests (if available)
pnpm test:e2e --environment=staging
```

### 4. Seed Test Data (Optional)

```bash
./scripts/staging/deploy.sh --seed
```

## Production Deployment Steps

### 1. Initial Setup

```bash
# Copy environment configuration
cp infra/production/.env.example infra/production/.env

# Edit .env with production values
nano infra/production/.env
```

**Critical security notes**:
- Use a secrets manager (AWS Secrets Manager, HashiCorp Vault) in production
- Never commit `.env` files to version control
- Rotate secrets regularly
- Use strong, unique passwords (minimum 32 characters)

### 2. Prepare TLS Certificates

```bash
# Create SSL directory
mkdir -p infra/production/ssl

# Copy certificates
cp /path/to/cert.pem infra/production/ssl/cert.pem
cp /path/to/key.pem infra/production/ssl/key.pem

# Set permissions
chmod 600 infra/production/ssl/*.pem
```

### 3. Deploy to Production

```bash
# Make deploy script executable
chmod +x scripts/production/deploy.sh

# Run deployment with rolling update
./scripts/production/deploy.sh --tag v1.0.0
```

**Deployment process**:
1. Pre-flight checks
2. Build packages
3. Build and tag Docker images
4. Push to registry
5. **Database backup** (automatic)
6. **Database migrations** (if needed)
7. Rolling restart of services
8. Health verification
9. Save deployment state (for rollback)

### 4. Post-Deployment Verification

```bash
# Check all services
docker compose -f infra/production/docker-compose.yml ps

# Verify health endpoints
curl https://chai.example.com/health
curl https://chai.example.com/api/health

# Check monitoring
open https://grafana.chai.example.com

# Review logs
docker compose -f infra/production/docker-compose.yml logs -f api

# Verify database migrations. They are applied by the one-shot `migrate` service
# (`pnpm --filter @chai/database run migrate`) BEFORE api/workers start and
# recorded in the ledger from migration 0048_schema_migration_ledger.sql. There
# is no `db:migrate:status` script — inspect the migrate service instead:
docker compose -f infra/production/docker-compose.yml logs migrate
```

### 5. Configure Monitoring

```bash
# Access Grafana
open https://grafana.chai.example.com
# Default credentials: admin / (from .env GRAFANA_ADMIN_PASSWORD)

# Import dashboards
# - infra/monitoring/dashboards/*.json

# Configure alerts
# - infra/monitoring/alerts.yml
```

## Rollback Procedure

### Automatic Rollback

If deployment fails health checks:

```bash
# Rollback to previous version
./scripts/production/deploy.sh --rollback
```

### Manual Rollback

```bash
# Find previous deployment tag
cat .deployment-state

# Deploy specific version
./scripts/production/deploy.sh --tag <previous-tag> --skip-build --skip-migrate
```

### Database Rollback

If migrations need to be reverted:

```bash
# Restore from backup
docker compose -f infra/production/docker-compose.yml exec -T postgres psql -U chai_admin chai < /tmp/chai-backup-YYYYMMDD-HHMMSS.sql

# The raw-SQL migrations are forward-only — there is no `db:migrate:down`.
# Roll back schema changes by restoring the pre-deploy backup taken above.
```

## Troubleshooting Guide

### Services Not Starting

**Symptom**: Services stuck in "starting" state

**Diagnosis**:
```bash
# Check service logs
docker compose -f infra/production/docker-compose.yml logs <service-name>

# Check resource usage
docker stats

# Verify dependencies
docker compose -f infra/production/docker-compose.yml ps
```

**Common causes**:
- Database not ready: Increase `start_period` in healthcheck
- Redis connection failed: Check `REDIS_URL` format
- Port conflicts: Verify port mappings in `.env`

### Database Connection Issues

**Symptom**: API returns 500 errors, database connection timeouts

**Diagnosis**:
```bash
# Test database connection
docker compose -f infra/production/docker-compose.yml exec postgres pg_isready -U chai_admin -d chai

# Inspect active connections (there is no `db:pool:status` script)
docker compose -f infra/production/docker-compose.yml exec postgres \
  psql -U chai_admin -d chai -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Review PostgreSQL logs
docker compose -f infra/production/docker-compose.yml logs postgres
```

**Solutions**:
- Increase `POSTGRES_MAX_CONNECTIONS` in `.env`
- Tune `shared_buffers` and `work_mem` in `postgres.conf`
- Check for connection leaks in application code

### High Memory Usage

**Symptom**: OOM kills, container restarts

**Diagnosis**:
```bash
# Check memory usage
docker stats

# Review resource limits
docker compose -f infra/production/docker-compose.yml config | grep -A 5 resources
```

**Solutions**:
- Increase memory limits in `docker-compose.yml`
- Reduce worker concurrency
- Optimize database queries
- Add more replicas to distribute load

### Redis Failover Issues

**Symptom**: Redis master down, sentinels not promoting replica

**Diagnosis**:
```bash
# Check sentinel status
docker compose -f infra/production/docker-compose.yml exec redis-sentinel redis-cli -p 26379 sentinel masters

# Review sentinel logs
docker compose -f infra/production/docker-compose.yml logs redis-sentinel
```

**Solutions**:
- Verify quorum setting (should be 2 for 3 sentinels)
- Check network connectivity between sentinels
- Review `down-after-milliseconds` timeout

### Nginx 502 Bad Gateway

**Symptom**: Nginx returns 502 errors

**Diagnosis**:
```bash
# Check upstream health
docker compose -f infra/production/docker-compose.yml exec nginx nginx -t

# Review nginx logs
docker compose -f infra/production/docker-compose.yml logs nginx

# Verify backend services
curl http://api:3000/health
```

**Solutions**:
- Ensure backend services are running
- Check upstream configuration in `nginx.conf`
- Increase `proxy_read_timeout` for slow endpoints

### Monitoring Stack Issues

**Symptom**: Prometheus not scraping metrics, Grafana dashboards empty

**Diagnosis**:
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Review Prometheus logs
docker compose -f infra/production/docker-compose.yml logs prometheus

# Verify service metrics endpoints
curl http://api:9090/metrics
```

**Solutions**:
- Ensure `ENABLE_METRICS=true` in `.env`
- Check Prometheus scrape configuration
- Verify network connectivity between Prometheus and services

## Maintenance Procedures

### Database Maintenance

```bash
# Vacuum analyze (run weekly)
docker compose -f infra/production/docker-compose.yml exec postgres psql -U chai_admin chai -c "VACUUM ANALYZE;"

# Check database size
docker compose -f infra/production/docker-compose.yml exec postgres psql -U chai_admin chai -c "SELECT pg_size_pretty(pg_database_size('chai'));"

# List long-running queries
docker compose -f infra/production/docker-compose.yml exec postgres psql -U chai_admin chai -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;"
```

### Log Rotation

```bash
# Clean old logs (older than 30 days)
docker compose -f infra/production/docker-compose.yml exec elasticsearch curl -X DELETE "localhost:9200/chai-logs-$(date -d '30 days ago' +%Y.%m.%d)"

# Check index size
docker compose -f infra/production/docker-compose.yml exec elasticsearch curl -X GET "localhost:9200/_cat/indices?v"
```

### Backup Procedures

```bash
# Manual database backup
docker compose -f infra/production/docker-compose.yml exec -T postgres pg_dump -U chai_admin chai > backup-$(date +%Y%m%d-%H%M%S).sql

# Backup Redis
docker compose -f infra/production/docker-compose.yml exec -T redis-master redis-cli -a $REDIS_PASSWORD BGSAVE
docker cp $(docker compose -f infra/production/docker-compose.yml ps -q redis-master):/data/dump.rdb ./redis-backup-$(date +%Y%m%d-%H%M%S).rdb
```

## Security Considerations

### Network Security

- Restrict database and Redis ports to internal networks only
- Use TLS for all external communication
- Implement firewall rules to limit access to management ports (Grafana, Kibana, Prometheus)

### Secret Management

- Use environment-specific secrets
- Rotate credentials regularly (quarterly minimum)
- Implement secret rotation procedures
- Audit secret access logs

### Container Security

- Run containers as non-root users where possible
- Scan images for vulnerabilities (Trivy, Snyk)
- Pin image versions to specific digests
- Implement pod security policies

### Compliance

- Enable audit logging for all services
- Implement data retention policies
- Regular security assessments
- Document incident response procedures

## Performance Tuning

### Database Optimization

- Monitor slow queries (>1s)
- Add indexes for frequently queried columns
- Use connection pooling (PgBouncer for high-traffic)
- Partition large tables by date

### Redis Optimization

- Set appropriate `maxmemory` and eviction policies
- Use Redis pipelines for batch operations
- Monitor memory usage and key expiration
- Consider Redis Cluster for horizontal scaling

### API Optimization

- Implement response caching (Redis)
- Use pagination for large datasets
- Optimize database queries (avoid N+1)
- Enable HTTP/2 for frontend assets

## Scaling Guidelines

### Vertical Scaling

Increase resources for existing containers:

```yaml
deploy:
  resources:
    limits:
      cpus: '4'    # Increase from 2
      memory: 4G   # Increase from 2G
```

### Horizontal Scaling

Add more replicas:

```bash
# Scale API to 10 instances
docker compose -f infra/production/docker-compose.yml up -d --scale api=10

# Scale workers
docker compose -f infra/production/docker-compose.yml up -d --scale channel-worker=5
```

### When to Scale

- **CPU > 70%** sustained for 5 minutes → Add replicas
- **Memory > 80%** → Increase limits or add replicas
- **Response time > 500ms** → Optimize queries or add replicas
- **Queue depth > 1000** → Add worker replicas

## Next Steps

1. **Implement CI/CD**: Automate deployment with GitHub Actions or GitLab CI
2. **Kubernetes Migration**: Consider migrating to Kubernetes for better orchestration
3. **Multi-Region Deployment**: Deploy to multiple regions for disaster recovery
4. **Automated Backups**: Implement automated backup to object storage (S3)
5. **Load Testing**: Conduct regular load tests to identify bottlenecks
6. **Chaos Engineering**: Implement chaos testing to verify resilience

## References

- [Docker Compose Production Best Practices](https://docs.docker.com/compose/production/)
- [PostgreSQL Production Tuning](https://www.postgresql.org/docs/current/runtime-config.html)
- [Redis High Availability](https://redis.io/docs/management/high-availability/)
- [Nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html)
- [Chai Engineering Blueprint](../Omnichannel_AI_Platform_Engineering_Blueprint_v1.2/13_DEVOPS_SRE_AND_RUNBOOKS.md)
