-- Fix RLS for worker_status table to allow anyone to read the status
ALTER TABLE worker_status ENABLE ROW LEVEL SECURITY;

-- Allow public read access to worker status so the admin dashboard can see real-time updates
CREATE POLICY "Allow public read access to worker_status"
ON worker_status
FOR SELECT
TO public
USING (true);
