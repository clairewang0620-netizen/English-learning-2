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
  Sparkles,
  AlertCircle,
  Play,
  Pause,
  RotateCw,
  Zap,
  Eye,
  EyeOff,
  Clock
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
  sourceGroupId?: number;
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
  subtitle?: string;
  source?: string;
  readingTime?: string;
  imageUrl?: string;
  paragraphs: { en: string; zh: string }[];
  keywords: { word: string; meaning: string; ipa?: string }[];
}

type Module = 'vocabulary' | 'dictation' | 'reading';
type NarratorGender = 'female' | 'male';

// --- Global Narrator Engine ---

class PodcastEngine {
  private static instance: PodcastEngine;
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  public onPlayStateChange?: (playing: boolean, text?: string) => void;
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();
  private keepAliveInterval: any = null;
  private currentSessionId: number = 0;

  private constructor() {
    this.synth = window.speechSynthesis;
    const loadVoices = () => {
      this.voices = this.synth.getVoices();
    };
    loadVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  static getInstance() {
    if (!PodcastEngine.instance) {
      PodcastEngine.instance = new PodcastEngine();
    }
    return PodcastEngine.instance;
  }

  private getVoice(gender: NarratorGender): SpeechSynthesisVoice | null {
    const usVoices = this.voices.filter(v => v.lang.startsWith('en-US'));
    return usVoices.find(v => 
      v.name.includes('Natural') || v.name.includes('Aria') || v.name.includes('Samantha') || v.name.includes('Ava')
    ) || usVoices[0] || null;
  }

  stop() {
    this.currentSessionId++; 
    this.synth.cancel();
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.activeUtterances.clear();
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  async speak(text: string, rate: number = 0.95, gender: NarratorGender = 'female', onFinished?: () => void) {
    this.stop(); 
    
    const sessionId = this.currentSessionId;
    // Strict delay for browser TTS state reset
    await new Promise(r => setTimeout(r, 60));
    if (sessionId !== this.currentSessionId) return;

    if (this.onPlayStateChange) this.onPlayStateChange(true, text);

    this.keepAliveInterval = setInterval(() => {
      if (this.synth.speaking && sessionId === this.currentSessionId) {
        this.synth.pause();
        this.synth.resume();
      }
    }, 5000);

    // Segment as a whole unit, no sentence-level splitting to ensure flow.
    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterances.add(utterance); 

    const voice = this.getVoice(gender);
    if (voice) utterance.voice = voice;
    utterance.lang = 'en-US';
    utterance.rate = rate; 
    utterance.pitch = 1.0;
    utterance.volume = 1.0; 

    utterance.onend = () => {
      this.activeUtterances.delete(utterance);
      if (sessionId === this.currentSessionId) {
        this.cleanup(onFinished);
      }
    };

    utterance.onerror = (event) => {
      this.activeUtterances.delete(utterance);
      if (event.error !== 'interrupted' && sessionId === this.currentSessionId) {
        console.error('Speech synthesis error:', event.error);
      }
      if (sessionId === this.currentSessionId) {
        this.cleanup(onFinished);
      }
    };

    this.synth.speak(utterance);
  }

  private cleanup(onFinished?: () => void) {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    if (this.onPlayStateChange) this.onPlayStateChange(false);
    if (onFinished) onFinished();
  }
}

const podcastEngine = PodcastEngine.getInstance();

// --- Main Application Component ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('vocabulary'); 
  const [vocabGroups, setVocabGroups] = useState<VocabularyGroup[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [wrongWords, setWrongWords] = useState<Set<string>>(new Set());
  const [intensiveWords, setIntensiveWords] = useState<Set<string>>(new Set());
  const [masteredWords, setMasteredWords] = useState<Set<string>>(new Set());
  const [visitedWords, setVisitedWords] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initData = () => {
      setVocabGroups(vocabularyData.groups || []);
      setArticles(readingData || []);

      const savedWrong = localStorage.getItem('lm_wrong');
      const savedIntensive = localStorage.getItem('lm_intensive');
      const savedMastered = localStorage.getItem('lm_mastered');
      const savedVisited = localStorage.getItem('lm_visited');

      if (savedWrong) setWrongWords(new Set(JSON.parse(savedWrong)));
      if (savedIntensive) setIntensiveWords(new Set(JSON.parse(savedIntensive)));
      if (savedMastered) setMasteredWords(new Set(JSON.parse(savedMastered)));
      if (savedVisited) setVisitedWords(new Set(JSON.parse(savedVisited)));
      
      setTimeout(() => setLoading(false), 800);
    };
    initData();
  }, []);

  useEffect(() => {
    localStorage.setItem('lm_wrong', JSON.stringify(Array.from(wrongWords)));
    localStorage.setItem('lm_intensive', JSON.stringify(Array.from(intensiveWords)));
    localStorage.setItem('lm_mastered', JSON.stringify(Array.from(masteredWords)));
    localStorage.setItem('lm_visited', JSON.stringify(Array.from(visitedWords)));
  }, [wrongWords, intensiveWords, masteredWords, visitedWords]);

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, word: string) => {
    const next = new Set(set);
    if (next.has(word)) next.delete(word);
    else next.add(word);
    setter(next);
  };

  const markVisited = (word: string) => {
    if (!visitedWords.has(word)) {
      const next = new Set(visitedWords);
      next.add(word);
      setVisitedWords(next);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 md:py-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Lingo<span className="text-emerald-600">Master</span>
            </h1>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest italic">Vocab & Reading Mastery</p>
          </div>
        </div>
        
        <nav className="flex gap-1 bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit">
          {[
            { id: 'vocabulary', label: 'Vocab', icon: BookOpen },
            { id: 'dictation', label: 'Dictation', icon: Headphones },
            { id: 'reading', label: 'Reading', icon: FileText }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveModule(item.id as Module); podcastEngine.stop(); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeModule === item.id 
                  ? 'bg-white text-emerald-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1">
        {activeModule === 'vocabulary' && (
          <VocabularyModule 
            groups={vocabGroups} 
            intensiveWords={intensiveWords}
            masteredWords={masteredWords}
            visitedWords={visitedWords}
            toggleSet={toggleSet}
            markVisited={markVisited}
            setIntensiveWords={setIntensiveWords}
            setMasteredWords={setMasteredWords}
          />
        )}
        {activeModule === 'dictation' && (
          <DictationModule 
            groups={vocabGroups} 
            wrongWords={wrongWords}
            setWrongWords={setWrongWords}
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
const VocabularyModule = ({ groups, intensiveWords, masteredWords, visitedWords, toggleSet, markVisited, setIntensiveWords, setMasteredWords }: any) => {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id);
  const [cardWordIdx, setCardWordIdx] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showBravo, setShowBravo] = useState(false);
  const bravoTriggeredRef = useRef<number | null>(null);
  const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
  const allAvailableCategories = useMemo(() => {
    const cats = new Set<string>();
    groups.forEach((g: VocabularyGroup) => g.words.forEach(w => cats.add(w.category)));
    const order = ['CET-4', 'CET-6', 'TEM-8', 'Business', 'Emotions', 'Daily'];
    const friendlyLabels: Record<string, string> = { 'CET-4': 'CET-4', 'CET-6': 'CET-6', 'TEM-8': '专八', 'Business': '商务', 'Emotions': '情绪', 'Daily': '日常' };
    return order.filter(id => cats.has(id)).map(id => ({ id, label: friendlyLabels[id] || id }));
  }, [groups]);
  const isAggregatedView = activeFilters.size > 0;
  const displayWordsList = useMemo(() => {
    if (!isAggregatedView) return selectedGroup?.words || [];
    const aggregated: Word[] = [];
    groups.forEach((g: VocabularyGroup) => { g.words.forEach(w => { if (activeFilters.has(w.category)) aggregated.push({ ...w, sourceGroupId: g.id }); }); });
    return aggregated;
  }, [selectedGroup, activeFilters, groups, isAggregatedView]);
  useEffect(() => {
    if (isAggregatedView || cardWordIdx !== null || !selectedGroup) return;
    if (bravoTriggeredRef.current === selectedGroupId) return;
    const allDone = selectedGroup.words.every((w: Word) => visitedWords.has(w.word) || masteredWords.has(w.word) || intensiveWords.has(w.word));
    if (allDone && selectedGroup.words.length > 0) {
      setShowBravo(true);
      bravoTriggeredRef.current = selectedGroupId;
      const timer = setTimeout(() => setShowBravo(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [visitedWords, masteredWords, intensiveWords, selectedGroupId, isAggregatedView, cardWordIdx]);
  const toggleFilter = (catId: string) => {
    const next = new Set(activeFilters);
    if (next.has(catId)) next.delete(catId); else next.add(catId);
    setActiveFilters(next);
    setCardWordIdx(null);
  };
  const handlePrev = () => { if (cardWordIdx !== null && cardWordIdx > 0) { setCardWordIdx(cardWordIdx - 1); markVisited(displayWordsList[cardWordIdx - 1].word); } };
  const handleNext = () => { if (cardWordIdx !== null && cardWordIdx < displayWordsList.length - 1) { setCardWordIdx(cardWordIdx + 1); markVisited(displayWordsList[cardWordIdx + 1].word); } };
  const currentCardWord = cardWordIdx !== null ? displayWordsList[cardWordIdx] : null;
  if (cardWordIdx !== null && currentCardWord) {
    return (
      <div className="animate-fade-in max-w-2xl mx-auto space-y-8 relative">
        <button onClick={() => setCardWordIdx(null)} className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-widest text-[10px] hover:text-slate-900 transition-colors"><ChevronLeft className="w-4 h-4" /> Back to List</button>
        <div className="bg-white rounded-[2.5rem] p-10 md:p-14 shadow-xl border border-slate-100">
           <div className="flex justify-between items-start mb-10">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2"><h2 className="text-4xl font-black text-slate-900 tracking-tighter">{currentCardWord.word}</h2><span className="text-emerald-500 font-mono text-lg font-bold">{currentCardWord.ipa}</span></div>
                <p className="text-2xl font-black text-slate-800">{currentCardWord.meaning}</p>
              </div>
              <button onClick={() => { podcastEngine.speak(currentCardWord.word); }} className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-all"><Volume2 className="w-8 h-8" /></button>
           </div>
           <div className="space-y-6 mb-12">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Examples</h3>
             {currentCardWord.examples.map((ex: any, i: number) => (
                <div key={i} className="bg-slate-50 p-6 rounded-2xl border-l-4 border-emerald-500">
                   <div className="flex justify-between items-start mb-2"><p className="text-lg text-slate-800 font-medium leading-relaxed pr-6">{ex.en}</p><button onClick={() => { podcastEngine.speak(ex.en); }} className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all flex-shrink-0"><Volume2 className="w-4 h-4" /></button></div>
                   <p className="text-slate-500 font-medium">{ex.zh}</p>
                </div>
             ))}
           </div>
           <div className="grid grid-cols-2 gap-4 mb-10">
             <button onClick={() => toggleSet(intensiveWords, setIntensiveWords, currentCardWord.word)} className={`py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${intensiveWords.has(currentCardWord.word) ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Star className={`w-5 h-5 ${intensiveWords.has(currentCardWord.word) ? 'fill-current' : ''}`} /> 加入强化</button>
             <button onClick={() => toggleSet(masteredWords, setMasteredWords, currentCardWord.word)} className={`py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${masteredWords.has(currentCardWord.word) ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Check className="w-5 h-5" /> 已掌握</button>
           </div>
           <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
             <button disabled={cardWordIdx === 0} onClick={handlePrev} className="flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-900 disabled:opacity-20"><ChevronLeft className="w-4 h-4" /> Previous</button>
             <span className="text-slate-300 font-black text-[10px]">{cardWordIdx + 1} / {displayWordsList.length}</span>
             <button disabled={cardWordIdx === displayWordsList.length - 1} onClick={handleNext} className="flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-slate-900 disabled:opacity-20">Next <ChevronRight className="w-4 h-4" /></button>
           </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6 animate-fade-in relative">
      {showBravo && (<div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-white border-2 border-emerald-100 px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-4 animate-fade-in"><div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg animate-bounce"><Sparkles className="w-5 h-5" /></div><div><h4 className="font-black text-slate-900 text-lg leading-tight">Bravo! 👏</h4><p className="text-emerald-600 font-bold text-xs uppercase tracking-widest">Completed this group.</p></div></div>)}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
        <div className="flex items-center gap-2 pr-4 border-r border-slate-200"><Filter className="w-4 h-4 text-slate-400" /><span className="text-xs font-black text-slate-400 uppercase tracking-tighter">Filter</span></div>
        <div className="flex gap-2 pl-2">
          {allAvailableCategories.map(cat => (<button key={cat.id} onClick={() => toggleFilter(cat.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${activeFilters.has(cat.id) ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-200'}`}>{cat.label}</button>))}
          {isAggregatedView && (<button onClick={() => setActiveFilters(new Set())} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-all">Clear</button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {!isAggregatedView && (<aside className="lg:col-span-1 space-y-1.5 h-fit lg:sticky lg:top-4"><h3 className="text-[10px] font-black text-emerald-600/60 uppercase tracking-[0.2em] px-3 mb-3 italic">Study Groups</h3><div className="flex flex-col gap-1">{groups.map((group: any) => (<button key={group.id} onClick={() => { setSelectedGroupId(group.id); setCardWordIdx(null); }} className={`w-full text-left px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${selectedGroupId === group.id ? 'bg-emerald-100/60 text-emerald-700 font-bold shadow-sm' : 'text-emerald-400/80 hover:bg-emerald-50 hover:text-emerald-600'}`}>{group.name}</button>))}</div></aside>)}
        <div className={`${isAggregatedView ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-3`}>
          {displayWordsList.length > 0 ? displayWordsList.map((word: any, idx: number) => (<div key={`${word.word}-${word.sourceGroupId || selectedGroupId}`} onClick={() => { setCardWordIdx(idx); markVisited(word.word); }} className={`bg-white rounded-2xl p-5 border flex items-center justify-between group cursor-pointer transition-all hover:shadow-md ${masteredWords.has(word.word) ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 hover:border-emerald-300'}`}><div className="flex-1"><div className="flex items-center gap-3 mb-1"><h3 className="text-xl font-bold text-slate-800 tracking-tight">{word.word}</h3><span className="text-emerald-500 font-mono text-xs font-bold">{word.ipa}</span></div><p className="text-slate-500 font-medium">{word.meaning}</p></div><div className="flex items-center gap-3">{masteredWords.has(word.word) && <Check className="w-5 h-5 text-emerald-500 bg-emerald-50 rounded-full p-1" />}{intensiveWords.has(word.word) && <Star className="w-5 h-5 text-amber-500 fill-amber-500 bg-amber-50 rounded-full p-1" />}<button onClick={(e) => { e.stopPropagation(); podcastEngine.stop(); podcastEngine.speak(word.word); }} className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all"><Volume2 className="w-5 h-5" /></button></div></div>)) : (<div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-slate-200"><Filter className="w-16 h-16 text-slate-100 mx-auto mb-4" /><p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No entries found.</p></div>)}
        </div>
      </div>
    </div>
  );
};

// --- Dictation Module ---
const DictationModule = ({ groups, wrongWords, setWrongWords }: any) => {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [reviewInput, setReviewInput] = useState<Record<string, string>>({});
  const [showMeaningHint, setShowMeaningHint] = useState(false);

  const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
  const currentWord = selectedGroup?.words[currentWordIdx];
  
  const mistakesList = useMemo(() => { 
    const list: Word[] = []; 
    groups.forEach((g: VocabularyGroup) => { 
      g.words.forEach(w => { 
        if (wrongWords.has(w.word)) list.push(w); 
      }); 
    }); 
    return list; 
  }, [wrongWords, groups]);

  const handleStart = (id: number) => { 
    setSelectedGroupId(id); 
    setCurrentWordIdx(0); 
    setUserInput(''); 
    setFeedback(null); 
    setShowResult(false); 
    setScore(0); 
    setIsReviewMode(false); 
    setShowMeaningHint(false); 
  };

  const handleCheck = (e?: React.FormEvent) => { 
    e?.preventDefault(); 
    if (!currentWord || feedback) return; 
    const isCorrect = userInput.trim().toLowerCase() === currentWord.word.toLowerCase(); 
    if (isCorrect) { 
      setFeedback('correct'); 
      setScore(s => s + 1); 
    } else { 
      setFeedback('wrong'); 
      const nextWrong = new Set(wrongWords); 
      nextWrong.add(currentWord.word); 
      setWrongWords(nextWrong); 
    } 
  };

  const handleNext = () => { 
    if (currentWordIdx < selectedGroup.words.length - 1) { 
      setCurrentWordIdx(i => i + 1); 
      setUserInput(''); 
      setFeedback(null); 
      setShowMeaningHint(false); 
    } else { 
      setShowResult(true); 
    } 
  };

  const formatCorrectWord = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

  if (isReviewMode) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setIsReviewMode(false)} className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-900 transition-colors">
            <ChevronLeft className="w-4 h-4" /> Exit Review
          </button>
          <div className="bg-rose-50 px-4 py-2 rounded-xl text-rose-600 font-bold text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Mistake Collection ({mistakesList.length})
          </div>
        </div>
        {mistakesList.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <Sparkles className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <p className="text-slate-400 font-bold">Excellent! All mastered.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mistakesList.map((word: any, idx: number) => (
              <div key={idx} className="bg-white border border-slate-100 p-6 rounded-[2rem] flex flex-col md:flex-row gap-6 md:items-center shadow-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold text-slate-800">{word.word}</h3>
                    <button onClick={() => { podcastEngine.speak(word.word); }} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors">
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-slate-500 font-medium text-sm italic">{word.meaning}</p>
                </div>
                <div className="flex-1">
                  <input 
                    type="text" 
                    value={reviewInput[word.word] || ''} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setReviewInput(prev => ({...prev, [word.word]: val}));
                      if (val.trim().toLowerCase() === word.word.toLowerCase()) {
                        setTimeout(() => {
                          const nextWrong = new Set(wrongWords);
                          nextWrong.delete(word.word);
                          setWrongWords(nextWrong);
                        }, 800);
                      }
                    }} 
                    placeholder="Type to clear..." 
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-bold transition-all" 
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (showResult) {
    return (
      <div className="max-w-md mx-auto text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100 animate-fade-in">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Sparkles className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-black text-slate-800 mb-2">Practice Done!</h2>
        <p className="text-slate-400 font-medium mb-10">You got {score} / {selectedGroup.words.length} correct.</p>
        <div className="flex flex-col gap-3 px-10">
          <button onClick={() => setSelectedGroupId(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl">Back to Selection</button>
          {wrongWords.size > 0 && (
            <button onClick={() => setIsReviewMode(true)} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-rose-100 border border-rose-100">Review Mistakes ({wrongWords.size})</button>
          )}
        </div>
      </div>
    );
  }

  if (selectedGroupId && currentWord) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8 px-4">
          <button onClick={() => setSelectedGroupId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
          <div className="bg-emerald-50 px-4 py-1.5 rounded-full text-emerald-600 font-black text-[10px] uppercase tracking-widest">
            {currentWordIdx + 1} / {selectedGroup.words.length}
          </div>
        </div>
        <div className="bg-white rounded-[3rem] p-10 md:p-16 shadow-xl border border-slate-50 text-center relative overflow-hidden">
          <button onClick={() => { podcastEngine.speak(currentWord.word); }} className="w-24 h-24 bg-emerald-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-xl shadow-emerald-100 active:scale-95 transition-transform">
            <Volume2 className="w-10 h-10" />
          </button>
          <form onSubmit={handleCheck} className="space-y-8">
            <div className="space-y-4">
              <input 
                type="text" 
                autoFocus 
                value={userInput} 
                onChange={(e) => setUserInput(e.target.value)} 
                placeholder="Type what you hear..." 
                disabled={!!feedback} 
                className={`w-full text-3xl font-black text-center border-b-2 py-5 focus:outline-none transition-all placeholder:text-slate-200 bg-transparent ${ feedback === 'correct' ? 'border-emerald-500 text-emerald-600' : feedback === 'wrong' ? 'border-rose-400 text-rose-500' : 'border-slate-100 focus:border-emerald-500' }`} 
              />
              {showMeaningHint && !feedback && (
                <p className="text-slate-500 font-bold text-lg animate-fade-in py-2 bg-emerald-50/50 rounded-xl">{currentWord.meaning}</p>
              )}
            </div>
            {feedback === 'correct' && (
              <div className="animate-fade-in">
                <p className="text-emerald-500 font-bold mb-6">Correct! well done.</p>
                <button type="button" onClick={handleNext} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg"> Next Word <ChevronRight className="w-5 h-5" /> </button>
              </div>
            )}
            {feedback === 'wrong' && (
              <div className="animate-fade-in space-y-6">
                <div className="bg-rose-50 border border-rose-100 p-8 rounded-[2.5rem] text-center shadow-sm">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Correct Answer:</p>
                  <p className="text-4xl font-black text-rose-600 tracking-tight mb-2">{formatCorrectWord(currentWord.word)}</p>
                  <p className="text-slate-500 font-medium text-lg italic">{currentWord.meaning}</p>
                </div>
                <button type="button" onClick={handleNext} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg"> Continue <ChevronRight className="w-5 h-5" /> </button>
              </div>
            )}
            {!feedback && (
              <div className="flex flex-col gap-4">
                <button type="submit" className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-lg hover:bg-emerald-700 shadow-lg active:scale-95 transition-all">Submit</button>
                <button type="button" onClick={() => setShowMeaningHint(!showMeaningHint)} className="flex items-center gap-2 mx-auto text-slate-400 hover:text-emerald-600 font-black text-[10px] uppercase tracking-widest transition-colors">
                  {showMeaningHint ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />} {showMeaningHint ? '隐藏中文释义' : '查看中文释义'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex justify-between items-center px-1">
        <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Dictation Practice</h2>
        {wrongWords.size > 0 && (
          <button onClick={() => setIsReviewMode(true)} className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-700 rounded-xl font-black text-[10px] uppercase tracking-widest border border-rose-100 shadow-sm hover:bg-rose-100 transition-colors">
            <AlertCircle className="w-4 h-4" /> Mistake Collection ({wrongWords.size})
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group: any) => (
          <button key={group.id} onClick={() => handleStart(group.id)} className="p-8 bg-white rounded-[2.5rem] border border-slate-100 text-left hover:border-emerald-300 transition-all group shadow-sm">
            <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-6 group-hover:text-emerald-600 transition-colors">
              <Headphones className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-1">{group.name}</h3>
            <p className="text-slate-400 text-sm font-medium mb-8">{group.words.length} Vocabulary Items</p>
            <div className="flex items-center text-emerald-600 text-xs font-black gap-2 uppercase tracking-widest">
              Start Practice <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// --- Article Detail Component ---
// Forced re-mounting pattern used via "key" to ensure full resource cleanup on article switch.
const ArticleDetailView = ({ article, onBack }: { article: Article; onBack: () => void; key?: React.Key }) => {
  const [activeParaIdx, setActiveParaIdx] = useState<number | null>(null);
  const [showTranslationMap, setShowTranslationMap] = useState<Record<number, boolean>>({});

  const [paraStates, setParaStates] = useState<Record<number, {
    isRecording: boolean;
    recordedUrl: string | null;
  }>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Hard stop everything on unmount (navigation / component switch)
  useEffect(() => {
    return () => {
      podcastEngine.stop();
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const updateParaState = (idx: number, patch: any) => {
    setParaStates(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] || { isRecording: false, recordedUrl: null }), ...patch }
    }));
  };

  const toggleTranslation = (idx: number) => {
    setShowTranslationMap(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const stopAll = () => {
    podcastEngine.stop();
    setActiveParaIdx(null);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.src = "";
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
  };

  const handlePlayPara = (idx: number, text: string) => {
    if (activeParaIdx === idx) {
      stopAll();
      return;
    }
    stopAll();
    setActiveParaIdx(idx);
    podcastEngine.speak(text, 0.95, 'female', () => {
       setActiveParaIdx(null);
    });
  };

  const handleRecord = async (idx: number) => {
    const state = paraStates[idx] || { isRecording: false };
    if (state.isRecording) {
        stopAll();
        return;
    }
    stopAll();
    setActiveParaIdx(idx);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            updateParaState(idx, { recordedUrl: url, isRecording: false });
        };
        mediaRecorderRef.current.start();
        updateParaState(idx, { isRecording: true });
    } catch (err) { 
        console.error('Mic access denied:', err); 
    }
  };

  const handleCheckShadow = (url: string) => {
    stopAll();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = url;
      audioPlayerRef.current.play();
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-32">
      <audio ref={audioPlayerRef} className="hidden" />
      
      {/* Article Detail Header Controls */}
      <div className="flex items-center justify-between mb-12 px-2 sticky top-0 bg-[#f8fafc]/95 backdrop-blur-md z-20 py-4 border-b border-slate-100/50">
        <button onClick={() => { stopAll(); onBack(); }} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-950 font-bold uppercase tracking-[0.2em] text-[9px] transition-all">
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
      </div>

      <div className="mb-14 px-6 text-center">
        <h1 className="text-xl md:text-2xl font-bold text-slate-950 mb-4 leading-[1.4] font-serif-magazine tracking-tight">
          {article.title}
        </h1>
        <p className="text-slate-400 text-[13px] md:text-[14px] font-serif italic mb-8 leading-relaxed max-w-lg mx-auto opacity-90">
          {article.titleZh}
        </p>
        <div className="flex items-center justify-center gap-4 text-[8px] font-black uppercase tracking-widest text-slate-300">
           <Clock className="w-2.5 h-2.5" /> {article.readingTime || '5 min read'}
        </div>
        <div className="h-px w-10 bg-slate-200 mx-auto mt-10"></div>
      </div>

      <div className="space-y-12 px-6">
        {article.paragraphs.map((para, i) => {
          const state = paraStates[i] || { isRecording: false, recordedUrl: null };
          const isActive = activeParaIdx === i;
          const isTranslated = !!showTranslationMap[i];
          
          return (
            <div key={i} className="group flex flex-col gap-4">
              <div className="flex gap-6 items-start">
                <div className="flex-1">
                   <p className={`text-[15px] md:text-[16px] leading-[1.6] font-serif-magazine antialiased transition-colors duration-500 ${isActive ? 'text-emerald-700 font-medium' : 'text-slate-700'}`}>
                    {para.en}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handlePlayPara(i, para.en)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-sm border ${isActive && !state.isRecording ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 hover:text-emerald-600 border-slate-100'}`} title="发音">
                    {isActive && !state.isRecording ? <Pause className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button onClick={() => handleRecord(i)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-sm border ${state.isRecording ? 'bg-rose-500 text-white border-rose-500 animate-pulse' : 'bg-white text-slate-400 hover:text-rose-600 border-slate-100'}`} title="跟读">
                    <Mic className="w-3 h-3" />
                  </button>
                  <button disabled={!state.recordedUrl} onClick={() => handleCheckShadow(state.recordedUrl!)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-95 shadow-sm border ${!state.recordedUrl ? 'opacity-20 cursor-not-allowed bg-slate-50 text-slate-200 border-transparent' : 'bg-white text-emerald-600 border-emerald-100 hover:bg-emerald-50'}`} title="回放">
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => toggleTranslation(i)} 
                  className="w-fit flex items-center gap-1.5 text-slate-400 hover:text-emerald-600 font-bold uppercase tracking-[0.1em] text-[9px] transition-all bg-slate-100/50 px-2 py-1 rounded"
                >
                  {isTranslated ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                  {isTranslated ? '隐藏中文翻译' : '查看中文翻译'}
                </button>
                {isTranslated && (
                  <div className="animate-fade-in px-4 py-3 bg-emerald-50/50 rounded-xl border-l-2 border-emerald-200">
                    <p className="text-slate-500 text-[14px] md:text-[15px] leading-[1.6] italic font-serif">{para.zh}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {article.source && (
        <div className="mt-12 px-6 pt-6 border-t border-slate-100 text-center">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] italic">来源：{article.source}</p>
        </div>
      )}

      {article.keywords && article.keywords.length > 0 && (
        <section className="mt-24 pt-12 border-t border-slate-200 px-6">
          <h3 className="text-[8px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10 text-center italic">Key Words</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
            {article.keywords.map((kw: any) => (
              <div key={kw.word} className="flex items-center justify-between border-b border-slate-50 pb-5 group">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-slate-950 text-[15px]">{kw.word}</span>
                    {kw.ipa && <span className="text-[10px] text-emerald-600 font-mono font-medium">{kw.ipa}</span>}
                  </div>
                  <p className="text-[12px] text-slate-500 font-medium italic opacity-85">{kw.meaning}</p>
                </div>
                <button onClick={() => { stopAll(); podcastEngine.speak(kw.word); }} className="w-7 h-7 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-slate-900 hover:text-white transition-all shadow-sm">
                  <Volume2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// --- Reading Module ---
const ReadingModule = ({ articles }: { articles: Article[] }) => {
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const selectedArticle = articles.find((a: any) => a.id === selectedArticleId);

  // Strict hard stop of audio engine when switching context.
  useEffect(() => {
    podcastEngine.stop();
  }, [selectedArticleId]);

  if (selectedArticleId && selectedArticle) {
    // Component key is set to ID to force full re-mount on selection.
    return <ArticleDetailView key={selectedArticleId} article={selectedArticle} onBack={() => setSelectedArticleId(null)} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in pt-4">
      {articles.map((article: any) => (
        <button 
          key={article.id} 
          onClick={() => setSelectedArticleId(article.id)} 
          className="group text-left bg-white rounded-[1.8rem] shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden transition-all duration-500 hover:shadow-xl hover:-translate-y-1"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-slate-50">
            <img src={article.imageUrl} className="w-full h-full object-cover transition-transform duration-[6s] group-hover:scale-110" alt="" />
            <div className="absolute inset-0 bg-slate-900/10 group-hover:bg-transparent transition-colors" />
          </div>
          <div className="flex-1 px-7 py-7">
            <h3 className="text-[15px] md:text-[16px] font-bold text-slate-950 mb-3 leading-snug tracking-tight font-serif-magazine group-hover:text-emerald-700 transition-colors">
              {article.title}
            </h3>
            <p className="text-slate-400 text-[10px] md:text-[11px] font-medium italic leading-relaxed mb-4 line-clamp-1">{article.titleZh}</p>
            <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-slate-300">
               <Clock className="w-2.5 h-2.5" /> {article.readingTime || '5 min read'}
            </div>
          </div>
          <div className="mt-auto px-7 pb-7 pt-4 flex items-center text-slate-900 text-[8px] font-black uppercase tracking-[0.2em] group-hover:text-emerald-600 transition-colors">
            Start Reading <ChevronRight className="w-2.5 h-2.5 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      ))}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);