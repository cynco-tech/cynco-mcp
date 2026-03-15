-- MCP API Keys table
-- Stores hashed API keys that map to tenants for HTTP transport authentication.
-- Raw keys are shown once on creation and never stored.

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id               VARCHAR PRIMARY KEY,                  -- typeid('mak')
  key_hash         VARCHAR(64) NOT NULL,                  -- SHA-256 hex of raw key
  key_prefix       VARCHAR(16) NOT NULL,                  -- Display prefix (e.g. "cak_abc1...")
  name             VARCHAR(100) NOT NULL,                 -- Human-readable label
  tenant_type      VARCHAR(20) NOT NULL                   -- 'client' or 'accounting_firm'
                   CHECK (tenant_type IN ('client', 'accounting_firm')),
  tenant_id        VARCHAR NOT NULL,                      -- client_id or accounting_firm_id
  scopes           TEXT[] NOT NULL DEFAULT '{}',           -- Reserved for future RBAC
  created_by       VARCHAR,                               -- user_id who created this key
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,                           -- NULL = never expires
  UNIQUE(key_hash)
);

-- Fast lookup by hash (only active keys)
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_hash
  ON mcp_api_keys (key_hash) WHERE is_active = true;

-- Find keys by tenant
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_tenant
  ON mcp_api_keys (tenant_type, tenant_id);
