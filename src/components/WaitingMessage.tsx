import { useState, useEffect } from 'react';

interface WaitingMessageProps {
  className?: string;
}

const WaitingMessage = ({ className = '' }: WaitingMessageProps) => {
  const messages = [
    "This may take a few minutes…",
    "Usually I fix this in about 2 minutes.",
    "Please note I'm just an AI model: I try my best, but may not be 100% accurate.",
    "Always review and edit before sharing with the client.",
    "Good things take time… generating your memo now.",
    "Almost there, polishing the details.",
    "Remember: you remain the tax expert in the loop.",
    "Double-check before you hit send: better safe than sorry."
  ];

  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      // Start fade out
      setIsVisible(false);
      
      // After fade out completes, change message and fade in
      setTimeout(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % messages.length);
        setIsVisible(true);
      }, 300); // Match the fade-out duration
    }, 6000); // Change every 6 seconds

    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <p 
      className={`text-sm text-muted-foreground transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {messages[currentMessageIndex]}
    </p>
  );
};

export default WaitingMessage;