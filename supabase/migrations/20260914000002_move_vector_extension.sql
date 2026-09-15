begin;

set local search_path = public, pg_temp;

-- Move pgvector out of the API-exposed public schema (Supabase advisor
-- extension_in_public). Existing columns, indexes, and function signatures
-- reference the relocated type by OID and keep working. Type and operator
-- references in setup.sql and functions.sql resolve through their explicit
-- search_path, which already includes extensions.
alter extension vector set schema extensions;

commit;
