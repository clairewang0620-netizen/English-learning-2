
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BookOpen, 
  Headphones, 
  FileText, 
  Volume2, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Eye,
  EyeOff,
  Mic,
  Play,
  RotateCcw,
  Search,
  Loader2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Constants ---

interface Example {
  en: string;
  zh: string;
}

interface Word {
  id: string;
  word: string;
  ipa: string;
  definition: string;
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
  definition: string;
  ipa: string;
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
  private currentUtterance: SpeechSynthesisUtterance | null = null;
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
    this.currentUtterance = null;
  }

  speak(text: string, lang: 'en-US' | 'zh-CN' = 'en-US') {
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }
}

const audioManager = AudioManager.getInstance();

// --- Gemini Service ---

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const VOCAB_PROMPT = `Generate exactly 20 unique English vocabulary words suitable for CET-4/6 and Business English levels. 
Each word must be its lemma (base form). 
For each word, provide:
1. The English word.
2. IPA phonetic transcription.
3. Accurate Chinese meaning (real translation, no explanations like "this word means...").
4. Exactly 2 natural usage example sentences (Business/Daily/News context). 
   - Forbidden: Explaining the word itself (e.g., do not say "The word X is important").
   - Each example must have an English sentence and its Chinese translation.
DO NOT use placeholders like "Key Term", "Dimension", or meta-commentary.
Output ONLY JSON in the requested format.`;

const READING_PROMPT = `Generate a high-quality "Selected Reading" article in the style of The Economist or TIME.
Topic should be related to technology, economy, or culture.
Structure:
- Title
- 4 to 6 paragraphs.
- Each paragraph must have an English version and a precise Chinese translation.
- Extract 8-10 keywords/phrases from the article with their IPA and Chinese meaning.
Words in this article and keywords MUST be unique and not repeat common vocabulary words.
Output ONLY JSON.`;

const vocabSchema = {
  type: Type.OBJECT,
  properties: {
    words: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          ipa: { type: Type.STRING },
          definition: { type: Type.STRING },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING },
                zh: { type: Type.STRING }
              },
              required: ['en', 'zh']
            }
          }
        },
        required: ['word', 'ipa', 'definition', 'examples']
      }
    }
  },
  required: ['words']
};

const articleSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    paragraphs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          zh: { type: Type.STRING }
        },
        required: ['en', 'zh']
      }
    },
    keywords: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          ipa: { type: Type.STRING },
          definition: { type: Type.STRING }
        },
        required: ['word', 'ipa', 'definition']
      }
    }
  },
  required: ['title', 'paragraphs', 'keywords']
};

// --- Main Application Component ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('vocabulary');
  const [vocabGroups, setVocabGroups] = useState<VocabularyGroup[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [wrongWords, setWrongWords] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize data
  useEffect(() => {
    const savedVocab = localStorage.getItem('lingomaster_vocab');
    const savedWrong = localStorage.getItem('lingomaster_wrong');
    const savedArticles = localStorage.getItem('lingomaster_articles');

    if (savedVocab) setVocabGroups(JSON.parse(savedVocab));
    if (savedWrong) setWrongWords(new Set(JSON.parse(savedWrong)));
    if (savedArticles) setArticles(JSON.parse(savedArticles));
    
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem('lingomaster_vocab', JSON.stringify(vocabGroups));
    localStorage.setItem('lingomaster_wrong', JSON.stringify(Array.from(wrongWords)));
    localStorage.setItem('lingomaster_articles', JSON.stringify(articles));
  }, [vocabGroups, wrongWords, articles, initialized]);

  const generateVocabGroup = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: VOCAB_PROMPT }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: vocabSchema
        }
      });
      
      const data = JSON.parse(response.text);
      const newGroup: VocabularyGroup = {
        id: vocabGroups.length + 1,
        name: `GROUP ${vocabGroups.length + 1}`,
        words: data.words.map((w: any, idx: number) => ({ ...w, id: `${vocabGroups.length + 1}-${idx}` }))
      };

      setVocabGroups(prev => [...prev, newGroup]);
    } catch (error) {
      console.error("Failed to generate vocab:", error);
      alert("Error generating content. Please check your network or API key.");
    } finally {
      setLoading(false);
    }
  };

  const generateArticle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ parts: [{ text: READING_PROMPT }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: articleSchema
        }
      });
      
      const data = JSON.parse(response.text);
      const newArticle: Article = { ...data, id: Date.now().toString() };
      setArticles(prev => [newArticle, ...prev]);
    } catch (error) {
      console.error("Failed to generate article:", error);
      alert("Error generating content.");
    } finally {
      setLoading(false);
    }
  };

  const toggleWrongWord = (word: string) => {
    setWrongWords(prev => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Lingo<span className="text-emerald-600">Master</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium">Advanced English Learning Platform</p>
        </div>
        <div className="flex gap-2">
          {activeModule === 'vocabulary' && (
            <button 
              onClick={generateVocabGroup}
              disabled={loading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              New Group
            </button>
          )}
          {activeModule === 'reading' && (
            <button 
              onClick={generateArticle}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Fetch Article
            </button>
          )}
        </div>
      </header>

      <nav className="flex gap-1 mb-8 bg-slate-200/50 p-1 rounded-xl w-fit self-center">
        {[
          { id: 'vocabulary', label: 'Vocabulary', icon: BookOpen },
          { id: 'dictation', label: 'Dictation', icon: Headphones },
          { id: 'reading', label: 'Reading', icon: FileText },
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => setActiveModule(btn.id as Module)}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all ${
              activeModule === btn.id 
              ? 'bg-white text-emerald-700 shadow-sm' 
              : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <btn.icon className="w-4 h-4" />
            {btn.label}
          </button>
        ))}
      </nav>

      <main className="flex-1">
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
      
      {loading && !vocabGroups.length && !articles.length && (
        <div className="fixed inset-0 glass z-50 flex flex-col items-center justify-center">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
          <p className="text-xl font-bold text-slate-800">Generating Content...</p>
          <p className="text-slate-500">Crafting high-quality learning material with AI</p>
        </div>
      )}
    </div>
  );
};

// --- Sub-Modules ---

const VocabularyModule = ({ groups, toggleWrongWord, wrongWords }: { groups: VocabularyGroup[], toggleWrongWord: (w: string) => void, wrongWords: Set<string> }) => {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  if (groups.length === 0) return <EmptyState type="vocabulary" />;

  return (
    <div className="animate-fade-in space-y-12 pb-20">
      {groups.map((group) => (
        <section key={group.id}>
          <h2 className="text-xl font-bold text-emerald-600 mb-6 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-emerald-600 rounded-full"></span>
            {group.name}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.words.map((word) => (
              <div 
                key={word.id}
                onClick={() => setSelectedWord(word)}
                className="group relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-xl font-bold text-slate-800">{word.word}</h3>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      audioManager.speak(word.word);
                    }}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-colors"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-400 font-mono text-sm mb-2">{word.ipa}</p>
                <p className="text-slate-600 font-medium">{word.definition}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Detail Overlay */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedWord(null)} />
          <div className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-fade-in">
            <button 
              onClick={() => setSelectedWord(null)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="p-8">
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-4xl font-bold text-slate-900">{selectedWord.word}</h2>
                <button 
                  onClick={() => audioManager.speak(selectedWord.word)}
                  className="p-3 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all"
                >
                  <Volume2 className="w-6 h-6" />
                </button>
              </div>
              <p className="text-emerald-600 font-mono text-lg mb-4">{selectedWord.ipa}</p>
              <div className="h-px bg-slate-100 mb-6" />
              
              <div className="mb-8">
                <p className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-2">Meaning</p>
                <p className="text-2xl font-bold text-slate-800">{selectedWord.definition}</p>
              </div>

              <div className="space-y-6">
                <p className="text-sm uppercase tracking-wider text-slate-400 font-bold mb-2">Examples</p>
                {selectedWord.examples.map((ex, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl relative group">
                    <p className="text-slate-800 font-medium mb-1 leading-relaxed">{ex.en}</p>
                    <p className="text-slate-500 text-sm">{ex.zh}</p>
                    <button 
                      onClick={() => audioManager.speak(ex.en)}
                      className="absolute top-4 right-4 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={() => {
                    toggleWrongWord(selectedWord.word);
                    setSelectedWord(null);
                  }}
                  className={`flex-1 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    wrongWords.has(selectedWord.word) 
                    ? 'bg-amber-50 text-amber-600 border border-amber-200' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <AlertCircle className="w-5 h-5" />
                  {wrongWords.has(selectedWord.word) ? 'In Wrong Words' : 'Add to Wrong Words'}
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
  const [sessionResults, setSessionResults] = useState<{word: string, correct: boolean}[]>([]);

  const currentWord = selectedGroup?.words[currentIndex];

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentWord) return;
    
    const correct = input.trim().toLowerCase() === currentWord.word.toLowerCase();
    setIsCorrect(correct);
    setSessionResults(prev => [...prev, { word: currentWord.word, correct }]);

    if (!correct) {
      onToggleWrongWord(currentWord.word);
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
      <div className="animate-fade-in space-y-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-8">Choose a session to practice</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(group => (
            <button 
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className="bg-white border border-slate-200 p-6 rounded-2xl text-left hover:border-emerald-400 hover:shadow-md transition-all flex justify-between items-center group"
            >
              <div>
                <h3 className="text-xl font-bold text-slate-800">{group.name}</h3>
                <p className="text-slate-500">{group.words.length} Words</p>
              </div>
              <ChevronRight className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </button>
          ))}
          {wrongWords.size > 0 && (
            <button 
              onClick={() => {
                const words = Array.from(wrongWords).map(w => {
                  for (const g of groups) {
                    const match = g.words.find(word => word.word === w);
                    if (match) return match;
                  }
                  return null;
                }).filter(Boolean) as Word[];
                setSelectedGroup({ id: 0, name: '错词集 (Wrong Words)', words });
              }}
              className="bg-amber-50 border border-amber-200 p-6 rounded-2xl text-left hover:shadow-md transition-all flex justify-between items-center group"
            >
              <div>
                <h3 className="text-xl font-bold text-amber-700">错词集</h3>
                <p className="text-amber-600/70">{wrongWords.size} Words needing review</p>
              </div>
              <AlertCircle className="text-amber-400" />
            </button>
          )}
        </div>
        {groups.length === 0 && <EmptyState type="dictation" />}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-12 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <button onClick={() => setSelectedGroup(null)} className="text-slate-400 hover:text-slate-600 flex items-center gap-1 font-medium">
          <ChevronLeft className="w-4 h-4" /> Exit
        </button>
        <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
          {currentIndex + 1} / {selectedGroup.words.length}
        </span>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-10 border border-slate-100 text-center">
        <button 
          onClick={() => audioManager.speak(currentWord?.word || '')}
          className="w-24 h-24 bg-emerald-600 text-white rounded-full mx-auto mb-8 flex items-center justify-center hover:scale-105 transition-transform shadow-xl shadow-emerald-200"
        >
          <Volume2 className="w-10 h-10" />
        </button>

        <form onSubmit={handleSubmit} className="space-y-6">
          <input 
            autoFocus
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type what you hear..."
            className={`w-full text-center text-3xl font-bold py-4 bg-slate-50 border-2 rounded-2xl outline-none transition-all ${
              isCorrect === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
              isCorrect === false ? 'border-red-500 bg-red-50 text-red-700' :
              'border-slate-200 focus:border-emerald-500 focus:bg-white'
            }`}
            disabled={isCorrect !== null}
          />

          {isCorrect === null ? (
            <button 
              type="submit"
              className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              Check Spelling
            </button>
          ) : (
            <div className="space-y-4 animate-fade-in">
              {isCorrect ? (
                <div className="text-emerald-600 flex items-center justify-center gap-2 font-bold text-xl">
                  <CheckCircle2 className="w-6 h-6" /> Correct!
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-red-600 font-bold text-xl">Incorrect</p>
                  <p className="text-slate-400">The correct spelling is:</p>
                  <p className="text-3xl font-bold text-slate-800 uppercase tracking-widest">{currentWord?.word}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => onToggleWrongWord(currentWord?.word || '')}
                  className={`py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                    wrongWords.has(currentWord?.word || '') 
                    ? 'bg-amber-100 text-amber-700' 
                    : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {wrongWords.has(currentWord?.word || '') ? 'In Error List' : 'Add to Errors'}
                </button>
                <button 
                  type="button"
                  onClick={nextWord}
                  className="bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  Next Word <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </form>

        <button 
          onClick={() => setShowHint(!showHint)}
          className="mt-10 text-slate-400 hover:text-slate-600 flex items-center gap-2 mx-auto text-sm font-semibold uppercase tracking-wider"
        >
          {showHint ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showHint ? 'Hide Hint' : 'Show Chinese Hint'}
        </button>
        {showHint && (
          <p className="mt-4 text-2xl font-bold text-emerald-600 animate-fade-in">
            {currentWord?.definition}
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
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.current.start();
      setRecording(idx);
      setAudioUrl(null);
    } catch (err) {
      alert("Microphone access denied or not available.");
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(null);
  };

  if (articles.length === 0) return <EmptyState type="reading" />;

  if (!selectedArticle) {
    return (
      <div className="grid grid-cols-1 gap-6 animate-fade-in">
        {articles.map(article => (
          <div 
            key={article.id}
            className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all cursor-pointer group"
            onClick={() => setSelectedArticle(article)}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-serif font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">{article.title}</h3>
              <button className="whitespace-nowrap bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wider transition-all hover:bg-blue-600 hover:text-white">
                阅读全文
              </button>
            </div>
            <p className="text-slate-500 line-clamp-2 leading-relaxed mb-4">
              {article.paragraphs[0].en}
            </p>
            <div className="flex gap-2">
              {article.keywords.slice(0, 3).map((k, i) => (
                <span key={i} className="bg-slate-100 text-slate-500 px-2 py-1 rounded text-xs font-bold">{k.word}</span>
              ))}
              <span className="text-slate-300 text-xs font-bold pt-1">+{article.keywords.length - 3} keywords</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20">
      <button 
        onClick={() => { setSelectedArticle(null); setAudioUrl(null); }}
        className="mb-8 flex items-center gap-1 text-slate-400 hover:text-slate-600 font-bold transition-colors"
      >
        <ChevronLeft className="w-5 h-5" /> Back to Library
      </button>

      <header className="mb-12 text-center max-w-3xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-serif font-bold text-slate-900 mb-6 leading-tight italic">
          {selectedArticle.title}
        </h2>
        <div className="flex justify-center gap-4 border-y border-slate-100 py-6">
           <div className="text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Length</p>
              <p className="text-lg font-bold text-slate-700">~5 mins</p>
           </div>
           <div className="w-px bg-slate-100" />
           <div className="text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Keywords</p>
              <p className="text-lg font-bold text-slate-700">{selectedArticle.keywords.length}</p>
           </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto space-y-12">
        {selectedArticle.paragraphs.map((p, idx) => (
          <div key={idx} className="group relative">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex flex-col gap-2 mt-1">
                <button 
                  onClick={() => audioManager.speak(p.en)}
                  className="p-2 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                  title="Listen"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => recording === idx ? stopRecording() : startRecording(idx)}
                  className={`p-2 rounded-full transition-all shadow-sm ${recording === idx ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  title="Shadow Reading"
                >
                  <Mic className="w-5 h-5" />
                </button>
                {audioUrl && recording === null && (
                  <button 
                    onClick={() => {
                      const audio = new Audio(audioUrl);
                      audio.play();
                    }}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-full hover:bg-emerald-100 transition-all shadow-sm"
                    title="Playback my recording"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <p className="text-xl leading-relaxed text-slate-800 font-serif mb-4">
                  {p.en}
                </p>
                {showChinese[idx] && (
                  <p className="text-lg leading-relaxed text-slate-500 bg-slate-50 p-6 rounded-2xl border-l-4 border-blue-200 animate-fade-in">
                    {p.zh}
                  </p>
                )}
                <button 
                  onClick={() => toggleChinese(idx)}
                  className="text-xs font-bold text-blue-600 uppercase tracking-widest hover:underline mt-2"
                >
                  {showChinese[idx] ? 'Hide Translation' : 'Show Translation'}
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="h-px bg-slate-200" />

        <section>
          <h3 className="text-2xl font-bold text-slate-800 mb-8">Article Keywords</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedArticle.keywords.map((kw, i) => (
              <div key={i} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-blue-200 transition-colors">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-bold text-slate-900">{kw.word}</h4>
                  <button onClick={() => audioManager.speak(kw.word)} className="text-blue-500 hover:text-blue-700">
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-slate-400 font-mono text-sm mb-2">{kw.ipa}</p>
                <p className="text-slate-600 font-medium">{kw.definition}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const EmptyState = ({ type }: { type: Module }) => {
  return (
    <div className="py-20 flex flex-col items-center text-center max-w-sm mx-auto animate-fade-in">
      <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-slate-300 mb-6">
        <Search className="w-10 h-10" />
      </div>
      <h3 className="text-2xl font-bold text-slate-800 mb-2">Library is empty</h3>
      <p className="text-slate-500 mb-8">Click the button in the header to generate high-quality AI content for your studies.</p>
    </div>
  );
};

// --- Mount App ---

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
