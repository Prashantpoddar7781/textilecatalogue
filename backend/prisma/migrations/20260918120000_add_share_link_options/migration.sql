-- Display toggles chosen when the seller creates a catalogue share link.
ALTER TABLE "ShareLink" ADD COLUMN IF NOT EXISTS "shareOptions" JSONB;
