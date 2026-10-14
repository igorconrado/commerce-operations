# AWS demonstration proposal — not provisioned

Status: configuration written; static validation recorded separately. No AWS resource has been created, deployed, billed or restored by this program. No public application endpoint is configured.

Static execution on 2026-10-14: Terraform 1.16.6 downloaded from HashiCorp with its published SHA256 checked; provider AWS 6.69.0 installed with HashiCorp signature verification. `fmt`, `init -backend=false` and `validate` passed. The provider lockfile is committed. No AWS credentials, plan, apply or account calls were needed for those checks. CI repeats static validation. The manually dispatched image-publication workflow is prepared but has not run; required environment reviewers and AWS variables are not configured by this task.

## Proposed inventory and access

One VPC, one subnet, internet gateway/route, security group with **no ingress**, one t3.medium Linux EC2 host (2 vCPU/4 GiB), encrypted 40 GiB gp3 root disk, IMDSv2, SSM instance role, one immutable ECR repository and a GitHub OIDC publisher role. No NAT gateway, load balancer, RDS, Kubernetes or high availability. CPU credits use standard mode to avoid unlimited-credit charges; sustained load may be throttled.

GitHub trust is limited to the exact repository and `demo` environment, with sts audience. Publisher permissions allow pushing to one ECR repository only; it cannot create infrastructure, start SSM commands or read application secrets. `ecr:GetAuthorizationToken` necessarily uses resource `*`. Configure required reviewers and main-only deployments in the GitHub environment before any workflow is enabled. If the account already has the GitHub OIDC provider, import it rather than creating a duplicate.

The host's public IPv4 supports outbound package/SSM access but has no inbound service rules. Access would use SSM port forwarding after account authorization. No application deployment script is automatically run by Terraform; host setup installs Docker only. Secrets must be provisioned separately through an approved channel, never Terraform variables/state or Git.

## Cost estimate requiring approval

Planning region: us-east-1; 730 hours/month; no discounts or free-tier assumptions. Official sources read 2026-10-14:

- [AWS instance selection pricing table](https://docs.aws.amazon.com/prescriptive-guidance/latest/optimize-costs-microsoft-workloads/right-size-selection.html): t3.medium reference $0.0416/hour, about $30.37/month. Confirm Linux/region checkout pricing before apply; this is a planning input, not a live quote.
- [EBS pricing](https://aws.amazon.com/ebs/pricing/): gp3 example $0.08/GB-month; 40 GB about $3.20/month, with baseline IOPS/throughput.
- [VPC pricing](https://aws.amazon.com/vpc/pricing/): public IPv4 $0.005/hour, about $3.65/month.

Base estimate about **$37.22/month**, before ECR image storage, snapshots/backups, logs, data transfer, taxes and any changed regional rates. Planning allowance: **$40–50/month**, not a hard cap. Two simultaneously running project hosts would roughly double the compute/storage base. No authorization to incur this cost is presumed. A concrete Terraform plan, resource inventory and updated cost check must be presented before paid provisioning.

## Validation, deployment and rollback gates

1. `terraform init -backend=false` and `terraform validate` check syntax/provider schema only. They do not check real IAM/account quotas or create resources.
2. With approved account access, configure an encrypted remote state backend with locking. Local state is only for static preparation and must not hold real production secrets.
3. Run/inspect plan, approve cost and resource creation, then apply. Verify SSM access before any deployment.
4. Publish the CI-tested commit-tagged image through the restricted OIDC role. Deploy by approved SSM session, use environment secrets, bind the application to host loopback and run migration/smoke tests. Deployment automation is not claimed complete.
5. Database migrations here are additive. Roll back the application to the last known image without reverting data/migrations. Test compatibility before deployment. If a future migration is destructive, require an explicit data migration/restore plan.

## Backup, restore and teardown

CI exercises `pg_dump -Fc` → a new isolated database → `pg_restore` → row-count/content-digest and nonnegative-stock verification. This is database restore evidence, not cloud disk/host disaster recovery.

For a provisioned host, schedule encrypted off-host backups with a retention/access policy before accepting durable data. No automated cloud backup is claimed here. Restore into a new database/host and verify before switching traffic. Preserve an approved backup and inventory before teardown. Run `terraform plan -destroy`, inspect every resource, then obtain authorization for deleting retained state/data. ECR is not force-deleted; remove images only after deciding retention. Stopping EC2 does not remove EBS charges or all other resources.
