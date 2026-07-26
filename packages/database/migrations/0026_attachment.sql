SET ROLE chai_migration_owner;

-- Attachment
CREATE TABLE chai.attachment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES chai.tenant(id),
  message_id uuid REFERENCES chai.message(id),
  object_key text NOT NULL,
  original_filename text NOT NULL,
  mime_declared text,
  mime_detected text,
  byte_size integer NOT NULL CHECK (byte_size >= 0),
  checksum text,
  scan_status text NOT NULL DEFAULT 'PENDING'
    CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED', 'FAILED')),
  processing_status text NOT NULL DEFAULT 'PENDING'
    CHECK (processing_status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
  media_kind text CHECK (media_kind IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER')),
  extracted_text_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachment_tenant_message_idx ON chai.attachment(tenant_id, message_id);
CREATE INDEX attachment_scan_status_idx ON chai.attachment(scan_status);

ALTER TABLE chai.attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE chai.attachment FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chai.attachment
  USING (tenant_id = chai.current_tenant_id())
  WITH CHECK (tenant_id = chai.current_tenant_id());

REVOKE ALL ON chai.attachment FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON chai.attachment TO chai_app_runtime, chai_worker_runtime;

RESET ROLE;
