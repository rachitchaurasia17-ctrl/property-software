-- Run this in your Supabase Dashboard -> SQL Editor

CREATE TABLE prebuilt_maps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  blocks JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert the default 4 buttons so your map works immediately!
INSERT INTO prebuilt_maps (label, blocks) VALUES 
('A', '["at-a"]'),
('B', '["at-b", "at-c"]'),
('C', '["at-d"]'),
('D', '["ac-c", "ac-82c", "ac-83a"]');

-- Note: Row Level Security (RLS) is disabled by default for new tables.
-- This allows your frontend and admin page to read/write using the publishable key.
-- For production, you should enable RLS and require authentication for writes!
