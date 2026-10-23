-- Pictures and site maps are stored as file_asset rows (see _shared/0002); unit_media points at them.
SELECT public.estateops_install_file_asset('inventory');

ALTER TABLE inventory.unit_media ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES inventory.file_asset (id) ON DELETE RESTRICT;
ALTER TABLE inventory.unit_media DROP COLUMN IF EXISTS url;
CREATE INDEX IF NOT EXISTS unit_media_file_idx ON inventory.unit_media (file_id);
