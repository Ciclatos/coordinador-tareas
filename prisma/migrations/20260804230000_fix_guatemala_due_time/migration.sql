-- Los valores históricos de datetime-local se interpretaron como UTC en vez de UTC-6.
-- Se desplazan una sola vez para conservar la hora de Guatemala que escribió el usuario.
UPDATE "Assignment"
SET "dueAt" = "dueAt" + INTERVAL '6 hours';
