CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE users (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  email text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('operator','viewer')), active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id,id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users,
  expires_at timestamptz NOT NULL
);
CREATE TABLE variants (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  sku text NOT NULL, name text NOT NULL, price_cents integer NOT NULL CHECK(price_cents >= 0),
  available integer NOT NULL CHECK(available >= 0), version integer NOT NULL DEFAULT 1,
  UNIQUE(organization_id,sku), UNIQUE(organization_id,id)
);
CREATE TABLE orders (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  actor_id uuid NOT NULL, variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
  unit_price_cents integer NOT NULL CHECK(unit_price_cents >= 0),
  status text NOT NULL CHECK(status IN ('reserved','confirmed','cancelled','expired')),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  FOREIGN KEY(organization_id,actor_id) REFERENCES users(organization_id,id),
  FOREIGN KEY(organization_id,variant_id) REFERENCES variants(organization_id,id),
  UNIQUE(organization_id,id)
);
CREATE INDEX orders_org_cursor ON orders(organization_id,created_at DESC,id DESC);
CREATE INDEX orders_expiration ON orders(expires_at) WHERE status='reserved';
CREATE TABLE idempotency (
  organization_id uuid NOT NULL REFERENCES organizations, key text NOT NULL,
  payload_hash text NOT NULL, order_id uuid NOT NULL,
  PRIMARY KEY(organization_id,key),
  FOREIGN KEY(organization_id,order_id) REFERENCES orders(organization_id,id)
);
CREATE TABLE stock_movements (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  order_id uuid NOT NULL, delta integer NOT NULL, kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,order_id) REFERENCES orders(organization_id,id),
  UNIQUE(order_id,kind)
);
CREATE TABLE outbox (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  aggregate_id uuid NOT NULL, aggregate_version integer NOT NULL,
  type text NOT NULL, schema_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(aggregate_id,aggregate_version)
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations,
  actor_id uuid NOT NULL, action text NOT NULL, entity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
