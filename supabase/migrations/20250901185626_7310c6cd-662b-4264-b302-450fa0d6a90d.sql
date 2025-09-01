-- Fix security vulnerability: Restrict questions access to authenticated users only
-- This prevents competitors from accessing proprietary assessment methodology

-- Drop the current overly permissive policy
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON public.atad2_questions;

-- Create a new policy that only allows authenticated users to view questions
CREATE POLICY "Questions are viewable by authenticated users only" 
ON public.atad2_questions 
FOR SELECT 
TO authenticated
USING (true);

-- Ensure only authenticated users can access the proprietary assessment data
-- This protects:
-- - Risk scoring methodology 
-- - Difficult term explanations
-- - Business process flows
-- - Assessment question logic