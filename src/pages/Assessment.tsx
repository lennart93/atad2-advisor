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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
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
      <p className="text-lg text-gray-800 leading-relaxed text-left">
        {renderQuestionWithTerms()}
        {exampleText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowExample(!showExample)}
                  className="ml-2 text-blue-700 text-base cursor-pointer hover:bg-blue-50 rounded-sm px-1 transition-colors duration-200"
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
  const [questionFlow, setQuestionFlow] = useState<{question: Question, answer: string}[]>([]); // Actual answered sequence
  const [navigationIndex, setNavigationIndex] = useState<number>(-1); // Current position in questionFlow (-1 = at new question)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showFlowChangeDialog, setShowFlowChangeDialog] = useState(false);
  const [pendingAnswerChange, setPendingAnswerChange] = useState<{answer: string, newNextQuestionId: string | null} | null>(null);

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

      // Check if answer already exists for this question in this session
      const { data: existingAnswer } = await supabase
        .from('atad2_answers')
        .select('id')
        .eq('session_id', sessionId)
        .eq('question_id', currentQuestion.question_id)
        .single();

      if (existingAnswer) {
        // Update existing answer
        const { error } = await supabase
          .from('atad2_answers')
          .update({
            question_text: currentQuestion.question,
            answer: selectedAnswer,
            explanation: selectedQuestionOption.answer_option,
            risk_points: selectedQuestionOption.risk_points,
            difficult_term: selectedQuestionOption.difficult_term,
            term_explanation: selectedQuestionOption.term_explanation,
            answered_at: new Date().toISOString()
          })
          .eq('id', existingAnswer.id);

        if (error) throw error;
      } else {
        // Insert new answer
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
      }

      // Update or add current question and answer to both history and flow
      const questionEntry = { question: currentQuestion, answer: selectedAnswer };
      
      setQuestionHistory(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          // Replace existing entry
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          // Add new entry
          return [...prev, questionEntry];
        }
      });
      
      setQuestionFlow(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          // Replace existing entry
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          // Add new entry
          return [...prev, questionEntry];
        }
      });
      
      setNavigationIndex(-1); // Reset to new question mode
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
    if (questionFlow.length === 0) return;
    
    let targetIndex: number;
    
    if (navigationIndex === -1) {
      // We're at a new question, go to the last answered question
      targetIndex = questionFlow.length - 1;
    } else if (navigationIndex > 0) {
      // We're reviewing, go one step back in the flow
      targetIndex = navigationIndex - 1;
    } else {
      // We're at the first question, can't go back further
      return;
    }
    
    const targetEntry = questionFlow[targetIndex];
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    setNavigationIndex(targetIndex);
  };

  const goToNextQuestion = () => {
    // Only allow "next" if we're reviewing within the answered flow
    if (navigationIndex === -1 || navigationIndex >= questionFlow.length - 1) return;
    
    const targetIndex = navigationIndex + 1;
    const targetEntry = questionFlow[targetIndex];
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    setNavigationIndex(targetIndex);
  };

  const continueToNextUnanswered = () => {
    // Find the next question that should be asked based on current flow
    if (questionFlow.length === 0) return;
    
    // Get the last answered question and find its next question
    const lastAnsweredEntry = questionFlow[questionFlow.length - 1];
    const lastAnsweredQuestionOption = questions.find(
      q => q.question_id === lastAnsweredEntry.question.question_id && 
           q.answer_option === lastAnsweredEntry.answer
    );
    
    if (lastAnsweredQuestionOption?.next_question_id) {
      const nextQuestion = questions.find(q => q.question_id === lastAnsweredQuestionOption.next_question_id);
      if (nextQuestion) {
        setCurrentQuestion(nextQuestion);
        setSelectedAnswer("");
        setNavigationIndex(-1); // Back to new question mode
      }
    } else {
      // Assessment completed
      toast({
        title: "Assessment complete",
        description: "Your risk assessment has been completed successfully.",
      });
      navigate("/");
    }
  };

  const goToSpecificQuestion = (questionIndex: number) => {
    if (questionIndex >= questionFlow.length) return;
    
    // Navigate to the specific question from flow and set navigationIndex
    const targetEntry = questionFlow[questionIndex];
    setCurrentQuestion(targetEntry.question);
    setSelectedAnswer(targetEntry.answer);
    setNavigationIndex(questionIndex);
  };

  const handleAnswerSelect = async (answer: string) => {
    if (loading || isTransitioning) return;
    
    // Check if this is a previously answered question and if the answer would change the flow
    if (navigationIndex !== -1 && currentQuestion) {
      const newSelectedOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === answer
      );
      
      const currentAnswerEntry = questionFlow.find(entry => entry.question.question_id === currentQuestion.question_id);
      const oldSelectedOption = questions.find(
        q => q.question_id === currentQuestion.question_id && q.answer_option === currentAnswerEntry?.answer
      );
      
      // Compare next_question_id to detect flow changes
      if (newSelectedOption && oldSelectedOption && 
          newSelectedOption.next_question_id !== oldSelectedOption.next_question_id) {
        
        // Show confirmation dialog
        setPendingAnswerChange({
          answer,
          newNextQuestionId: newSelectedOption.next_question_id
        });
        setShowFlowChangeDialog(true);
        return;
      }
    }
    
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

      // Check if answer already exists for this question in this session
      const { data: existingAnswer } = await supabase
        .from('atad2_answers')
        .select('id')
        .eq('session_id', sessionId)
        .eq('question_id', currentQuestion.question_id)
        .single();

      if (existingAnswer) {
        // Update existing answer
        const { error } = await supabase
          .from('atad2_answers')
          .update({
            question_text: currentQuestion.question,
            answer: answer,
            explanation: selectedQuestionOption.answer_option,
            risk_points: selectedQuestionOption.risk_points,
            difficult_term: selectedQuestionOption.difficult_term,
            term_explanation: selectedQuestionOption.term_explanation,
            answered_at: new Date().toISOString()
          })
          .eq('id', existingAnswer.id);

        if (error) throw error;
      } else {
        // Insert new answer
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
      }

      // Update or add current question and answer to both history and flow
      const questionEntry = { question: currentQuestion, answer };
      
      setQuestionHistory(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          // Replace existing entry
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          // Add new entry
          return [...prev, questionEntry];
        }
      });
      
      setQuestionFlow(prev => {
        const existingIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        if (existingIndex !== -1) {
          // Replace existing entry
          const updated = [...prev];
          updated[existingIndex] = questionEntry;
          return updated;
        } else {
          // Add new entry
          return [...prev, questionEntry];
        }
      });
      
      setNavigationIndex(-1); // Reset to new question mode
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

  const handleFlowChangeConfirm = async () => {
    if (!pendingAnswerChange || !currentQuestion) return;
    
    setShowFlowChangeDialog(false);
    setLoading(true);

    try {
      // Remove subsequent answers from database
      const currentQuestionIndex = questionFlow.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
      const subsequentQuestions = questionFlow.slice(currentQuestionIndex + 1);
      
      for (const entry of subsequentQuestions) {
        await supabase
          .from('atad2_answers')
          .delete()
          .eq('session_id', sessionId)
          .eq('question_id', entry.question.question_id);
      }

      // Update questionFlow to remove subsequent questions with animation
      setQuestionFlow(prev => {
        const currentIndex = prev.findIndex(entry => entry.question.question_id === currentQuestion.question_id);
        return prev.slice(0, currentIndex + 1);
      });

      // Update answers state
      setAnswers(prev => {
        const newAnswers = { ...prev };
        subsequentQuestions.forEach(entry => {
          delete newAnswers[entry.question.question_id];
        });
        return newAnswers;
      });

      // Now proceed with the answer change
      setSelectedAnswer(pendingAnswerChange.answer);
      
      // Brief visual feedback, then auto-advance
      setTimeout(async () => {
        await submitAnswerDirectly(pendingAnswerChange.answer);
        setPendingAnswerChange(null);
      }, 300);

    } catch (error) {
      console.error('Error handling flow change:', error);
      toast({
        title: "Error",
        description: "Failed to update assessment flow",
        variant: "destructive",
      });
      setLoading(false);
      setPendingAnswerChange(null);
    }
  };

  const handleFlowChangeCancel = () => {
    setShowFlowChangeDialog(false);
    setPendingAnswerChange(null);
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
  
  // Check if we're viewing an already answered question
  const isViewingAnsweredQuestion = navigationIndex !== -1;

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
              questionHistory={questionFlow.map(entry => ({
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
              <div className="max-w-[640px] mx-auto p-6">
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-1">
                  Question {currentQuestion.question_id}
                </div>
                {currentQuestion.question_title && (
                  <h2 className="text-lg md:text-xl font-semibold text-gray-800 mb-4">
                    {currentQuestion.question_title}
                  </h2>
                )}
                <div className="mb-6">
                  <QuestionText 
                    question={currentQuestion.question}
                    difficultTerm={questionWithTerms.difficult_term}
                    termExplanation={questionWithTerms.term_explanation}
                    exampleText={exampleText}
                  />
                </div>
            {isViewingAnsweredQuestion ? (
              /* Viewing a previously answered question - show read-only with continue option */
              <>
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
                          {isSelected && (
                            <span className="ml-auto text-sm text-muted-foreground font-medium">
                              Previously answered
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Continue button for answered questions */}
                <div className="flex items-center gap-3">
                  <Button 
                    onClick={goToPreviousQuestion}
                    disabled={questionFlow.length === 0 || (navigationIndex !== -1 && navigationIndex === 0) || loading || isTransitioning}
                    variant="outline"
                    className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </Button>
                  
                  {/* Next button - only show when reviewing within the flow */}
                  {navigationIndex !== -1 && navigationIndex < questionFlow.length - 1 && (
                    <Button 
                      onClick={goToNextQuestion}
                      disabled={loading || isTransitioning}
                      variant="outline"
                      className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next →
                    </Button>
                  )}
                  
                  {/* Continue to next question */}
                  {navigationIndex === questionFlow.length - 1 && (
                    <Button 
                      onClick={continueToNextUnanswered}
                      disabled={loading || isTransitioning}
                      variant="outline"
                      className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next →
                    </Button>
                  )}
                </div>
              </>
            ) : (
              /* New question - show interactive answer options */
              <>
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
                
                {/* Navigation buttons for new questions */}
                <div className="flex items-center gap-3">
                  <Button 
                    onClick={goToPreviousQuestion}
                    disabled={questionFlow.length === 0 || loading || isTransitioning}
                    variant="outline"
                    className="px-6 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Previous
                  </Button>
                </div>
              </>
            )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Flow Change Confirmation Dialog */}
      <AlertDialog open={showFlowChangeDialog} onOpenChange={setShowFlowChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm change of answer</AlertDialogTitle>
            <AlertDialogDescription>
              Changing this answer will affect the questions that follow. Some of your answers will be removed because the flow continues differently from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleFlowChangeCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFlowChangeConfirm}>Confirm and continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Assessment;
