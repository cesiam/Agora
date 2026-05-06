import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";

export interface ChatMessage {
  id: string;
  speaker: "agent" | "student";
  text: string;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  isThinking: boolean;
}

export function ChatWindow({ messages, isThinking }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 ${msg.speaker === "student" ? "flex-row-reverse" : ""}`}
        >
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.speaker === "agent" ? "bg-primary/10" : "bg-secondary/10"
            }`}
          >
            {msg.speaker === "agent" ? (
              <Bot className="w-4 h-4 text-primary" />
            ) : (
              <User className="w-4 h-4 text-secondary" />
            )}
          </div>
          <div
            className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
              msg.speaker === "agent"
                ? "bg-muted text-foreground rounded-tl-sm"
                : "bg-primary text-primary-foreground rounded-tr-sm"
            }`}
          >
            {msg.text}
          </div>
        </div>
      ))}

      {isThinking && (
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="p-4 rounded-2xl bg-muted rounded-tl-sm">
            <div className="flex gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
