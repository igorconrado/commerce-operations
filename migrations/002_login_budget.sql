CREATE TABLE login_budgets (
  subject_hash text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1
);
