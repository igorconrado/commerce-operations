ALTER TABLE outbox ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE outbox ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE outbox ADD COLUMN last_error text;
CREATE INDEX outbox_pending ON outbox(available_at) WHERE processed_at IS NULL;
CREATE TABLE payment_commands (
  order_id uuid PRIMARY KEY REFERENCES orders,
  organization_id uuid NOT NULL REFERENCES organizations,
  command_key uuid NOT NULL UNIQUE,
  status text NOT NULL CHECK(status IN ('prepared','unknown','settled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,order_id) REFERENCES orders(organization_id,id)
);
CREATE SCHEMA payment_simulator;
CREATE TABLE payment_simulator.charges (
  command_key uuid PRIMARY KEY,
  order_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK(amount_cents>0),
  outcome text NOT NULL DEFAULT 'succeeded',
  version integer NOT NULL DEFAULT 1,
  event_id uuid NOT NULL UNIQUE
);
