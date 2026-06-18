-- Add inquiry_type and source columns to contacts table
-- inquiry_type: webhard folder-based classification
-- source: origin of the contact (website / webhard / phone)

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS inquiry_type VARCHAR(20)
    CHECK (inquiry_type IN ('cutting_request', 'mold_request')),
  ADD COLUMN IF NOT EXISTS source VARCHAR(20)
    CHECK (source IN ('website', 'webhard', 'phone'));

-- Index for filtering unclassified webhard contacts
CREATE INDEX IF NOT EXISTS idx_contacts_inquiry_type ON contacts (inquiry_type);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts (source);
