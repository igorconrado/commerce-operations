ALTER TABLE audit_log ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit_log ADD COLUMN source text NOT NULL DEFAULT 'user' CHECK(source IN ('user','system','payment'));
CREATE TABLE payment_inbox (
  provider_event_id uuid PRIMARY KEY,
  payload_hash text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations,
  order_id uuid NOT NULL,
  provider_version integer NOT NULL CHECK(provider_version > 0),
  outcome text NOT NULL CHECK(outcome IN ('pending','succeeded','failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,order_id) REFERENCES orders(organization_id,id)
);
CREATE TABLE payments (
  order_id uuid PRIMARY KEY REFERENCES orders,
  organization_id uuid NOT NULL REFERENCES organizations,
  provider_version integer NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','succeeded','failed','unknown')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,order_id) REFERENCES orders(organization_id,id)
);
CREATE TABLE operational_exceptions (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations,
  order_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(order_id,reason),
  FOREIGN KEY(organization_id,order_id) REFERENCES orders(organization_id,id)
);
