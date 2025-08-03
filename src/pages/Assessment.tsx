import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Question {
  id: string;
  question_id: string;
  question: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
  difficult_term: string | null;
  term_explanation: string | null;
}

interface SessionInfo {
  taxpayer_name: string;
  tax_year: string;
  tax_year_not_equals_calendar: boolean;
  period_start_date?: string;
  period_end_date?: string;
}

const Assessment = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    taxpayer_name: "",
    tax_year: "",
    tax_year_not_equals_calendar: false
  });
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('atad2_questions')
        .select('*')
        .order('question_id');
      
      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error loading questions:', error);
      toast({
        title: "Error",
        description: "Failed to load questions",
        variant: "destructive",
      });
    }
  };

  const startSession = async () => {
    if (!sessionInfo.taxpayer_name || !sessionInfo.tax_year) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (sessionInfo.tax_year_not_equals_calendar && (!sessionInfo.period_start_date || !sessionInfo.period_end_date)) {
      toast({
        title: "Missing information",
        description: "Please provide start and end dates for the tax period",
        variant: "destructive",
      });
      return;
    }

    if (sessionInfo.tax_year_not_equals_calendar && sessionInfo.period_start_date && sessionInfo.period_end_date) {
      if (new Date(sessionInfo.period_end_date) < new Date(sessionInfo.period_start_date)) {
        toast({
          title: "Invalid date range",
          description: "End date cannot be before start date",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      const newSessionId = crypto.randomUUID();
      
      const startDate = sessionInfo.tax_year_not_equals_calendar 
        ? sessionInfo.period_start_date 
        : `${sessionInfo.tax_year}-01-01`;
      
      const endDate = sessionInfo.tax_year_not_equals_calendar 
        ? sessionInfo.period_end_date 
        : `${sessionInfo.tax_year}-12-31`;

      const { error } = await supabase
        .from('atad2_sessions')
        .insert({
          session_id: newSessionId,
          taxpayer_name: sessionInfo.taxpayer_name,
          fiscal_year: sessionInfo.tax_year,
          is_custom_period: sessionInfo.tax_year_not_equals_calendar,
          period_start_date: startDate,
          period_end_date: endDate,
          status: 'in_progress'
        });

      if (error) throw error;

      setSessionId(newSessionId);
      setSessionStarted(true);
      
      // Load first question
      const firstQuestion = questions.find(q => q.question_id === "1");
      if (firstQuestion) {
        setCurrentQuestion(firstQuestion);
      }
    } catch (error) {
      console.error('Error starting session:', error);
      toast({
        title: "Error",
        description: "Failed to start assessment",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!currentQuestion || !selectedAnswer || !sessionId) return;

    setLoading(true);
    try {
      const selectedQuestionOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === selectedAnswer
      );

      if (!selectedQuestionOption) {
        throw new Error("Selected answer not found");
      }

      const { error } = await supabase
        .from('atad2_answers')
        .insert({
          session_id: sessionId,
          question_id: currentQuestion.question_id,
          question_text: currentQuestion.question,
          answer: selectedAnswer,
          explanation: selectedQuestionOption.answer_option,
          risk_points: selectedQuestionOption.risk_points,
          difficult_term: selectedQuestionOption.difficult_term,
          term_explanation: selectedQuestionOption.term_explanation
        });

      if (error) throw error;

      // Move to next question
      const nextQuestionId = selectedQuestionOption.next_question_id;
      if (nextQuestionId) {
        const nextQuestion = questions.find(q => q.question_id === nextQuestionId);
        if (nextQuestion) {
          setCurrentQuestion(nextQuestion);
          setSelectedAnswer("");
        }
      } else {
        // Assessment completed
        toast({
          title: "Assessment complete",
          description: "Your risk assessment has been completed successfully.",
        });
        navigate("/");
      }
    } catch (error) {
      console.error('Error submitting answer:', error);
      toast({
        title: "Error",
        description: "Failed to submit answer",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  if (!sessionStarted) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <Button variant="outline" onClick={() => navigate("/")}>
              ← Back to dashboard
            </Button>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Start risk assessment</CardTitle>
              <CardDescription>
                Please provide some basic information to begin your ATAD2 risk assessment
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="taxpayer_name">Taxpayer name</Label>
                <Input
                  id="taxpayer_name"
                  value={sessionInfo.taxpayer_name}
                  onChange={(e) => setSessionInfo({...sessionInfo, taxpayer_name: e.target.value})}
                  placeholder="Enter taxpayer name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="tax_year">Tax year</Label>
                <Select 
                  value={sessionInfo.tax_year} 
                  onValueChange={(value) => setSessionInfo({...sessionInfo, tax_year: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tax year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 6 }, (_, i) => {
                      const year = 2025 - i; // 2025, 2024, 2023, 2022, 2021, 2020
                      return (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="border border-border rounded-lg p-4 space-y-4">
                <TooltipProvider>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="tax-year-different"
                      checked={sessionInfo.tax_year_not_equals_calendar}
                      onCheckedChange={(checked) => setSessionInfo({
                        ...sessionInfo, 
                        tax_year_not_equals_calendar: !!checked,
                        period_start_date: checked ? sessionInfo.period_start_date : undefined,
                        period_end_date: checked ? sessionInfo.period_end_date : undefined
                      })}
                    />
                    <Label htmlFor="tax-year-different" className="cursor-pointer">
                      The tax year does not equal the calendar year
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Only fill in a start and end date if the tax year deviates from the calendar year.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                {sessionInfo.tax_year_not_equals_calendar && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="period_start">Start date</Label>
                      <Input
                        id="period_start"
                        type="date"
                        value={sessionInfo.period_start_date || ""}
                        onChange={(e) => setSessionInfo({...sessionInfo, period_start_date: e.target.value})}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="period_end">End date</Label>
                      <Input
                        id="period_end"
                        type="date"
                        value={sessionInfo.period_end_date || ""}
                        onChange={(e) => setSessionInfo({...sessionInfo, period_end_date: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <Button onClick={startSession} disabled={loading} className="w-full">
                {loading ? "Starting assessment..." : "Start assessment"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p>Loading question...</p>
      </div>
    );
  }

  // Get unique answer options for current question
  const currentQuestionOptions = questions.filter(
    q => q.question_id === currentQuestion.question_id
  );

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            ← Back to dashboard
          </Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Question {currentQuestion.question_id}</CardTitle>
            <CardDescription className="text-lg">
              {currentQuestion.question}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
              {currentQuestionOptions.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.answer_option} id={`option-${index}`} />
                  <Label htmlFor={`option-${index}`} className="cursor-pointer">
                    {option.answer_option}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            
            <div className="pt-4">
              <Button 
                onClick={submitAnswer} 
                disabled={!selectedAnswer || loading}
                className="w-full"
              >
                {loading ? "Submitting..." : "Next question"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Assessment;