-- Add webhard_access column to companies table
-- This column controls whether a company can access the webhard feature
-- Default is TRUE (allowed access)

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS webhard_access BOOLEAN NOT NULL DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN public.companies.webhard_access IS 'Controls whether the company can access webhard. Default is TRUE (allowed).';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_companies_webhard_access ON public.companies (webhard_access);
