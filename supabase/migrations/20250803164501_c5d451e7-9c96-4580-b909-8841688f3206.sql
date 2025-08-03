-- Create table for ATAD2 questions
CREATE TABLE public.atad2_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_option TEXT NOT NULL CHECK (answer_option IN ('Yes', 'No')),
  next_question_id TEXT,
  risk_points INTEGER NOT NULL DEFAULT 0,
  difficult_term TEXT,
  term_explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index for question_id + answer_option combination
CREATE UNIQUE INDEX idx_atad2_questions_unique ON public.atad2_questions(question_id, answer_option);

-- Create table for assessment sessions
CREATE TABLE public.atad2_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  taxpayer_name TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  is_custom_period BOOLEAN NOT NULL DEFAULT false,
  period_start_date DATE,
  period_end_date DATE,
  date_filled TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  final_score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for individual answers within sessions
CREATE TABLE public.atad2_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer TEXT NOT NULL CHECK (answer IN ('Yes', 'No')),
  risk_points INTEGER NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL, -- Required explanation (min 100 chars)
  difficult_term TEXT,
  term_explanation TEXT,
  answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.atad2_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_answers ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Questions are viewable by everyone" 
ON public.atad2_questions 
FOR SELECT 
USING (true);

CREATE POLICY "Sessions are viewable by everyone" 
ON public.atad2_sessions 
FOR ALL 
USING (true);

CREATE POLICY "Answers are viewable by everyone" 
ON public.atad2_answers 
FOR ALL 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_atad2_questions_updated_at
  BEFORE UPDATE ON public.atad2_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_atad2_sessions_updated_at
  BEFORE UPDATE ON public.atad2_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_atad2_sessions_session_id ON public.atad2_sessions(session_id);
CREATE INDEX idx_atad2_answers_session_id ON public.atad2_answers(session_id);
CREATE INDEX idx_atad2_answers_question_id ON public.atad2_answers(question_id);