import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Send, RotateCcw, Music, Lightbulb, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TRACKS = [
  { title: "AI Lofi Study", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { title: "Neural Chillhop", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "Synthetic Acoustic", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
];

const parseJSON = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (match) {
      return JSON.parse(match[1]);
    }
    throw e;
  }
};

type GameState = 'idle' | 'playing' | 'won' | 'lost';
type Message = { role: 'user' | 'model', text: string };

export default function App() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [secret, setSecret] = useState<{ category: string, name: string } | null>(null);
  const [questionsLeft, setQuestionsLeft] = useState(10);
  const [history, setHistory] = useState<Message[]>([]);
  const [score, setScore] = useState(0);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [hintRevealed, setHintRevealed] = useState(0);
  
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Music Player State
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current && isPlaying) {
      audioRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  }, [currentTrack]);

  useEffect(() => {
    if (gameState !== 'playing' || isLoading) return;
    
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameState('lost');
          setHistory(h => [...h, { role: 'model', text: `Time's up! The correct answer was ${secret?.name}.` }]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, isLoading, secret]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("Audio play failed", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const nextTrack = () => {
    setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
    setIsPlaying(true);
  };

  const prevTrack = () => {
    setCurrentTrack((prev) => (prev - 1 + TRACKS.length) % TRACKS.length);
    setIsPlaying(true);
  };

  const stopGame = () => {
    setGameState('idle');
    setHistory([]);
    setSecret(null);
    setTimeLeft(60);
    setHintRevealed(0);
    setIsLoading(false);
    setInputText('');
  };

  const startGame = async () => {
    setIsLoading(true);
    setGameState('idle');
    setHistory([]);
    setSecret(null);
    setTimeLeft(60);
    setHintRevealed(0);
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Generate a random famous person, place, or object. Return ONLY a JSON object with two fields: "category" (Person, Place, or Object) and "name" (the actual name). Do not include markdown formatting.',
        config: { responseMimeType: 'application/json' }
      });
      
      const generatedSecret = parseJSON(response.text);
      setSecret(generatedSecret);
      
      chatRef.current = ai.chats.create({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: `You are the host of a 10-questions guessing game. The secret answer is "${generatedSecret.name}" (Category: ${generatedSecret.category}).
The user will ask yes/no questions to guess the answer.
You must respond in JSON format with the following schema:
{
  "answer": "Your yes/no/maybe answer, or response to a guess",
  "isCorrectGuess": boolean
}
If the user correctly guesses "${generatedSecret.name}", set isCorrectGuess to true. Otherwise, set it to false.
Do not reveal the answer unless the user explicitly gives up. Keep your "answer" string concise.`,
          responseMimeType: 'application/json'
        }
      });

      setGameState('playing');
      setQuestionsLeft(10);
      setHistory([{ role: 'model', text: `I have chosen a ${generatedSecret.category}. You have 10 questions to guess what it is!` }]);
    } catch (error) {
      console.error("Error starting game:", error);
      setHistory([{ role: 'model', text: "Failed to start the game. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || gameState !== 'playing' || isLoading || timeLeft <= 0) return;

    const userMsg = inputText.trim();
    setInputText('');
    setHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await chatRef.current.sendMessage({ message: userMsg });
      const result = parseJSON(response.text);
      
      const newQuestionsLeft = questionsLeft - 1;
      setQuestionsLeft(newQuestionsLeft);

      if (result.isCorrectGuess) {
        setGameState('won');
        setScore(s => s + 1);
        setHistory(prev => [...prev, { role: 'model', text: result.answer + ` The answer was indeed ${secret?.name}!` }]);
      } else if (newQuestionsLeft <= 0) {
        setGameState('lost');
        setHistory(prev => [...prev, { role: 'model', text: result.answer + ` Game over! The correct answer was ${secret?.name}.` }]);
      } else {
        setHistory(prev => [...prev, { role: 'model', text: result.answer }]);
      }
    } catch (error) {
      console.error("Error communicating with AI:", error);
      setHistory(prev => [...prev, { role: 'model', text: "Sorry, I had trouble processing that. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const nonSpaceLength = secret ? secret.name.replace(/ /g, '').length : 0;
  const maxHintLength = Math.max(1, Math.floor(nonSpaceLength / 2));

  const handleHintClick = () => {
    if (gameState !== 'playing' || !secret) return;
    if (hintRevealed < maxHintLength) {
      setHintRevealed(prev => prev + 1);
    }
  };

  const renderHint = () => {
    if (!secret || hintRevealed === 0) return null;
    
    let revealedCount = 0;
    const hintText = secret.name.split('').map((char) => {
      if (char === ' ') return ' ';
      if (revealedCount < hintRevealed) {
        revealedCount++;
        return char;
      }
      return '_';
    }).join(' ');

    return (
      <motion.div 
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-mono text-xs tracking-widest uppercase text-brown-500 mb-3 ml-4"
      >
        HINT: {hintText}
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-beige-300 selection:text-brown-900">
      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-8 flex justify-between items-center shrink-0">
        <h1 className="font-serif text-3xl tracking-wide text-brown-900">Acoustic Guesser</h1>
        <div className="font-mono text-sm tracking-widest uppercase text-brown-600 bg-beige-200 px-4 py-2 rounded-full">
          Score: {score}
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 flex flex-col justify-center relative overflow-hidden">
        
        {/* Game Status Bar */}
        <div className="flex justify-between items-end mb-6 px-2">
          <div className="font-mono text-xs tracking-widest uppercase text-brown-500 flex items-center gap-6">
            {gameState === 'idle' && <span>{isLoading ? 'Initializing...' : 'Ready to play'}</span>}
            {gameState === 'playing' && (
              <>
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brown-500 animate-pulse"></span>
                  Q's left: {questionsLeft}
                </span>
                <span className={`flex items-center gap-2 transition-colors ${timeLeft <= 10 ? 'text-red-800 font-bold' : ''}`}>
                  ⏱ {timeLeft}s
                </span>
              </>
            )}
            {gameState === 'won' && <span className="text-brown-900 font-medium">🎉 You Won!</span>}
            {gameState === 'lost' && (
              <span className="text-brown-900 font-medium flex items-center gap-2">
                <motion.span 
                  animate={{ scale: [1, 1.4, 1] }} 
                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                  className="inline-block origin-center text-lg"
                >
                  💀
                </motion.span>
                Game Over
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {gameState === 'playing' && (
              <button 
                onClick={handleHintClick}
                disabled={hintRevealed >= maxHintLength}
                className="w-10 h-10 flex items-center justify-center rounded-full text-brown-500 hover:bg-beige-200 hover:text-brown-900 transition-colors disabled:opacity-30"
                title="Get a hint"
              >
                <Lightbulb size={18} />
              </button>
            )}
            {gameState !== 'idle' && (
              <>
                <button 
                  onClick={stopGame} 
                  className="w-10 h-10 flex items-center justify-center rounded-full text-brown-600 hover:bg-beige-200 hover:text-brown-900 transition-colors" 
                  title="Stop Game"
                >
                  <Square size={16} fill="currentColor" />
                </button>
                <button 
                  onClick={startGame} 
                  disabled={isLoading}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-brown-600 hover:bg-beige-200 hover:text-brown-900 transition-colors disabled:opacity-30" 
                  title="Restart Game"
                >
                  <RotateCcw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-6 scrollbar-hide relative">
          {gameState === 'idle' && !isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
              <div className="w-20 h-20 bg-beige-200 rounded-full flex items-center justify-center text-brown-500 mb-2">
                <Lightbulb size={32} />
              </div>
              <h2 className="font-serif text-2xl text-brown-900">Ready to guess?</h2>
              <button 
                onClick={startGame}
                className="flex items-center gap-2 bg-brown-500 text-beige-50 px-8 py-4 rounded-full hover:bg-brown-600 transition-all hover:scale-105 active:scale-95 shadow-sm font-medium tracking-wide"
              >
                <Play size={18} fill="currentColor" />
                Play Game
              </button>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {history.map((msg, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[85%] px-6 py-4 text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-brown-500 text-beige-50 rounded-2xl rounded-tr-sm' 
                    : 'bg-beige-200 text-brown-900 rounded-2xl rounded-tl-sm'
                }`}>
                  {msg.text}
                </div>
              </motion.div>
            ))}
            {isLoading && gameState !== 'idle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start"
              >
                <div className="bg-beige-200 text-brown-900 px-6 py-5 rounded-2xl rounded-tl-sm shadow-sm flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 bg-brown-500 rounded-full animate-bounce"></span>
                  <span className="w-1.5 h-1.5 bg-brown-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-1.5 h-1.5 bg-brown-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input Area */}
        <div className="pt-4 pb-8 shrink-0">
          {renderHint()}
          <form onSubmit={handleSendMessage} className="relative flex items-center">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={gameState !== 'playing' || isLoading}
              placeholder={gameState === 'playing' ? "Ask a yes/no question..." : "Click restart to play again"}
              className="w-full bg-beige-50 border border-beige-300 text-brown-900 placeholder:text-brown-400 rounded-full pl-6 pr-16 py-4 focus:outline-none focus:border-brown-500 focus:ring-1 focus:ring-brown-500 shadow-sm transition-all disabled:opacity-60 disabled:bg-beige-200"
            />
            <button 
              type="submit"
              disabled={gameState !== 'playing' || isLoading || !inputText.trim()}
              className="absolute right-2 w-10 h-10 flex items-center justify-center bg-brown-500 text-beige-50 rounded-full hover:bg-brown-600 transition-colors disabled:opacity-0 disabled:scale-90 duration-200"
            >
              <Send size={18} className="ml-0.5" />
            </button>
          </form>
        </div>
      </main>

      {/* Music Player */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-6 flex items-center justify-between border-t border-beige-300/50 shrink-0">
        <div className="flex items-center gap-4 w-1/3">
          <div className="w-10 h-10 bg-beige-200 rounded-full flex items-center justify-center shrink-0">
            <Music size={18} className="text-brown-600" />
          </div>
          <div className="truncate">
            <div className="font-serif text-base text-brown-900 truncate">{TRACKS[currentTrack].title}</div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-brown-500">AI Generated Audio</div>
          </div>
        </div>

        <div className="flex items-center gap-8 w-1/3 justify-center">
          <button onClick={prevTrack} className="text-brown-500 hover:text-brown-900 transition-colors p-2">
            <SkipBack size={20} />
          </button>
          <button 
            onClick={togglePlay} 
            className="w-12 h-12 bg-beige-200 text-brown-900 rounded-full flex items-center justify-center hover:bg-beige-300 transition-colors shrink-0 shadow-sm"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-1" />}
          </button>
          <button onClick={nextTrack} className="text-brown-500 hover:text-brown-900 transition-colors p-2">
            <SkipForward size={20} />
          </button>
        </div>

        <div className="flex items-center gap-4 w-1/3 justify-end">
          <button onClick={() => setIsMuted(!isMuted)} className="text-brown-500 hover:text-brown-900 transition-colors p-2">
            {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input 
            type="range" 
            min="0" max="1" step="0.01" 
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(parseFloat(e.target.value));
              setIsMuted(false);
            }}
            className="w-24 accent-brown-500 h-1 bg-beige-300 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <audio 
          ref={audioRef} 
          src={TRACKS[currentTrack].url} 
          onEnded={nextTrack}
        />
      </footer>
    </div>
  );
}
