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
import { InfoIcon, ArrowLeft } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AssessmentSidebar } from "@/components/AssessmentSidebar";

interface Question {
  id: string;
  question_id: string;
  question: string;
  answer_option: string;
  risk_points: number;
  next_question_id: string | null;
  difficult_term: string | null;
  term_explanation: string | null;
  question_title: string | null;
}

interface SessionInfo {
  taxpayer_name: string;
  tax_year: string;
  tax_year_not_equals_calendar: boolean;
  period_start_date?: string;
  period_end_date?: string;
}

interface QuestionTextProps {
  question: string;
  difficultTerm: string | null;
  termExplanation: string | null;
  exampleText: string | null;
}

const QuestionText = ({ question, difficultTerm, termExplanation, exampleText }: QuestionTextProps) => {
  const [showExample, setShowExample] = useState(false);

  const renderQuestionWithTerms = () => {
    if (!difficultTerm || !termExplanation || difficultTerm.toLowerCase().startsWith('example')) {
      return question;
    }

    // Find the difficult term in the question text (case insensitive)
    const termRegex = new RegExp(`\\b${difficultTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const parts = question.split(termRegex);
    const matches = question.match(termRegex);

    if (!matches || parts.length === 1) {
      return question;
    }

    return (
      <>
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < matches.length && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-semibold text-blue-800 hover:bg-blue-50 rounded-sm px-1 cursor-pointer transition-colors duration-200">
                      {matches[index]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm p-3 bg-white border shadow-md rounded">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">💡</span>
                      <div>
                        <span className="font-semibold text-slate-800 block mb-1">
                          {difficultTerm}
                        </span>
                        <p className="text-sm leading-relaxed text-slate-700">
                          {termExplanation}
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        ))}
      </>
    );
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <p className="text-xl leading-relaxed text-foreground font-medium flex-1">
          {renderQuestionWithTerms()}
          {exampleText && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowExample(!showExample)}
                    className="ml-2 text-blue-800 hover:bg-blue-100 rounded-sm px-1 transition cursor-pointer text-base"
                    type="button"
                  >
                    📘
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to view example</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </p>
      </div>
      
      {showExample && exampleText && (
        <div className="w-full bg-amber-50 border-l-4 border-yellow-400 rounded-md p-4 mt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 flex-1">
              <span className="text-lg">📘</span>
              <div className="flex-1">
                <span className="font-semibold text-amber-800 block mb-2">Example</span>
                <p className="text-sm leading-relaxed text-amber-700">
                  {exampleText}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowExample(false)}
              className="text-amber-600 hover:text-amber-800 text-sm font-medium transition"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [questionHistory, setQuestionHistory] = useState<{question: Question, answer: string}[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

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

      // Add current question and answer to history
      setQuestionHistory(prev => [...prev, { question: currentQuestion, answer: selectedAnswer }]);
      setAnswers(prev => ({ ...prev, [currentQuestion.question_id]: selectedAnswer }));

      // Move to next question
      const nextQuestionId = selectedQuestionOption.next_question_id;
      if (nextQuestionId) {
        const nextQuestion = questions.find(q => q.question_id === nextQuestionId);
        if (nextQuestion) {
          setIsTransitioning(true);
          setTimeout(() => {
            setCurrentQuestion(nextQuestion);
            setSelectedAnswer("");
            setIsTransitioning(false);
          }, 300);
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

  const goToPreviousQuestion = () => {
    if (questionHistory.length === 0) return;
    
    const lastEntry = questionHistory[questionHistory.length - 1];
    setQuestionHistory(prev => prev.slice(0, -1));
    setCurrentQuestion(lastEntry.question);
    setSelectedAnswer(lastEntry.answer);
    
    // Remove the answer from answers state
    const newAnswers = { ...answers };
    delete newAnswers[lastEntry.question.question_id];
    setAnswers(newAnswers);
  };

  const goToSpecificQuestion = (questionIndex: number) => {
    if (questionIndex >= questionHistory.length) return;
    
    // Navigate to the specific question without removing subsequent answers
    const targetEntry = questionHistory[questionIndex];
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    
    // Keep all answers intact - just navigate for review/correction
    // The questionHistory and answers state remain unchanged
  };

  const handleAnswerSelect = async (answer: string) => {
    if (loading || isTransitioning) return;
    
    setSelectedAnswer(answer);
    setLoading(true);
    
    // Brief visual feedback, then auto-advance
    setTimeout(async () => {
      await submitAnswerDirectly(answer);
    }, 300);
  };

  const submitAnswerDirectly = async (answer: string) => {
    if (!currentQuestion || !sessionId) return;

    try {
      const selectedQuestionOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === answer
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
          answer: answer,
          explanation: selectedQuestionOption.answer_option,
          risk_points: selectedQuestionOption.risk_points,
          difficult_term: selectedQuestionOption.difficult_term,
          term_explanation: selectedQuestionOption.term_explanation
        });

      if (error) throw error;

      // Add current question and answer to history
      setQuestionHistory(prev => [...prev, { question: currentQuestion, answer }]);
      setAnswers(prev => ({ ...prev, [currentQuestion.question_id]: answer }));

      // Move to next question
      const nextQuestionId = selectedQuestionOption.next_question_id;
      if (nextQuestionId) {
        const nextQuestion = questions.find(q => q.question_id === nextQuestionId);
        if (nextQuestion) {
          setIsTransitioning(true);
          setTimeout(() => {
            setCurrentQuestion(nextQuestion);
            setSelectedAnswer("");
            setIsTransitioning(false);
          }, 300);
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
                <div className="flex items-center">
                  <Label htmlFor="taxpayer_name">Taxpayer name</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This field is required</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="taxpayer_name"
                  value={sessionInfo.taxpayer_name}
                  onChange={(e) => setSessionInfo({...sessionInfo, taxpayer_name: e.target.value})}
                  placeholder="Enter taxpayer name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center">
                  <Label htmlFor="tax_year">Tax year</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>This field is required</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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
                        <InfoIcon className="h-4 w-4 text-muted-foreground cursor-default ml-1" />
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
                      <div className="flex items-center">
                        <Label htmlFor="period_start">Start date</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>This field is required</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Input
                        id="period_start"
                        type="date"
                        value={sessionInfo.period_start_date || ""}
                        onChange={(e) => setSessionInfo({...sessionInfo, period_start_date: e.target.value})}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <Label htmlFor="period_end">End date</Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-red-500 text-sm ml-1 cursor-default">*</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>This field is required</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
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

  // Get unique answer options for current question and sort them (Yes first, then No)
  const currentQuestionOptions = questions
    .filter(q => q.question_id === currentQuestion.question_id)
    .sort((a, b) => {
      if (a.answer_option.toLowerCase() === 'yes') return -1;
      if (b.answer_option.toLowerCase() === 'yes') return 1;
      if (a.answer_option.toLowerCase() === 'no') return -1;
      if (b.answer_option.toLowerCase() === 'no') return 1;
      return 0;
    });

  // Get the most complete question data (with difficult_term and term_explanation)
  const questionWithTerms = currentQuestionOptions.find(q => q.difficult_term && q.term_explanation) || currentQuestion;
  
  // Get example text if it exists
  const exampleOption = currentQuestionOptions.find(q => 
    q.difficult_term && q.difficult_term.toLowerCase().startsWith('example')
  );
  const exampleText = exampleOption ? exampleOption.term_explanation : null;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => navigate("/")}>
            ← Back to dashboard
          </Button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <AssessmentSidebar 
              answers={answers}
              questionHistory={questionHistory.map(entry => ({
                question: {
                  question_id: entry.question.question_id,
                  question_title: entry.question.question_title,
                  risk_points: entry.question.risk_points
                },
                answer: entry.answer
              }))}
              currentQuestion={currentQuestion ? {
                question_id: currentQuestion.question_id,
                question_title: currentQuestion.question_title,
                risk_points: currentQuestion.risk_points
              } : null}
              onQuestionClick={goToSpecificQuestion}
            />
          </div>
          
          {/* Main Content */}
          <div className="lg:col-span-3">
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-2">
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">
                  Question {currentQuestion.question_id}
                </div>
                {currentQuestion.question_title && (
                  <div className="text-lg font-semibold text-primary mb-3">
                    {currentQuestion.question_title}
                  </div>
                )}
                <QuestionText 
                  question={currentQuestion.question}
                  difficultTerm={questionWithTerms.difficult_term}
                  termExplanation={questionWithTerms.term_explanation}
                  exampleText={exampleText}
                />
              </CardHeader>
          <CardContent className="pt-6">
            {/* Answer options as button-like choices */}
            <div className="space-y-3 mb-8">
              {currentQuestionOptions.map((option, index) => {
                const isSelected = selectedAnswer === option.answer_option;
                const isYes = option.answer_option.toLowerCase() === 'yes';
                
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleAnswerSelect(option.answer_option)}
                    disabled={loading || isTransitioning}
                    className={`
                      w-full p-4 rounded-lg border-2 transition-all duration-200 text-left
                      ${isSelected 
                        ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary/20' 
                        : 'border-border hover:border-primary/50 hover:bg-accent/50'
                      }
                      ${loading || isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}
                      focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {isYes ? '✅' : '❌'}
                      </span>
                      <span className="text-base font-medium">
                        {option.answer_option}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            
            {/* Navigation buttons */}
            <div className="flex items-center gap-3">
              <Button 
                onClick={goToPreviousQuestion}
                disabled={questionHistory.length === 0 || loading || isTransitioning}
                variant="outline"
                className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </Button>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Assessment;
