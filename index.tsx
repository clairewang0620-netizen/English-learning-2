
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BookOpen, 
  Headphones, 
  FileText, 
  Volume2, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Mic,
  Loader2,
  Star,
  Check,
  Filter,
  Square,
  Activity,
  // Fix: Added missing icons Sparkles and AlertCircle
  Sparkles,
  AlertCircle
} from 'lucide-react';

// Import data directly
import { vocabularyData } from './vocabulary.ts';
import { readingData } from './reading.ts';

// --- Types ---

interface Example {
  en: string;
  zh: string;
}

interface Word {
  word: string;
  ipa: string;
  meaning: string;
  category: string;
  examples: Example[];
}

interface VocabularyGroup {
  id: number;
  name: string;
  words: Word[];
}

interface Article {
  id: string;
  title: string;
  titleZh: string;
  imageUrl?: string;
  paragraphs: { en: string; zh: string }[];
  keywords: { word: string; ipa: string; definition: string }[];
}

type Module = 'vocabulary' | 'dictation' | 'reading';

// --- Global Audio Manager ---

class AudioManager {
  private static instance: AudioManager;
  private synth: SpeechSynthesis;
  private voice: SpeechSynthesisVoice | null = null;
  public onPlayStateChange?: (playing: boolean) => void;
  private isStopping: boolean = false;

  private constructor() {
    this.synth = window.speechSynthesis;
    const loadVoices = () => {
      const voices = this.synth.getVoices();
      // 优先选择自然度最高的“Natural”系列或系统自带的高质量女声
      this.voice = voices.find(v => 
        (v.name.includes('Natural') && v.lang.startsWith('en-US')) ||
        v.name.includes('Aria') || 
        v.name.includes('Ava') ||
        v.name.includes('Samantha') ||
        v.name.includes('Google US English')
      ) || voices.find(v => v.lang.startsWith('en-US')) || null;
    };
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  static getInstance() {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  stop() {
    this.isStopping = true;
    this.synth.cancel();
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  /**
   * 采用分句播报技术，解决长段落中断问题，并模拟新闻播报员的连贯性
   */
  async speak(text: string, rate: number = 0.95, lang: 'en-US' | 'zh-CN' = 'en-US') {
    this.stop();
    this.isStopping = false;
    
    if (this.onPlayStateChange) this.onPlayStateChange(true);

    // 智能断句：将长段落按标点符号拆分，避免超过浏览器TTS长度限制，同时保持连贯
    // 这种方式能让浏览器逐句进入合成队列，消除长段落中途停止的问题
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    
    // 记录正在播放的状态
    let playedCount = 0;

    sentences.forEach((sentence, index) => {
      const trimmed = sentence.trim();
      if (!trimmed) {
        playedCount++;
        return;
      }

      const utterance = new SpeechSynthesisUtterance(trimmed);
      if (lang === 'en-US' && this.voice) {
        utterance.voice = this.voice;
      } else {
        utterance.lang = lang;
      }

      // 新闻播报参数：清晰、稳重、富有穿透力
      utterance.rate = rate; 
      utterance.pitch = 1.02; // 稍微提升音高使声音更明亮
      utterance.volume = 1.0;

      utterance.onend = () => {
        playedCount++;
        if (playedCount === sentences.length) {
          if (this.onPlayStateChange) this.onPlayStateChange(false);
        }
      };

      utterance.onerror = () => {
        playedCount++;
        if (playedCount === sentences.length) {
          if (this.onPlayStateChange) this.onPlayStateChange(false);
        }
      };

      this.synth.speak(utterance);
    });
  }
}

const audioManager = AudioManager.getInstance();

// --- Main Application Component ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('reading'); // 默认展示阅读模块进行调试
  const [vocabGroups, setVocabGroups] = useState<VocabularyGroup[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [playbackRate, setPlaybackRate] = useState(0.95);
  
  const [wrongWords, setWrongWords] = useState<Set<string>>(new Set());
  const [intensiveWords, setIntensiveWords] = useState<Set<string>>(new Set());
  const [masteredWords, setMasteredWords] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initData = () => {
      setVocabGroups(vocabularyData.groups || []);
      setArticles(readingData || []);

      const savedWrong = localStorage.getItem('lm_wrong');
      const savedIntensive = localStorage.getItem('lm_intensive');
      const savedMastered = localStorage.getItem('lm_mastered');
      const savedRate = localStorage.getItem('lm_rate');

      if (savedWrong) setWrongWords(new Set(JSON.parse(savedWrong)));
      if (savedIntensive) setIntensiveWords(new Set(JSON.parse(savedIntensive)));
      if (savedMastered) setMasteredWords(new Set(JSON.parse(savedMastered)));
      if (savedRate) setPlaybackRate(parseFloat(savedRate));
      
      setInitialized(true);
      setTimeout(() => setLoading(false), 800);
    };
    initData();
  }, []);

  useEffect(() => {
    if (!initialized) return;
    localStorage.setItem('lm_wrong', JSON.stringify(Array.from(wrongWords)));
    localStorage.setItem('lm_intensive', JSON.stringify(Array.from(intensiveWords)));
    localStorage.setItem('lm_mastered', JSON.stringify(Array.from(masteredWords)));
    localStorage.setItem('lm_rate', playbackRate.toString());
  }, [wrongWords, intensiveWords, masteredWords, playbackRate, initialized]);

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, word: string) => {
    const next = new Set(set);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    setter(next);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
        <Loader2 className="w-16 h-16 text-emerald-600 animate-spin" />
        <p className="mt-6 text-lg font-bold text-slate-800 tracking-tight">Initializing Academy...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 md:py-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Lingo<span className="text-emerald-600">Master</span>
            </h1>
            <p className="text-slate-500 text-sm font-medium">Newsroom Edition</p>
          </div>
        </div>
        
        <nav className="flex gap-1 bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit">
          {[
            { id: 'vocabulary', label: 'Vocab', icon: BookOpen },
            { id: 'dictation', label: 'Dictate', icon: Headphones },
            { id: 'reading', label: 'Read', icon: FileText },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => {
                setActiveModule(btn.id as Module);
                audioManager.stop();
              }}
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
          <VocabularyModule 
            groups={vocabGroups} 
            intensiveWords={intensiveWords}
            masteredWords={masteredWords}
            onToggleIntensive={(w) => toggleSet(intensiveWords, setIntensiveWords, w)}
            onToggleMastered={(w) => toggleSet(masteredWords, setMasteredWords, w)}
            playbackRate={playbackRate}
          />
        )}
        {activeModule === 'dictation' && (
          <DictationModule 
            groups={vocabGroups} 
            wrongWords={wrongWords} 
            onAddWrong={(w) => setWrongWords(prev => new Set(prev).add(w))}
            onRemoveWrong={(w) => setWrongWords(prev => { const n = new Set(prev); n.delete(w); return n; })}
            playbackRate={playbackRate}
          />
        )}
        {activeModule === 'reading' && (
          <ReadingModule 
            articles={articles} 
            playbackRate={playbackRate} 
            setPlaybackRate={setPlaybackRate} 
          />
        )}
      </main>
    </div>
  );
};

// --- Vocabulary Module ---
const VocabularyModule = ({ 
  groups, intensiveWords, masteredWords, onToggleIntensive, onToggleMastered, playbackRate
}: { 
  groups: VocabularyGroup[], intensiveWords: Set<string>, masteredWords: Set<string>,
  onToggleIntensive: (w: string) => void, onToggleMastered: (w: string) => void,
  playbackRate: number
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState<number | null>(null);

  const visibleWords = useMemo(() => {
    const all: Word[] = [];
    groups.forEach(g => all.push(...g.words));
    if (selectedCategory) {
      return all.filter(w => w.category === selectedCategory);
    }
    return all;
  }, [groups, selectedCategory]);

  const currentWord = cardIndex !== null ? visibleWords[cardIndex] : null;

  const navigateCard = (direction: number) => {
    if (cardIndex !== null) {
      const nextIndex = cardIndex + direction;
      if (nextIndex >= 0 && nextIndex < visibleWords.length) {
        setCardIndex(nextIndex);
        audioManager.speak(visibleWords[nextIndex].word, playbackRate);
      }
    }
  };

  // Fix: Added optional key prop to the props type to satisfy TypeScript JSX validation
  const WordRow = ({ word, onClick }: { word: Word, onClick: () => void, key?: React.Key }) => (
    <div 
      className="group bg-white border border-slate-100 p-6 rounded-[2rem] flex items-center justify-between hover:shadow-xl hover:border-emerald-200 transition-all cursor-pointer relative"
      onClick={onClick}
    >
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-black text-slate-800 tracking-tight">{word.word}</h3>
          <span className="text-emerald-500 font-mono text-xs font-bold">{word.ipa}</span>
        </div>
        <p className="text-slate-500 font-bold mt-1 text-xs">{word.meaning}</p>
      </div>
      <div className="flex items-center gap-4">
        {masteredWords.has(word.word) && <Check className="w-5 h-5 text-emerald-500 bg-emerald-50 rounded-full p-1" />}
        {intensiveWords.has(word.word) && <Star className="w-5 h-5 text-amber-500 fill-amber-500 bg-amber-50 rounded-full p-1" />}
        <button 
          onClick={(e) => { e.stopPropagation(); audioManager.speak(word.word, playbackRate); }}
          className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  if (cardIndex !== null && currentWord) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setCardIndex(null)} />
        <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
          <button 
            onClick={() => { setCardIndex(null); audioManager.stop(); }}
            className="absolute top-6 right-6 p-3 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500 z-10"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="overflow-y-auto p-8 md:p-12">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-10">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">{currentWord.category || 'General'}</span>
                </div>
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{currentWord.word}</h2>
                <p className="text-2xl text-emerald-600 font-mono font-medium">{currentWord.ipa}</p>
              </div>
              <button 
                onClick={() => audioManager.speak(currentWord.word, playbackRate)}
                className="w-20 h-20 bg-emerald-600 text-white rounded-[2rem] flex items-center justify-center shadow-xl shadow-emerald-200 hover:scale-105 transition-all"
              >
                <Volume2 className="w-10 h-10" />
              </button>
            </div>
            
            <div className="mb-12">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-black mb-4">Core Definition</p>
              <p className="text-3xl font-black text-slate-800 leading-tight">{currentWord.meaning}</p>
            </div>

            <div className="space-y-8">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-black">Contextual Usage</p>
              {currentWord.examples.map((ex, i) => (
                <div key={i} className="bg-slate-50 p-8 md:p-10 rounded-[2.5rem] relative group border border-slate-100">
                  <p className="text-slate-800 font-serif italic text-2xl mb-5 leading-relaxed tracking-tight">{ex.en}</p>
                  <p className="text-slate-500 text-lg font-medium border-l-4 border-emerald-400 pl-4">{ex.zh}</p>
                  <button 
                    onClick={() => audioManager.speak(ex.en, playbackRate)}
                    className="absolute bottom-8 right-8 p-4 bg-white text-emerald-500 shadow-md rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                  >
                    <Volume2 className="w-6 h-6" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => onToggleIntensive(currentWord.word)}
                className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${
                  intensiveWords.has(currentWord.word) ? 'bg-amber-100 text-amber-700 border-amber-200 border-2' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Star className={`w-6 h-6 ${intensiveWords.has(currentWord.word) ? 'fill-current text-amber-500' : ''}`} />
                {intensiveWords.has(currentWord.word) ? '已加入强化' : '加入强化词库'}
              </button>
              <button 
                onClick={() => onToggleMastered(currentWord.word)}
                className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${
                  masteredWords.has(currentWord.word) ? 'bg-emerald-100 text-emerald-700 border-emerald-200 border-2' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Check className="w-6 h-6" />
                {masteredWords.has(currentWord.word) ? '已掌握' : '标记已掌握'}
              </button>
            </div>

            <div className="mt-10 flex justify-between items-center bg-slate-50 p-4 rounded-3xl">
              <button 
                disabled={cardIndex === 0}
                onClick={() => navigateCard(-1)}
                className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-900 disabled:opacity-20"
              >
                <ChevronLeft className="w-5 h-5" /> Prev
              </button>
              <span className="font-black text-slate-300 tracking-tighter text-sm uppercase">{cardIndex + 1} / {visibleWords.length}</span>
              <button 
                disabled={cardIndex === visibleWords.length - 1}
                onClick={() => navigateCard(1)}
                className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-900 disabled:opacity-20"
              >
                Next <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-10">
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-slate-900 tracking-tighter flex items-center gap-2 italic">
            <Filter className="w-5 h-5 text-emerald-600" />
            Selection Filters
          </h2>
          {selectedCategory && (
            <button 
              onClick={() => setSelectedCategory(null)}
              className="text-[10px] font-black text-slate-400 hover:text-slate-900 uppercase tracking-widest"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {['CET-4', 'CET-6', 'TEM-8', 'Business', 'Emotions', 'Daily'].map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-4 py-2 rounded-xl font-black text-[11px] transition-all border-2 ${
                selectedCategory === cat 
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
                : 'bg-white text-slate-600 border-slate-100 hover:border-emerald-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-12">
        {groups.map((group) => {
          const groupWords = selectedCategory ? group.words.filter(w => w.category === selectedCategory) : group.words;
          if (groupWords.length === 0) return null;

          return (
            <div key={group.id} className="space-y-6">
              <div className="flex items-center gap-4 border-b border-slate-100 pb-3">
                <h3 className="text-xl font-black text-emerald-600 italic tracking-tighter">{group.name}</h3>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest">{groupWords.length} Words</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupWords.map((word, idx) => {
                  const groupStartIdx = visibleWords.findIndex(w => w.word === groupWords[0].word);
                  const globalIdx = groupStartIdx + idx;
                  return (
                    <WordRow key={idx} word={word} onClick={() => { setCardIndex(globalIdx); audioManager.speak(word.word, playbackRate); }} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};

// --- Dictation Module ---
const DictationModule = ({ 
  groups, wrongWords, onAddWrong, onRemoveWrong, playbackRate
}: { 
  groups: VocabularyGroup[], wrongWords: Set<string>, 
  onAddWrong: (w: string) => void, onRemoveWrong: (w: string) => void,
  playbackRate: number
}) => {
  const [selectedGroup, setSelectedGroup] = useState<VocabularyGroup | null>(null);
  const [isErrorReviewMode, setIsErrorReviewMode] = useState(false);
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
    if (!correct) onAddWrong(currentWord.word);
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

  if (isErrorReviewMode) {
    const words: Word[] = [];
    Array.from(wrongWords).forEach(w => {
      for (const g of groups) {
        const match = g.words.find(word => word.word === w);
        if (match && !words.find(x => x.word === match.word)) words.push(match);
      }
    });

    return (
      <div className="animate-fade-in space-y-12">
        <button onClick={() => setIsErrorReviewMode(false)} className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-[10px]">
          <ChevronLeft className="w-4 h-4" /> Exit Review
        </button>
        <h2 className="text-3xl font-black text-amber-700 italic tracking-tighter">Incorrect Archives</h2>
        <div className="space-y-4">
          {words.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-100">
              {/* Fix: Icon Sparkles now correctly imported */}
              <Sparkles className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-slate-400 font-black">All archived errors have been mastered.</p>
            </div>
          ) : (
            words.map((word, idx) => (
              <div key={idx} className="bg-white border border-slate-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{word.word}</h3>
                  <p className="text-slate-500 font-bold text-sm">{word.meaning}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => audioManager.speak(word.word, playbackRate)} className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Volume2 className="w-5 h-5" />
                  </button>
                  <button onClick={() => onRemoveWrong(word.word)} className="px-4 bg-slate-900 text-white rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition-colors">
                    Mastered
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  if (!selectedGroup) {
    return (
      <div className="animate-fade-in space-y-12">
        <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">Dictation Protocols</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {groups.map(group => (
            <button key={group.id} onClick={() => setSelectedGroup(group)} className="bg-white border border-slate-100 p-8 rounded-[2.5rem] text-left hover:border-emerald-400 transition-all flex justify-between items-center group">
              <div>
                <h3 className="text-xl font-black text-slate-800 italic">{group.name}</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">20 Units · News Phrasing</p>
              </div>
              <ChevronRight className="w-6 h-6 text-slate-100 group-hover:text-emerald-500 transition-colors" />
            </button>
          ))}
          {wrongWords.size > 0 && (
            <button onClick={() => setIsErrorReviewMode(true)} className="bg-amber-50 border border-amber-200 p-8 rounded-[2.5rem] text-left hover:shadow-lg transition-all flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-amber-700 italic">Error Archives</h3>
                <p className="text-amber-600/70 font-bold uppercase tracking-widest text-[9px]">{wrongWords.size} Priority Units</p>
              </div>
              {/* Fix: Icon AlertCircle now correctly imported */}
              <AlertCircle className="w-6 h-6 text-amber-500" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-10 px-4">
        <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-[10px]">
          <ChevronLeft className="w-4 h-4" /> Cancel Session
        </button>
        <span className="bg-slate-100 px-4 py-1.5 rounded-full text-slate-800 font-black text-[10px] uppercase tracking-widest">{currentIndex + 1} / {selectedGroup.words.length}</span>
      </div>

      <div className="bg-white rounded-[4rem] shadow-2xl p-12 text-center relative border border-slate-100">
        <button onClick={() => audioManager.speak(currentWord?.word || '', playbackRate)} className="w-32 h-32 bg-emerald-600 text-white rounded-[3rem] mx-auto mb-10 flex items-center justify-center hover:scale-105 transition-all shadow-xl shadow-emerald-100">
          <Volume2 className="w-12 h-12" />
        </button>
        <form onSubmit={handleSubmit} className="space-y-8">
          <input 
            autoFocus
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type Sequence..."
            className={`w-full text-center text-4xl font-black py-6 bg-slate-50 border-4 rounded-[2rem] outline-none transition-all placeholder:text-slate-200 ${
              isCorrect === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
              isCorrect === false ? 'border-red-500 bg-red-50 text-red-700' :
              'border-slate-100 focus:border-emerald-400'
            }`}
            disabled={isCorrect !== null}
          />
          {isCorrect === null ? (
            <button type="submit" className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-xl shadow-xl">Verify</button>
          ) : (
            <div className="space-y-6 animate-fade-in">
              {isCorrect ? (
                <p className="text-2xl font-black text-emerald-600">Correct Sequence!</p>
              ) : (
                <div className="p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 inline-block">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Target Word</p>
                  <p className="text-4xl font-black text-slate-800">{currentWord?.word}</p>
                </div>
              )}
              <button type="button" onClick={nextWord} className="w-full bg-emerald-600 text-white py-6 rounded-[2rem] font-black text-xl flex items-center justify-center gap-2">Next <ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
        </form>
        <button onClick={() => setShowHint(!showHint)} className="mt-12 text-slate-400 text-[10px] font-black uppercase tracking-widest">
          {showHint ? 'Hide Interpretation' : 'View Interpretation'}
        </button>
        {showHint && <p className="mt-4 text-2xl font-black text-emerald-700">{currentWord?.meaning}</p>}
      </div>
    </div>
  );
};

// --- Reading Module ---
const ReadingModule = ({ articles, playbackRate, setPlaybackRate }: { articles: Article[], playbackRate: number, setPlaybackRate: (r: number) => void }) => {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showChinese, setShowChinese] = useState<Record<number, boolean>>({});
  const [recordingIdx, setRecordingIdx] = useState<number | null>(null);
  const [recordedAudios, setRecordedAudios] = useState<Record<number, string>>({});
  const [isSynthPlaying, setIsSynthPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioManager.onPlayStateChange = setIsSynthPlaying;
    return () => { audioManager.stop(); };
  }, []);

  const stopAllPlayback = () => {
    audioManager.stop();
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
  };

  const startRecording = async (idx: number) => {
    stopAllPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudios(prev => ({ ...prev, [idx]: audioUrl }));
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setRecordingIdx(idx);
    } catch (err) { alert("Microphone access denied."); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
    setRecordingIdx(null);
  };

  const playRecorded = (idx: number) => {
    stopAllPlayback();
    const url = recordedAudios[idx];
    if (url) {
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => { currentAudioRef.current = null; };
      audio.play();
    }
  };

  if (!selectedArticle) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
        {articles.map(article => (
          <div key={article.id} onClick={() => { setSelectedArticle(article); stopAllPlayback(); }} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:border-emerald-200 transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden">
            {article.imageUrl && (
              <div className="w-full h-48 overflow-hidden rounded-2xl mb-6">
                <img src={article.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" />
              </div>
            )}
            <div className="px-2 pb-2">
              <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-[0.3em] mb-4">Selected Reading</p>
              <h3 className="text-2xl font-serif-magazine font-bold text-slate-800 mb-2 leading-tight group-hover:text-emerald-900 transition-colors">{article.title}</h3>
              <p className="text-slate-400 font-medium text-sm italic mb-6">{article.titleZh}</p>
              <button className="w-fit px-8 bg-emerald-600 text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-emerald-50 transition-all active:scale-[0.98]">
                Read Article
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-32 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-10 px-4">
        <button onClick={() => { setSelectedArticle(null); stopAllPlayback(); }} className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-[9px] hover:text-slate-900 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Archive
        </button>
        <div className="flex items-center gap-3 bg-slate-100 p-1 rounded-xl">
          {[0.8, 0.95, 1.1].map(r => (
            <button 
              key={r}
              onClick={() => setPlaybackRate(r)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${playbackRate === r ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
            >
              {r === 0.95 ? 'Broadcaster' : `${r}x`}
            </button>
          ))}
        </div>
      </div>

      <header className="mb-24 text-center">
        {selectedArticle.imageUrl && (
          <div className="w-full h-80 md:h-[40rem] overflow-hidden rounded-[4rem] mb-14 shadow-2xl border-4 border-white relative group/header">
             <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent group-hover/header:from-slate-900/60 transition-all duration-700"></div>
            <img src={selectedArticle.imageUrl} alt="" className="w-full h-full object-cover group-hover/header:scale-105 transition-transform duration-1000" />
          </div>
        )}
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-serif-magazine font-bold text-slate-900 leading-[1] italic tracking-tighter mb-6 antialiased">
            {selectedArticle.title}
          </h2>
          <div className="h-px w-24 bg-emerald-600 mx-auto mb-6"></div>
          <p className="text-xl md:text-2xl text-slate-400 font-medium italic tracking-wide">{selectedArticle.titleZh}</p>
        </div>
      </header>

      <div className="space-y-24 md:space-y-40 max-w-3xl mx-auto px-4">
        {selectedArticle.paragraphs.map((p, idx) => (
          <div key={idx} className="flex flex-col gap-14 group/para">
            <div className="flex items-center gap-6">
              <button 
                onClick={() => { stopAllPlayback(); audioManager.speak(p.en, playbackRate); }}
                className={`w-14 h-14 flex items-center justify-center rounded-2xl shadow-xl transition-all ${isSynthPlaying ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-950 text-white hover:bg-emerald-600 hover:scale-110 active:scale-95'}`}
                title="Broadcast Narration"
              >
                <Volume2 className="w-7 h-7" />
              </button>
              <button 
                onClick={() => recordingIdx === idx ? stopRecording() : startRecording(idx)}
                className={`w-14 h-14 flex items-center justify-center rounded-2xl shadow-xl transition-all ${recordingIdx === idx ? 'bg-rose-500 text-white animate-pulse' : 'bg-white text-slate-300 border border-slate-100 hover:bg-slate-950 hover:text-white'}`}
                title="Shadow Shadowing"
              >
                {recordingIdx === idx ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              {recordedAudios[idx] && (
                <button 
                  onClick={() => playRecorded(idx)}
                  className="px-6 h-14 bg-amber-500 text-white rounded-2xl shadow-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 hover:bg-amber-600 transition-colors"
                >
                  <Activity className="w-5 h-5" /> My Broadcast
                </button>
              )}
              <div className="h-px flex-1 bg-slate-200 opacity-30"></div>
            </div>
            
            <div className="px-1">
              {/* 阅读正文排版重塑 */}
              <p className="article-text text-2xl md:text-3xl lg:text-4xl leading-[2.2] text-slate-800 font-serif-magazine selection:bg-emerald-100 selection:text-emerald-900 tracking-tight font-medium mb-16 antialiased first-letter:text-6xl first-letter:font-bold first-letter:text-emerald-700 first-letter:mr-4 first-letter:float-left first-letter:leading-[1.1]">
                {p.en}
              </p>
              
              {showChinese[idx] && (
                <div className="bg-slate-50 p-12 md:p-16 rounded-[4rem] border-l-[12px] border-emerald-500/20 mb-16 animate-fade-in shadow-inner transition-all">
                  <p className="text-xl md:text-2xl lg:text-3xl text-slate-400 font-medium italic leading-[1.8]">{p.zh}</p>
                </div>
              )}
              
              <button onClick={() => setShowChinese(prev => ({ ...prev, [idx]: !prev[idx] }))} className="text-[10px] font-black text-emerald-600/80 uppercase tracking-widest flex items-center gap-4 hover:text-emerald-950 transition-all">
                <div className={`h-[1px] bg-emerald-600 transition-all duration-700 ${showChinese[idx] ? 'w-24' : 'w-10'}`}></div>
                {showChinese[idx] ? 'Close Interpretation' : 'View Translation'}
              </button>
            </div>
          </div>
        ))}

        <section className="bg-slate-950 text-white p-16 md:p-24 rounded-[6rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] relative overflow-hidden mt-32 border-t border-white/5">
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-emerald-500/10 rounded-full -mr-[20rem] -mt-[20rem] blur-3xl"></div>
          <h3 className="text-3xl font-black tracking-tighter mb-20 italic border-b border-white/10 pb-10 inline-block opacity-90">Editorial Glossary</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-16 md:gap-20">
            {selectedArticle.keywords.map((kw, i) => (
              <div key={i} className="bg-white/5 p-12 rounded-[3.5rem] border border-white/5 hover:border-emerald-500/40 transition-all duration-500 group/kw">
                <div className="flex justify-between items-center mb-8">
                  <h4 className="text-3xl font-black italic group-hover/kw:text-emerald-400 transition-colors duration-500">{kw.word}</h4>
                  <button onClick={() => audioManager.speak(kw.word, playbackRate)} className="p-5 text-slate-500 hover:text-white bg-white/5 rounded-2xl transition-all">
                    <Volume2 className="w-7 h-7" />
                  </button>
                </div>
                <p className="text-emerald-500/80 font-mono text-lg mb-8 font-bold tracking-widest">{kw.ipa}</p>
                <p className="text-slate-400 font-medium text-2xl border-l-4 border-emerald-900 pl-10 leading-relaxed italic">{kw.definition}</p>
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
