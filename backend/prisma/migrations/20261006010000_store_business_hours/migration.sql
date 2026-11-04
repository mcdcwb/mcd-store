ALTER TABLE "StoreSettings" ADD COLUMN "businessHours" JSONB NOT NULL DEFAULT '{"MONDAY":{"isOpen":true,"openingTime":"09:00","closingTime":"18:00"},"TUESDAY":{"isOpen":true,"openingTime":"09:00","closingTime":"18:00"},"WEDNESDAY":{"isOpen":true,"openingTime":"09:00","closingTime":"18:00"},"THURSDAY":{"isOpen":true,"openingTime":"09:00","closingTime":"18:00"},"FRIDAY":{"isOpen":true,"openingTime":"09:00","closingTime":"18:00"},"SATURDAY":{"isOpen":true,"openingTime":"10:00","closingTime":"15:00"},"SUNDAY":{"isOpen":false,"openingTime":null,"closingTime":null}}';
-- Canonical shape enforced even for writes outside the HTTP API.
CREATE FUNCTION store_business_hours_valid(hours JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE day_key TEXT; day_value JSONB;
BEGIN
  IF jsonb_typeof(hours) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(hours)) <> 7 THEN RETURN FALSE; END IF;
  FOREACH day_key IN ARRAY ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] LOOP
    day_value := hours -> day_key;
    IF jsonb_typeof(day_value) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(day_value)) <> 3 OR
       NOT day_value ?& ARRAY['isOpen','openingTime','closingTime'] THEN RETURN FALSE; END IF;
    IF day_value -> 'isOpen' = 'false'::jsonb THEN
      IF day_value -> 'openingTime' IS DISTINCT FROM 'null'::jsonb OR
         day_value -> 'closingTime' IS DISTINCT FROM 'null'::jsonb THEN RETURN FALSE; END IF;
    ELSIF day_value -> 'isOpen' = 'true'::jsonb THEN
      IF jsonb_typeof(day_value -> 'openingTime') IS DISTINCT FROM 'string' OR
         jsonb_typeof(day_value -> 'closingTime') IS DISTINCT FROM 'string' THEN RETURN FALSE; END IF;
      IF (day_value ->> 'openingTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
         (day_value ->> 'closingTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR
         (day_value ->> 'openingTime') >= (day_value ->> 'closingTime') THEN RETURN FALSE; END IF;
    ELSE RETURN FALSE;
    END IF;
  END LOOP;
  RETURN TRUE;
END;
$$;

ALTER TABLE "StoreSettings" ADD CONSTRAINT "StoreSettings_business_hours_valid"
  CHECK (store_business_hours_valid("businessHours"));
