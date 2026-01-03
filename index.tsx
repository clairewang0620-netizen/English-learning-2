
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BookOpen, 
  Headphones, 
  FileText, 
  Volume2, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Mic,
  Play,
  Loader2,
  RefreshCw
} from 'lucide-react';

// --- Types ---

interface Example {
  en: string;
  zh: string;
}

interface Word {
  word: string;
  ipa: string;
  meaning: string;
  examples: Example[];
}

interface VocabularyGroup {
  id: number;
  name: string;
  words: Word[];
}

interface ReadingParagraph {
  en: string;
  zh: string;
}

interface Keyword {
  word: string;
  ipa: string;
  definition: string;
}

interface Article {
  id: string;
  title: string;
  paragraphs: ReadingParagraph[];
  keywords: Keyword[];
}

type Module = 'vocabulary' | 'dictation' | 'reading';

// --- Global Audio Manager ---

class AudioManager {
  private static instance: AudioManager;
  private synth: SpeechSynthesis;

  private constructor() {
    this.synth = window.speechSynthesis;
  }

  static getInstance() {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  stop() {
    this.synth.cancel();
  }

  speak(text: string, lang: 'en-US' | 'zh-CN' = 'en-US') {
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.95;
    utterance.pitch = 1;
    this.synth.speak(utterance);
  }
}

const audioManager = AudioManager.getInstance();

// --- Main Application Component ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('vocabulary');
  const [vocabGroups, setVocabGroups] = useState<VocabularyGroup[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [wrongWords, setWrongWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Load static data with robust path handling
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use absolute-ish paths to ensure root-level fetching on Cloudflare Pages
      // Removing leading dot to handle cases where the site is at a custom domain root
      const paths = ['vocabulary.json', 'reading.json'];
      
      const [vocabRes, articlesRes] = await Promise.all(
        paths.map(path => fetch(path, { cache: 'no-store' }))
      );
      
      if (!vocabRes.ok || !articlesRes.ok) {
        const failed = [];
        if (!vocabRes.ok) failed.push(`vocabulary.json (${vocabRes.status})`);
        if (!articlesRes.ok) failed.push(`reading.json (${articlesRes.status})`);
        throw new Error(`Resource missing: ${failed.join(', ')}. Please ensure JSON files are in the deployment root.`);
      }

      const vocabData = await vocabRes.json();
      const articlesData = await articlesRes.json();
      
      setVocabGroups(vocabData.groups || []);
      setArticles(articlesData || []);

      const savedWrong = localStorage.getItem('lingomaster_wrong');
      if (savedWrong) {
        try {
          setWrongWords(new Set(JSON.parse(savedWrong)));
        } catch (e) {
          console.warn("Local storage corruption, resetting error list.");
        }
      }
      
      setInitialized(true);
    } catch (err: any) {
      console.error("Critical Load Error:", err);
      setError(err.message || "Network Error: Could not reach content servers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem('lingomaster_wrong', JSON.stringify(Array.from(wrongWords)));
  }, [wrongWords, initialized]);

  const toggleWrongWord = (word: string) => {
    setWrongWords(prev => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-emerald-600 animate-spin" />
        </div>
        <p className="mt-6 text-lg font-bold text-slate-800 tracking-tight">Syncing Educational Assets...</p>
        <p className="text-slate-400 text-sm mt-1 italic">Verifying production integrity</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-6 text-center z-[100]">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Content Synchronization Failed</h2>
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-8 max-w-md">
           <p className="text-slate-600 text-sm font-mono break-words">{error}</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button 
            onClick={() => loadData()}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg"
          >
            <RefreshCw className="w-5 h-5" />
            Retry Connection
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="text-slate-400 hover:text-slate-600 text-sm font-bold uppercase tracking-widest"
          >
            Hard Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 md:py-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Lingo<span className="text-emerald-600">Master</span>
            <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded font-black uppercase tracking-widest">Enterprise</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium">Static Distribution Module</p>
        </div>
        
        <nav className="flex gap-1 bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit">
          {[
            { id: 'vocabulary', label: 'Vocab', icon: BookOpen },
            { id: 'dictation', label: 'Dictate', icon: Headphones },
            { id: 'reading', label: 'Read', icon: FileText },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setActiveModule(btn.id as Module)}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all duration-300 ${
                activeModule === btn.id 
                ? 'bg-white text-emerald-700 shadow-md transform scale-[1.02]' 
                : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <btn.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{btn.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 pb-12">
        {activeModule === 'vocabulary' && (
          <VocabularyModule groups={vocabGroups} toggleWrongWord={toggleWrongWord} wrongWords={wrongWords} />
        )}
        {activeModule === 'dictation' && (
          <DictationModule groups={vocabGroups} wrongWords={wrongWords} onToggleWrongWord={toggleWrongWord} />
        )}
        {activeModule === 'reading' && (
          <ReadingModule articles={articles} />
        )}
      </main>
      
      <footer className="py-8 border-t border-slate-100 text-center">
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em]">Build ID: 20250522-DIST-STABLE</p>
      </footer>
    </div>
  );
};

const VocabularyModule = ({ groups, toggleWrongWord, wrongWords }: { groups: VocabularyGroup[], toggleWrongWord: (w: string) => void, wrongWords: Set<string> }) => {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  if (!groups.length) return <div className="text-center py-20 text-slate-400 font-bold italic">No vocabulary units available in current distribution.</div>;

  return (
    <div className="animate-fade-in space-y-16">
      {groups.map((group) => (
        <section key={group.id}>
          <div className="flex items-center gap-4 mb-8">
            <h2 className="text-2xl font-black text-emerald-600 tracking-tighter italic">
              {group.name}
            </h2>
            <div className="h-px flex-1 bg-emerald-100"></div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {group.words.map((word, idx) => (
              <div 
                key={`${group.id}-${idx}`}
                onClick={() => setSelectedWord(word)}
                className="group relative bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm hover:shadow-xl hover:shadow-emerald-900/5 hover:-translate-y-1 transition-all cursor-pointer overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-12 -mt-12 group-hover:scale-110 transition-transform duration-500"></div>
                <div className="relative">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{word.word}</h3>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        audioManager.speak(word.word);
                      }}
                      className="p-2.5 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-600 hover:text-white transition-all transform active:scale-90"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-emerald-500 font-mono text-sm mb-3 font-semibold">{word.ipa}</p>
                  <p className="text-slate-600 font-bold text-lg border-l-4 border-emerald-400 pl-3 leading-tight">{word.meaning}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {selectedWord && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedWord(null)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
            <button 
              onClick={() => setSelectedWord(null)}
              className="absolute top-6 right-6 p-3 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500 z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="overflow-y-auto p-8 md:p-12">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-10">
                <div className="flex-1">
                  <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{selectedWord.word}</h2>
                  <p className="text-2xl text-emerald-600 font-mono font-medium">{selectedWord.ipa}</p>
                </div>
                <button 
                  onClick={() => audioManager.speak(selectedWord.word)}
                  className="w-20 h-20 bg-emerald-600 text-white rounded-[2rem] flex items-center justify-center shadow-xl shadow-emerald-200 hover:scale-105 active:scale-95 transition-all"
                >
                  <Volume2 className="w-10 h-10" />
                </button>
              </div>
              <div className="mb-12">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-black mb-4">Core Definition</p>
                <p className="text-3xl font-black text-slate-800 leading-tight">{selectedWord.meaning}</p>
              </div>
              <div className="space-y-8">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-black">Contextual Usage</p>
                {selectedWord.examples.map((ex, i) => (
                  <div key={i} className="bg-slate-50 p-6 md:p-8 rounded-[2rem] relative group border border-slate-100">
                    <p className="text-slate-800 font-bold text-xl mb-4 leading-relaxed">{ex.en}</p>
                    <div className="h-px w-10 bg-emerald-200 mb-4"></div>
                    <p className="text-slate-500 text-lg font-medium">{ex.zh}</p>
                    <button 
                      onClick={() => audioManager.speak(ex.en)}
                      className="absolute bottom-6 right-6 p-3 bg-white text-emerald-500 shadow-sm rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-12 flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={() => {
                    toggleWrongWord(selectedWord.word);
                    setSelectedWord(null);
                  }}
                  className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${
                    wrongWords.has(selectedWord.word) 
                    ? 'bg-amber-100 text-amber-700 border-2 border-amber-200 shadow-inner' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-2 border-transparent'
                  }`}
                >
                  <AlertCircle className="w-6 h-6" />
                  {wrongWords.has(selectedWord.word) ? 'Unmark Difficulty' : 'Mark as Difficult'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DictationModule = ({ groups, wrongWords, onToggleWrongWord }: { groups: VocabularyGroup[], wrongWords: Set<string>, onToggleWrongWord: (w: string) => void }) => {
  const [selectedGroup, setSelectedGroup] = useState<VocabularyGroup | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showHint, setShowHint] = useState(false);

  const currentWord = selectedGroup?.words[currentIndex];

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentWord || isCorrect !== null) return;
    
    const correct = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setIsCorrect(correct);

    if (!correct) {
      if (!wrongWords.has(currentWord.word)) {
        onToggleWrongWord(currentWord.word);
      }
    }
  };

  const nextWord = () => {
    if (currentIndex < (selectedGroup?.words.length || 0) - 1) {
      setCurrentIndex(prev => prev + 1);
      setInput('');
      setIsCorrect(null);
      setShowHint(false);
    } else {
      setSelectedGroup(null);
      setCurrentIndex(0);
    }
  };

  if (!selectedGroup) {
    return (
      <div className="animate-fade-in space-y-10">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Immersion Training</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map(group => (
            <button 
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className="bg-white border-2 border-slate-100 p-8 rounded-[2.5rem] text-left hover:border-emerald-400 hover:shadow-2xl hover:shadow-emerald-900/5 transition-all flex justify-between items-center group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-all"></div>
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-1">{group.name}</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">{group.words.length} Dynamic Units</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-all">
                <ChevronRight className="w-6 h-6" />
              </div>
            </button>
          ))}
          
          {wrongWords.size > 0 && (
            <button 
              onClick={() => {
                const words: Word[] = [];
                Array.from(wrongWords).forEach(w => {
                  for (const g of groups) {
                    const match = g.words.find(word => word.word === w);
                    if (match) words.push(match);
                  }
                });
                setSelectedGroup({ id: 0, name: 'Focus Review', words });
              }}
              className="bg-amber-50 border-2 border-amber-200 p-8 rounded-[2.5rem] text-left hover:shadow-2xl hover:shadow-amber-900/5 transition-all flex justify-between items-center group"
            >
              <div>
                <h3 className="text-2xl font-black text-amber-700 tracking-tight mb-1">Error Analysis</h3>
                <p className="text-amber-600/70 font-bold uppercase tracking-widest text-[10px]">{wrongWords.size} Priority Replays</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 md:py-12 animate-fade-in">
      <div className="flex justify-between items-center mb-10">
        <button 
          onClick={() => setSelectedGroup(null)} 
          className="text-slate-400 hover:text-slate-600 flex items-center gap-2 font-black uppercase tracking-widest text-[11px]"
        >
          <ChevronLeft className="w-5 h-5" /> Quit Training
        </button>
        <div className="flex gap-1.5">
          {selectedGroup.words.map((_, i) => (
            <div 
              key={i} 
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i === currentIndex ? 'w-8 bg-emerald-600' : 
                i < currentIndex ? 'w-4 bg-emerald-200' : 'w-4 bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[3.5rem] shadow-2xl p-10 md:p-16 border border-slate-100 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-slate-50">
          <div 
            className="h-full bg-emerald-500 transition-all duration-700" 
            style={{ width: `${((currentIndex + 1) / selectedGroup.words.length) * 100}%` }}
          />
        </div>

        <button 
          onClick={() => audioManager.speak(currentWord?.word || '')}
          className="w-32 h-32 bg-emerald-600 text-white rounded-[2.5rem] mx-auto mb-10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-200"
        >
          <Volume2 className="w-14 h-14" />
        </button>

        <form onSubmit={handleSubmit} className="space-y-8">
          <input 
            autoFocus
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Listen & Type..."
            className={`w-full text-center text-4xl font-black py-6 bg-slate-50 border-4 rounded-3xl outline-none transition-all placeholder:text-slate-200 ${
              isCorrect === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-inner' :
              isCorrect === false ? 'border-red-500 bg-red-50 text-red-700 shadow-inner' :
              'border-slate-100 focus:border-emerald-400 focus:bg-white'
            }`}
            disabled={isCorrect !== null}
          />

          {isCorrect === null ? (
            <button 
              type="submit"
              className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black text-xl hover:bg-slate-800 transition-all shadow-xl active:scale-[0.98]"
            >
              Verify Response
            </button>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {isCorrect ? (
                <div className="text-emerald-600 flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <p className="text-2xl font-black tracking-tight">System Validated</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-red-600 font-black text-2xl tracking-tight">Incorrect Sequence</p>
                  <div className="bg-slate-50 p-6 rounded-2xl inline-block border-2 border-slate-100">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-black mb-2">Target Spelling</p>
                    <p className="text-4xl font-black text-slate-800 uppercase tracking-[0.15em]">{currentWord?.word}</p>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4 pt-6">
                <button 
                  type="button"
                  onClick={() => {
                    if (currentWord) onToggleWrongWord(currentWord.word);
                  }}
                  className={`py-5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                    wrongWords.has(currentWord?.word || '') 
                    ? 'bg-amber-100 text-amber-700 border-2 border-amber-200' 
                    : 'bg-slate-100 text-slate-600 border-2 border-transparent'
                  }`}
                >
                   {wrongWords.has(currentWord?.word || '') ? 'Mark Solved' : 'Add to Errors'}
                </button>
                <button 
                  type="button"
                  onClick={nextWord}
                  className="bg-emerald-600 text-white py-5 rounded-2xl font-black text-sm hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                >
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </form>

        <button 
          onClick={() => setShowHint(!showHint)}
          className="mt-12 text-slate-400 hover:text-slate-600 flex items-center gap-2 mx-auto text-[10px] font-black uppercase tracking-[0.3em]"
        >
          {showHint ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showHint ? 'Conceal Data' : 'Reveal Definition'}
        </button>
        {showHint && (
          <p className="mt-6 text-2xl font-black text-emerald-600 animate-fade-in px-6">
            {currentWord?.meaning}
          </p>
        )}
      </div>
    </div>
  );
};

const ReadingModule = ({ articles }: { articles: Article[] }) => {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showChinese, setShowChinese] = useState<Record<number, boolean>>({});
  const [recording, setRecording] = useState<number | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const toggleChinese = (idx: number) => {
    setShowChinese(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const startRecording = async (idx: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.current.start();
      setRecording(idx);
    } catch (err) {
      alert("Microphone integration required for Shadow Reading.");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(null);
  };

  if (!selectedArticle) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
        {articles.map(article => (
          <div 
            key={article.id}
            className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer group flex flex-col h-full"
            onClick={() => setSelectedArticle(article)}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-6">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Premium Reader</span>
              </div>
              <h3 className="text-3xl font-serif font-bold text-slate-900 leading-tight group-hover:text-blue-600 transition-colors mb-4">{article.title}</h3>
              <p className="text-slate-500 line-clamp-3 leading-relaxed text-lg italic font-serif">
                "{article.paragraphs[0].en}"
              </p>
            </div>
            <button className="mt-8 w-full bg-slate-50 text-slate-900 group-hover:bg-blue-600 group-hover:text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
              Launch Reading Room
            </button>
          </div>
        ))}
        {!articles.length && <div className="col-span-full text-center py-20 text-slate-400 font-bold">No articles loaded.</div>}
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20 max-w-4xl mx-auto">
      <button 
        onClick={() => { setSelectedArticle(null); setAudioUrl(null); }}
        className="mb-12 flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black uppercase tracking-widest text-[11px] transition-colors"
      >
        <ChevronLeft className="w-5 h-5" /> Library Archive
      </button>

      <header className="mb-20 text-center relative px-6">
        <div className="inline-block bg-blue-50 text-blue-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] mb-6 shadow-sm border border-blue-100">
          Executive Digest
        </div>
        <h2 className="text-5xl md:text-7xl font-serif font-bold text-slate-900 mb-8 leading-[1.1] tracking-tight italic">
          {selectedArticle.title}
        </h2>
        <div className="flex justify-center items-center gap-10 border-y border-slate-100 py-8">
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Language</p>
              <p className="text-xl font-black text-slate-800 tracking-tighter">EN-CN</p>
           </div>
           <div className="w-px h-10 bg-slate-100" />
           <div className="text-center">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Lexicon</p>
              <p className="text-xl font-black text-slate-800 tracking-tighter">{selectedArticle.keywords.length} Key Terms</p>
           </div>
        </div>
      </header>

      <div className="space-y-24">
        {selectedArticle.paragraphs.map((p, idx) => (
          <div key={idx} className="group relative">
            <div className="flex flex-col md:flex-row items-start gap-8">
              <div className="flex md:flex-col gap-3 shrink-0">
                <button 
                  onClick={() => audioManager.speak(p.en)}
                  className="p-4 bg-white text-slate-400 border border-slate-100 rounded-[1.5rem] hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm active:scale-90"
                  title="Listen"
                >
                  <Volume2 className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => recording === idx ? stopRecording() : startRecording(idx)}
                  className={`p-4 rounded-[1.5rem] transition-all shadow-sm active:scale-90 ${recording === idx ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-slate-400 border border-slate-100 hover:bg-slate-900 hover:text-white'}`}
                  title="Shadow Reading"
                >
                  <Mic className="w-6 h-6" />
                </button>
                {audioUrl && recording === null && (
                  <button 
                    onClick={() => {
                      const audio = new Audio(audioUrl);
                      audio.play();
                    }}
                    className="p-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-[1.5rem] hover:bg-emerald-600 hover:text-white transition-all shadow-sm active:scale-90"
                    title="Review My Playback"
                  >
                    <Play className="w-6 h-6" />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <p className="text-2xl md:text-3xl leading-[1.6] text-slate-800 font-serif mb-8 selection:bg-blue-100">
                  {p.en}
                </p>
                {showChinese[idx] && (
                  <p className="text-xl md:text-2xl leading-relaxed text-slate-500 bg-[#f8fafc] p-8 md:p-12 rounded-[2.5rem] border-l-8 border-blue-500 animate-fade-in font-medium">
                    {p.zh}
                  </p>
                )}
                <button 
                  onClick={() => toggleChinese(idx)}
                  className="text-[11px] font-black text-blue-600 uppercase tracking-[0.3em] hover:text-blue-800 mt-6 flex items-center gap-2 group/btn"
                >
                  <div className="h-0.5 w-6 bg-blue-600 group-hover/btn:w-10 transition-all"></div>
                  {showChinese[idx] ? 'Conceal Translation' : 'View Translation'}
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="h-px bg-slate-200" />

        <section className="bg-slate-900 text-white p-12 md:p-20 rounded-[4rem]">
          <h3 className="text-4xl font-black tracking-tighter mb-12 flex items-center gap-4">
            Glossary & Insights
            <div className="h-px flex-1 bg-slate-800"></div>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {selectedArticle.keywords.map((kw, i) => (
              <div key={i} className="bg-slate-800 p-8 rounded-[2.5rem] border border-slate-700 hover:border-blue-500 transition-colors group">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-2xl font-black tracking-tight">{kw.word}</h4>
                  <button onClick={() => audioManager.speak(kw.word)} className="text-slate-500 hover:text-white transition-colors">
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-blue-400 font-mono text-sm mb-4 font-bold">{kw.ipa}</p>
                <p className="text-slate-300 font-medium text-lg border-l-2 border-blue-500 pl-4">{kw.definition}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

// --- Mount App ---

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
