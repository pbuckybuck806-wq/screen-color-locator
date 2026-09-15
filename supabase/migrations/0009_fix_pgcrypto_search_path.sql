-- ============================================================================
-- Screen + Color Locator — migration 0009: fix pgcrypto search_path
-- ----------------------------------------------------------------------------
-- On this project, pgcrypto installed into the `extensions` schema rather
-- than `public` (a known Supabase platform difference between projects
-- created at different times) — the two functions that call crypt()/
-- gen_salt() only searched `public`, so setting the approval code failed
-- with "function gen_salt(unknown) does not exist". Widening their
-- search_path to include `extensions` fixes it without touching any data.
-- ============================================================================

alter function verify_approval_code(text) set search_path = public, extensions;
alter function rpc_admin_update_settings(text, int, int, int, int, int, int, text) set search_path = public, extensions;
