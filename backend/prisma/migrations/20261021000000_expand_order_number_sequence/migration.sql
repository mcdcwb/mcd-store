-- Keep existing numbers and sequences intact while allowing the global counter
-- to grow beyond the original four digit suffix.
ALTER TABLE "OrderCounter" DROP CONSTRAINT "OrderCounter_bounds";
ALTER TABLE "Order" DROP CONSTRAINT "Order_sequence_bounds";
ALTER TABLE "Order" DROP CONSTRAINT "Order_number_format";

ALTER TABLE "OrderCounter"
  ADD CONSTRAINT "OrderCounter_bounds" CHECK (id = 1 AND value BETWEEN 0 AND 2147483647);
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_sequence_bounds" CHECK (sequence BETWEEN 1 AND 2147483647);
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_number_format" CHECK (number ~ '^[0-9]{8,}$');
