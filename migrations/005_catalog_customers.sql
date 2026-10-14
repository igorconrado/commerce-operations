CREATE TABLE products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL,
  UNIQUE(organization_id,id)
);
INSERT INTO products SELECT id,organization_id,name FROM variants;
ALTER TABLE variants ADD COLUMN product_id uuid;
UPDATE variants SET product_id=id;
ALTER TABLE variants ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE variants ADD FOREIGN KEY(organization_id,product_id) REFERENCES products(organization_id,id);
CREATE TABLE customers (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations,
  name text NOT NULL,
  UNIQUE(organization_id,id)
);
INSERT INTO customers SELECT id,id,'Cliente demonstrativo' FROM organizations;
ALTER TABLE orders ADD COLUMN customer_id uuid;
UPDATE orders SET customer_id=organization_id;
ALTER TABLE orders ALTER COLUMN customer_id SET NOT NULL;
ALTER TABLE orders ADD FOREIGN KEY(organization_id,customer_id) REFERENCES customers(organization_id,id);
CREATE FUNCTION default_order_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.customer_id IS NULL THEN NEW.customer_id := NEW.organization_id; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER default_order_customer BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION default_order_customer();
