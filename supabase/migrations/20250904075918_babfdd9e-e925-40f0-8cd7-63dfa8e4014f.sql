-- Fix security issue: restrict context questions access to authenticated users only
-- Remove the public access policy and add authenticated-only policy

-- Drop the existing public access policy
DROP POLICY IF EXISTS "Context questions are viewable by everyone" ON public.atad2_context_questions;

-- Create new policy that only allows authenticated users to view context questions
CREATE POLICY "Context questions are viewable by authenticated users only" 
ON public.atad2_context_questions 
FOR SELECT 
TO authenticated
USING (true);