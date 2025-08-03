-- Create table for ATAD2 questions
CREATE TABLE public.atad2_questions (
  id SERIAL PRIMARY KEY,
  question_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer_option TEXT NOT NULL,
  next_question_id TEXT,
  risk_points INTEGER NOT NULL DEFAULT 0,
  difficult_term TEXT,
  term_explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for ATAD2 assessment sessions
CREATE TABLE public.atad2_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  taxpayer_name TEXT NOT NULL,
  fiscal_year TEXT NOT NULL,
  fiscal_year_start_date DATE,
  fiscal_year_end_date DATE,
  date_filled TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  final_score INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for individual answers within sessions
CREATE TABLE public.atad2_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES public.atad2_sessions(session_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer TEXT NOT NULL,
  risk_points INTEGER NOT NULL DEFAULT 0,
  explanation TEXT,
  answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.atad2_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atad2_answers ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Questions are publicly readable" 
ON public.atad2_questions 
FOR SELECT 
USING (true);

CREATE POLICY "Sessions are publicly accessible" 
ON public.atad2_sessions 
FOR ALL 
USING (true);

CREATE POLICY "Answers are publicly accessible" 
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

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_atad2_sessions_updated_at
  BEFORE UPDATE ON public.atad2_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert the ATAD2 questions from the provided JSON data
INSERT INTO public.atad2_questions (question_id, question, answer_option, next_question_id, risk_points, difficult_term, term_explanation) VALUES
('1', 'Is the taxpayer a legal entity which is a tax resident of the Netherlands or a legal entity incorporated under Dutch law (e.g. BV, NV, Cooperative) that is subject to Dutch corporate income taxation as a Dutch domestic taxpayer?', 'Yes', '3', 0, null, null),
('1', 'Is the taxpayer a legal entity which is a tax resident of the Netherlands or a legal entity incorporated under Dutch law (e.g. BV, NV, Cooperative) that is subject to Dutch corporate income taxation as a Dutch domestic taxpayer?', 'No', '2', 0, null, null),
('2', 'Is the taxpayer a legal entity that is not based in the Netherlands, and that is subject to Dutch corporate income taxation as a non-resident taxpayer due to the existence of a permanent establishment in the Netherlands?', 'Yes', '31', 0, 'Permanent establishment', 'A fixed place of business, resident in another State than the State in which the head office is a resident, through which the activities of an enterprise are wholly or in part carried out, with the understanding that a building site or construction or installation project constitutes a permanent establishment only if it lasts more than twelve months. If the Netherlands has concluded a tax treaty with the other State, the definition included in the treaty is applicable.'),
('2', 'Is the taxpayer a legal entity that is not based in the Netherlands, and that is subject to Dutch corporate income taxation as a non-resident taxpayer due to the existence of a permanent establishment in the Netherlands?', 'No', 'end', -1, null, null),
('3', 'Is the Dutch domestic taxpayer part of an international structure?', 'Yes', '4', 0, 'International structure', 'An international structure is present where the taxpayer (directly or indirectly) has foreign subsidiary companies, foreign sister companies or foreign shareholders with an interest of 25% or more. In the absence of foreign subsidiary companies, foreign sister companies or foreign shareholders, there is also an international structure if the taxpayer has a foreign permanent establishment.'),
('3', 'Is the Dutch domestic taxpayer part of an international structure?', 'No', '28', 0, null, null),
('4', 'Do(es) (one of) the shareholder(s)/participant(s) regard the Dutch domestic taxpayer as transparent for tax purposes based on their local tax law?', 'Yes', '5', 1, 'Transparent for tax purposes', 'An entity is transparent for tax purposes if the profit of that entity is considered, based on the tax laws of a State, not to be profit of the entity, but rather profit of the participants of that entity.'),
('4', 'Do(es) (one of) the shareholder(s)/participant(s) regard the Dutch domestic taxpayer as transparent for tax purposes based on their local tax law?', 'No', '5', 0, null, null),
('5', 'Does the Dutch domestic taxpayer provide remunerations or payments (which are in principle deductible in the Netherlands) to an associated enterprise (referred to as ''recipient'' in the following questions)?', 'Yes', '6', 0, 'Associated enterprise', 'An entity in which the taxpayer holds a participation of 25% or more, or an entity that holds a participation of 25% or more in the taxpayer. If an individual or entity holds a participation of 25% or more in the taxpayer and one or more other entities, all the entities concerned shall also be regarded as associated enterprises of the taxpayer, for the purpose of this article. An entity is also considered to be an associated enterprise of the taxpayer if this entity holds a participation in the taxpayer and this entity acts together with(an)other entity(entities) or person(s) and these entities and person(s) together hold a participation of at least 25% in the taxpayer. These persons and entities who/ which act together are a so called collaborative group (in Dutch ''een samenwerkende groep''). If one or more persons or entities(alone or together) of a so called collaborative group have a participation of at least 25 % in another entity, this latter entity is also considered to be an associated enterprise of the taxpayer. If a collaborative group consisting of the taxpayer, one or more other entities and / or one or more persons has a participation of at least 25 % in another entity, the latter entity is also an associated enterprise. Finally, an associated enterprise also means an entity that is part of the same consolidated group for financial accounting purposes as the taxpayer, an enterprise in which the taxpayer has a significant influence in the management or an enterprise that has a significant influence in the management of the taxpayer.'),
('5', 'Does the Dutch domestic taxpayer provide remunerations or payments (which are in principle deductible in the Netherlands) to an associated enterprise (referred to as ''recipient'' in the following questions)?', 'No', '15', 0, null, null),
('6', 'Is at least one of these recipients a hybrid entity?', 'Yes', '7', 1, 'Hybrid entity', 'An entity that is regarded as a taxable entity under the laws of one State, and whose income or expenditure is treated as income or expenditure of one or more other entities or individuals under the laws of another jurisdiction.'),
('6', 'Is at least one of these recipients a hybrid entity?', 'No', '7', 0, null, null),
('7', 'Is at least one of the recipients based outside the EU (a non-EU recipient)?', 'Yes', '8', 0, null, null),
('7', 'Is at least one of the recipients based outside the EU (a non-EU recipient)?', 'No', '9', 0, null, null),
('8', 'Is the corresponding revenue of the non-EU recipient included in the taxable base in the State of the recipient within 12 months from the moment of deduction?', 'Yes', '9', 0, 'Included in the taxable base in the State of the recipient', 'Examples of inclusion in the taxable base in the State of the recipient: Inclusion in the taxable base of the recipient itself; Inclusion in the taxable base of another entity (resident of the same State) which together with the recipient is part of a group which makes use of a consolidation regime for tax purposes;'),
('8', 'Is the corresponding revenue of the non-EU recipient included in the taxable base in the State of the recipient within 12 months from the moment of deduction?', 'No', '9', 1, null, null);