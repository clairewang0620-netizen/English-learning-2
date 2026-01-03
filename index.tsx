
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
  Star,
  Check,
  Trophy,
  Sparkles,
  Trash2
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
  paragraphs: { en: string; zh: string }[];
  keywords: { word: string; ipa: string; definition: string }[];
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
  
  // Persistent State
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

      if (savedWrong) setWrongWords(new Set(JSON.parse(savedWrong)));
      if (savedIntensive) setIntensiveWords(new Set(JSON.parse(savedIntensive)));
      if (savedMastered) setMasteredWords(new Set(JSON.parse(savedMastered)));
      
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
  }, [wrongWords, intensiveWords, masteredWords, initialized]);

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
        <p className="mt-6 text-lg font-bold text-slate-800 tracking-tight">Synchronizing Course Content...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 md:py-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Lingo<span className="text-emerald-600">Master</span>
          </h1>
          <p className="text-slate-500 text-sm font-medium">Professional Production Module</p>
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
          <VocabularyModule 
            groups={vocabGroups} 
            intensiveWords={intensiveWords}
            masteredWords={masteredWords}
            onToggleIntensive={(w) => toggleSet(intensiveWords, setIntensiveWords, w)}
            onToggleMastered={(w) => toggleSet(masteredWords, setMasteredWords, w)}
          />
        )}
        {activeModule === 'dictation' && (
          <DictationModule 
            groups={vocabGroups} 
            wrongWords={wrongWords} 
            onAddWrong={(w) => setWrongWords(prev => new Set(prev).add(w))}
            onRemoveWrong={(w) => setWrongWords(prev => { const n = new Set(prev); n.delete(w); return n; })}
          />
        )}
        {activeModule === 'reading' && (
          <ReadingModule articles={articles} />
        )}
      </main>
    </div>
  );
};

// --- Vocabulary Module ---

const VocabularyModule = ({ 
  groups, intensiveWords, masteredWords, onToggleIntensive, onToggleMastered 
}: { 
  groups: VocabularyGroup[], intensiveWords: Set<string>, masteredWords: Set<string>,
  onToggleIntensive: (w: string) => void, onToggleMastered: (w: string) => void
}) => {
  const [selectedGroup, setSelectedGroup] = useState<VocabularyGroup | null>(null);
  const [cardIndex, setCardIndex] = useState<number | null>(null);

  const currentWord = (selectedGroup && cardIndex !== null) ? selectedGroup.words[cardIndex] : null;

  const navigateCard = (direction: number) => {
    if (selectedGroup && cardIndex !== null) {
      const nextIndex = cardIndex + direction;
      if (nextIndex >= 0 && nextIndex < selectedGroup.words.length) {
        setCardIndex(nextIndex);
        audioManager.speak(selectedGroup.words[nextIndex].word);
      }
    }
  };

  if (cardIndex !== null && currentWord) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setCardIndex(null)} />
        <div className="relative bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">
          <button 
            onClick={() => setCardIndex(null)}
            className="absolute top-6 right-6 p-3 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-500 z-10"
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="overflow-y-auto p-8 md:p-12">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-10">
              <div className="flex-1">
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-2">{currentWord.word}</h2>
                <p className="text-2xl text-emerald-600 font-mono font-medium">{currentWord.ipa}</p>
              </div>
              <button 
                onClick={() => audioManager.speak(currentWord.word)}
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
                <div key={i} className="bg-slate-50 p-6 md:p-8 rounded-[2rem] relative group border border-slate-100">
                  <p className="text-slate-800 font-bold text-xl mb-4 leading-relaxed">{ex.en}</p>
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
                onClick={() => onToggleIntensive(currentWord.word)}
                className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${
                  intensiveWords.has(currentWord.word) ? 'bg-amber-100 text-amber-700 border-amber-200 border-2' : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Star className={`w-6 h-6 ${intensiveWords.has(currentWord.word) ? 'fill-current text-amber-500' : ''}`} />
                {intensiveWords.has(currentWord.word) ? '已加入强化' : '加入强化词库'}
              </button>
              <button 
                onClick={() => onToggleMastered(currentWord.word)}
                className={`flex-1 py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${
                  masteredWords.has(currentWord.word) ? 'bg-emerald-100 text-emerald-700 border-emerald-200 border-2' : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Check className="w-6 h-6" />
                {masteredWords.has(currentWord.word) ? '已掌握' : '标记已掌握'}
              </button>
            </div>

            <div className="mt-10 flex justify-between items-center bg-slate-50 p-4 rounded-3xl border border-slate-100">
              <button 
                disabled={cardIndex === 0}
                onClick={() => navigateCard(-1)}
                className="flex items-center gap-2 font-black text-xs uppercase tracking-widest text-slate-400 hover:text-slate-900 disabled:opacity-20"
              >
                <ChevronLeft className="w-5 h-5" /> Prev
              </button>
              <span className="font-black text-slate-300 tracking-tighter text-sm uppercase">{selectedGroup?.name} | {cardIndex + 1} OF {selectedGroup?.words.length}</span>
              <button 
                disabled={cardIndex === (selectedGroup?.words.length || 0) - 1}
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

  if (selectedGroup) {
    return (
      <div className="animate-fade-in">
        <button 
          onClick={() => setSelectedGroup(null)}
          className="mb-8 flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black uppercase tracking-widest text-[11px]"
        >
          <ChevronLeft className="w-5 h-5" /> Back to Groups
        </button>
        <div className="flex items-center gap-3 mb-10">
          <h2 className="text-4xl font-black text-emerald-600 italic tracking-tighter">{selectedGroup.name}</h2>
          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black uppercase tracking-widest">{selectedGroup.words.length} Units</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {selectedGroup.words.map((word, idx) => (
            <div 
              key={idx}
              onClick={() => { setCardIndex(idx); audioManager.speak(word.word); }}
              className="group bg-white border-2 border-slate-50 p-6 rounded-[2rem] flex items-center justify-between hover:shadow-2xl hover:border-emerald-100 transition-all cursor-pointer relative overflow-hidden"
            >
              <div className="flex-1">
                <div className="flex items-center gap-4">
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">{word.word}</h3>
                  <span className="text-emerald-500 font-mono text-sm font-bold">{word.ipa}</span>
                </div>
                <p className="text-slate-500 font-bold mt-1 text-sm">{word.meaning}</p>
              </div>
              <div className="flex items-center gap-3">
                {masteredWords.has(word.word) && <Check className="w-5 h-5 text-emerald-500 bg-emerald-50 rounded-full p-1" />}
                {intensiveWords.has(word.word) && <Star className="w-5 h-5 text-amber-500 fill-amber-500 bg-amber-50 rounded-full p-1" />}
                <ChevronRight className="text-slate-200 group-hover:text-emerald-500 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in">
      {groups.map((group) => (
        <button 
          key={group.id}
          onClick={() => setSelectedGroup(group)}
          className="bg-white border-4 border-slate-50 p-10 rounded-[3.5rem] text-left hover:border-emerald-400 hover:shadow-[0_20px_50px_rgba(16,185,129,0.1)] transition-all flex flex-col group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
          <p className="text-xs font-black text-emerald-500 uppercase tracking-[0.3em] mb-4">Educational Unit</p>
          <h3 className="text-3xl font-black text-slate-800 tracking-tighter mb-8 italic">{group.name}</h3>
          <div className="mt-auto flex justify-between items-center w-full">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">{group.words.length} Vocabulary Units</span>
            <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200">
              <ChevronRight className="w-6 h-6" />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

// --- Dictation Module ---

const DictationModule = ({ 
  groups, wrongWords, onAddWrong, onRemoveWrong 
}: { 
  groups: VocabularyGroup[], wrongWords: Set<string>, 
  onAddWrong: (w: string) => void, onRemoveWrong: (w: string) => void
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

    if (!correct) {
      onAddWrong(currentWord.word);
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

  const openErrorSet = () => {
    setIsErrorReviewMode(true);
  };

  if (isErrorReviewMode) {
    const words: Word[] = [];
    Array.from(wrongWords).forEach(w => {
      for (const g of groups) {
        const match = g.words.find(word => word.word === w);
        if (match) {
          if (!words.find(x => x.word === match.word)) words.push(match);
        }
      }
    });

    return (
      <div className="animate-fade-in space-y-8">
        <button 
          onClick={() => setIsErrorReviewMode(false)}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black uppercase tracking-widest text-[11px] transition-colors"
        >
          <ChevronLeft className="w-5 h-5" /> Back to Training
        </button>
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-4xl font-black text-amber-700 italic tracking-tighter">错题集</h2>
          <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full font-black text-xs uppercase tracking-widest">{words.length} Words</span>
        </div>
        <div className="space-y-4">
          {words.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-slate-50">
              <Sparkles className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <p className="text-slate-400 font-bold">错题集已空，太棒了！</p>
            </div>
          ) : (
            words.map((word, idx) => (
              <div 
                key={idx}
                className="bg-white border-2 border-slate-50 p-8 rounded-[2.5rem] flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-xl transition-all"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="text-3xl font-black text-slate-800 tracking-tight">{word.word}</h3>
                    <span className="text-emerald-500 font-mono text-sm font-bold">{word.ipa}</span>
                  </div>
                  <p className="text-slate-600 font-bold text-lg">{word.meaning}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => audioManager.speak(word.word)}
                    className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                  >
                    <Volume2 className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => onRemoveWrong(word.word)}
                    className="h-14 px-8 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-emerald-600 transition-all flex items-center gap-2"
                  >
                    <Check className="w-5 h-5" /> 已掌握
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
        <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Immersion Training</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {groups.map(group => (
            <button 
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className="bg-white border-2 border-slate-100 p-10 rounded-[3rem] text-left hover:border-emerald-400 hover:shadow-2xl transition-all flex justify-between items-center group relative overflow-hidden"
            >
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2 italic">{group.name}</h3>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[11px]">Standard Dictation Protocol</p>
              </div>
              <ChevronRight className="w-8 h-8 text-slate-100 group-hover:text-emerald-500 transition-colors" />
            </button>
          ))}
          {wrongWords.size > 0 && (
            <button 
              onClick={openErrorSet}
              className="bg-amber-50 border-4 border-amber-100 p-10 rounded-[3rem] text-left hover:shadow-2xl hover:border-amber-300 transition-all flex justify-between items-center group"
            >
              <div>
                <h3 className="text-3xl font-black text-amber-700 tracking-tighter mb-2 italic">错题集</h3>
                <p className="text-amber-600/70 font-bold uppercase tracking-widest text-[11px]">{wrongWords.size} Priority Replays</p>
              </div>
              <div className="bg-amber-100 p-3 rounded-full text-amber-600">
                <AlertCircle className="w-8 h-8" />
              </div>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Formatting for display on error: First letter capital, rest small
  const displayFormat = currentWord ? currentWord.word.charAt(0).toUpperCase() + currentWord.word.slice(1).toLowerCase() : "";

  return (
    <div className="max-w-3xl mx-auto py-6 md:py-12 animate-fade-in">
      <div className="flex justify-between items-center mb-10 px-4">
        <button onClick={() => setSelectedGroup(null)} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black uppercase tracking-widest text-[11px] transition-colors">
          <ChevronLeft className="w-5 h-5" /> Back to Archive
        </button>
        <div className="flex items-center gap-4">
          <span className="font-black text-slate-300 tracking-widest text-[11px] uppercase">{selectedGroup.name}</span>
          <span className="bg-slate-100 px-4 py-1.5 rounded-full text-slate-800 font-black text-[11px] uppercase tracking-tighter">{currentIndex + 1} / {selectedGroup.words.length}</span>
        </div>
      </div>

      <div className="bg-white rounded-[4rem] shadow-2xl p-12 md:p-20 border border-slate-100 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-slate-50">
          <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${((currentIndex + 1) / selectedGroup.words.length) * 100}%` }}></div>
        </div>

        <button 
          onClick={() => audioManager.speak(currentWord?.word || '')}
          className="w-40 h-40 bg-emerald-600 text-white rounded-[3.5rem] mx-auto mb-12 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-emerald-200"
        >
          <Volume2 className="w-16 h-16" />
        </button>

        <form onSubmit={handleSubmit} className="space-y-10">
          <input 
            autoFocus
            type="text"
            spellCheck={false}
            autoComplete="off"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type Sequence..."
            className={`w-full text-center text-5xl font-black py-8 bg-slate-50 border-4 rounded-[2.5rem] outline-none transition-all placeholder:text-slate-200 ${
              isCorrect === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
              isCorrect === false ? 'border-red-500 bg-red-50 text-red-700' :
              'border-slate-100 focus:border-emerald-400 focus:bg-white'
            }`}
            disabled={isCorrect !== null}
          />

          {isCorrect === null ? (
            <button type="submit" className="w-full bg-slate-900 text-white py-8 rounded-[2.5rem] font-black text-2xl hover:bg-slate-800 transition-all shadow-2xl active:scale-95">
              Verify
            </button>
          ) : (
            <div className="space-y-8 animate-fade-in">
              {isCorrect ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="bg-emerald-100 p-8 rounded-[2.5rem] shadow-lg shadow-emerald-100">
                    <Trophy className="w-16 h-16 text-emerald-600 animate-bounce" />
                  </div>
                  <h3 className="text-4xl font-black text-emerald-600 tracking-tighter">Bravo! Correct</h3>
                  <div className="flex items-center gap-2 text-emerald-500">
                    <Sparkles className="w-6 h-6" />
                    <span className="font-bold uppercase text-xs tracking-widest">Excellent Work</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-slate-50 p-10 rounded-[3rem] inline-block border-2 border-slate-100 shadow-inner">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-4">Target Sequence</p>
                    <p className="text-5xl font-black text-slate-800 tracking-[0.1em]">{displayFormat}</p>
                  </div>
                  <button 
                    type="button"
                    onClick={openErrorSet}
                    className="flex items-center justify-center gap-2 text-amber-600 font-black bg-amber-50 w-fit mx-auto px-8 py-4 rounded-[1.5rem] hover:bg-amber-100 transition-all border-2 border-amber-100 shadow-sm"
                  >
                    <AlertCircle className="w-5 h-5" />
                    已加入错题集
                  </button>
                </div>
              )}
              
              <button 
                type="button"
                onClick={nextWord}
                className="w-full bg-emerald-600 text-white py-6 rounded-[2.5rem] font-black text-xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-100"
              >
                Next <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </form>

        <button 
          onClick={() => setShowHint(!showHint)}
          className="mt-16 text-slate-400 hover:text-slate-600 flex items-center gap-3 mx-auto text-[11px] font-black uppercase tracking-[0.4em]"
        >
          {showHint ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          {showHint ? '隐藏释义' : '显示中文释义'}
        </button>
        {showHint && (
          <div className="mt-8 p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 animate-fade-in">
             <p className="text-3xl font-black text-emerald-700 tracking-tighter">{currentWord?.meaning}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// --- Reading Module ---

const ReadingModule = ({ articles }: { articles: Article[] }) => {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [showChinese, setShowChinese] = useState<Record<number, boolean>>({});
  const [recording, setRecording] = useState<number | null>(null);

  if (!selectedArticle) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-fade-in">
        {articles.map(article => (
          <div 
            key={article.id}
            className="bg-white p-12 rounded-[4rem] border-4 border-slate-50 shadow-sm hover:shadow-2xl hover:border-blue-200 transition-all cursor-pointer group flex flex-col h-full relative overflow-hidden"
            onClick={() => setSelectedArticle(article)}
          >
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-all"></div>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-6 italic">Premium Publication</p>
            <h3 className="text-4xl font-serif font-bold text-slate-900 mb-8 leading-tight tracking-tight group-hover:italic transition-all">{article.title}</h3>
            <button className="mt-auto w-full bg-slate-900 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-[0.3em] transition-all hover:bg-blue-600">
              Open Analysis Room
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-24 max-w-4xl mx-auto">
      <button 
        onClick={() => setSelectedArticle(null)}
        className="mb-12 flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black uppercase tracking-widest text-[11px] transition-colors"
      >
        <ChevronLeft className="w-5 h-5" /> Archive Library
      </button>

      <header className="mb-24 text-center px-6">
        <h2 className="text-6xl md:text-8xl font-serif font-bold text-slate-900 leading-[1] italic tracking-tighter">
          {selectedArticle.title}
        </h2>
        <div className="h-1.5 w-24 bg-blue-600 mx-auto mt-12 rounded-full shadow-lg shadow-blue-100"></div>
      </header>

      <div className="space-y-32">
        {selectedArticle.paragraphs.map((p, idx) => (
          <div key={idx} className="flex flex-col md:flex-row items-start gap-12 group">
            <div className="flex md:flex-col gap-4 shrink-0">
              <button 
                onClick={() => audioManager.speak(p.en)}
                className="p-5 bg-white text-slate-400 border-2 border-slate-50 rounded-[2rem] hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-md active:scale-90"
              >
                <Volume2 className="w-7 h-7" />
              </button>
              <button 
                onClick={() => recording === idx ? setRecording(null) : setRecording(idx)}
                className={`p-5 rounded-[2rem] transition-all shadow-md active:scale-90 border-2 ${recording === idx ? 'bg-red-500 text-white border-red-400 animate-pulse' : 'bg-white text-slate-400 border-slate-50 hover:bg-slate-900 hover:text-white hover:border-slate-900'}`}
              >
                <Mic className="w-7 h-7" />
              </button>
            </div>
            <div className="flex-1">
              <p className="text-3xl md:text-4xl leading-[1.6] text-slate-800 font-serif mb-10 selection:bg-blue-100 tracking-tight">{p.en}</p>
              {showChinese[idx] && (
                <p className="text-2xl md:text-3xl leading-relaxed text-slate-500 bg-slate-50 p-10 md:p-14 rounded-[3.5rem] border-l-[12px] border-blue-500 animate-fade-in italic font-medium">
                  {p.zh}
                </p>
              )}
              <button 
                onClick={() => setShowChinese(prev => ({ ...prev, [idx]: !prev[idx] }))} 
                className="text-[12px] font-black text-blue-600 uppercase tracking-[0.4em] mt-10 hover:text-blue-800 flex items-center gap-2 group/btn"
              >
                <div className="h-0.5 w-8 bg-blue-600 group-hover/btn:w-14 transition-all"></div>
                {showChinese[idx] ? 'Conceal Data' : 'View Translation'}
              </button>
            </div>
          </div>
        ))}

        <section className="bg-slate-900 text-white p-16 md:p-24 rounded-[5rem] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/10 rounded-full -mr-32 -mt-32"></div>
          <h3 className="text-5xl font-black tracking-tighter mb-16 italic border-b border-slate-800 pb-8 inline-block">Key Lexicon</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
            {selectedArticle.keywords.map((kw, i) => (
              <div key={i} className="bg-slate-800 p-10 rounded-[3rem] border border-slate-700 hover:border-blue-500 transition-all group/kw relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-3xl font-black tracking-tight italic group-hover/kw:text-blue-400 transition-colors">{kw.word}</h4>
                  <button onClick={() => audioManager.speak(kw.word)} className="p-2 text-slate-500 hover:text-white bg-slate-700 rounded-xl transition-all">
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-blue-400 font-mono text-base mb-6 font-bold">{kw.ipa}</p>
                <p className="text-slate-300 font-medium text-xl border-l-4 border-blue-600 pl-6 leading-relaxed">{kw.definition}</p>
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
