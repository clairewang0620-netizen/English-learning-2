
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
  Sparkles,
  AlertCircle,
  User,
  UserCircle,
  Eye, 
  EyeOff,
  Play,
  RotateCcw,
  Book,
  PenTool,
  Pause,
  RotateCw
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
  sourceGroupId?: number; // Internal tracking
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
  imageUrl?: string;
  paragraphs: { en: string; zh: string }[];
  keywords: { word: string; ipa: string; definition: string }[];
  sentencePatterns?: string[];
}

type Module = 'vocabulary' | 'dictation' | 'reading';
type NarratorGender = 'female' | 'male';

// --- Global Narrator Engine ---

class PodcastEngine {
  private static instance: PodcastEngine;
  private synth: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  public onPlayStateChange?: (playing: boolean, text?: string) => void;
  private isInterrupted: boolean = false;
  private activeUtterances: Set<SpeechSynthesisUtterance> = new Set();

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
    this.isInterrupted = true;
    this.synth.cancel();
    this.activeUtterances.clear();
    if (this.onPlayStateChange) this.onPlayStateChange(false);
  }

  async speak(text: string, rate: number = 0.85, gender: NarratorGender = 'female', onFinished?: () => void) {
    this.stop();
    this.isInterrupted = false;
    
    if (this.onPlayStateChange) this.onPlayStateChange(true, text);

    const voice = this.getVoice(gender);
    const sentences = text.split(/(?<=[.!?])\s+/);
    
    let currentIndex = 0;

    const playNext = () => {
      if (this.isInterrupted || currentIndex >= sentences.length) {
        if (!this.isInterrupted && this.onPlayStateChange) {
          this.onPlayStateChange(false);
        }
        if (!this.isInterrupted && onFinished) onFinished();
        this.activeUtterances.clear();
        return;
      }

      const content = sentences[currentIndex].trim();
      if (!content) {
        currentIndex++;
        playNext();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(content);
      this.activeUtterances.add(utterance);

      if (voice) utterance.voice = voice;
      utterance.lang = 'en-US';
      utterance.rate = rate; 
      utterance.pitch = 1.0;
      utterance.volume = 0.85;

      utterance.onend = () => {
        this.activeUtterances.delete(utterance);
        currentIndex++;
        // Natural breath gap (approx 110ms)
        setTimeout(playNext, 110);
      };

      utterance.onerror = () => {
        this.activeUtterances.delete(utterance);
        if (this.onPlayStateChange) this.onPlayStateChange(false);
      };

      this.synth.speak(utterance);
    };

    playNext();
  }
}

const podcastEngine = PodcastEngine.getInstance();

// --- Main Application Component ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('vocabulary'); 
  const [vocabGroups, setVocabGroups] = useState<VocabularyGroup[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [playbackRate, setPlaybackRate] = useState(0.92); 
  const [narratorGender, setNarratorGender] = useState<NarratorGender>('female');
  
  const [wrongWords, setWrongWords] = useState<Set<string>>(new Set());
  const [intensiveWords, setIntensiveWords] = useState<Set<string>>(new Set());
  const [masteredWords, setMasteredWords] = useState<Set<string>>(new Set());
  const [visitedWords, setVisitedWords] = useState<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const initData = () => {
      setVocabGroups(vocabularyData.groups || []);
      setArticles(readingData || []);

      const savedWrong = localStorage.getItem('lm_wrong');
      const savedIntensive = localStorage.getItem('lm_intensive');
      const savedMastered = localStorage.getItem('lm_mastered');
      const savedVisited = localStorage.getItem('lm_visited');
      const savedRate = localStorage.getItem('lm_rate');
      const savedGender = localStorage.getItem('lm_gender');

      if (savedWrong) setWrongWords(new Set(JSON.parse(savedWrong)));
      if (savedIntensive) setIntensiveWords(new Set(JSON.parse(savedIntensive)));
      if (savedMastered) setMasteredWords(new Set(JSON.parse(savedMastered)));
      if (savedVisited) setVisitedWords(new Set(JSON.parse(savedVisited)));
      if (savedRate) setPlaybackRate(parseFloat(savedRate));
      if (savedGender) setNarratorGender(savedGender as NarratorGender);
      
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
    localStorage.setItem('lm_visited', JSON.stringify(Array.from(visitedWords)));
    localStorage.setItem('lm_rate', playbackRate.toString());
    localStorage.setItem('lm_gender', narratorGender);
  }, [wrongWords, intensiveWords, masteredWords, visitedWords, playbackRate, narratorGender, initialized]);

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
            playbackRate={playbackRate} 
            gender={narratorGender}
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
            playbackRate={playbackRate} 
            gender={narratorGender} 
            wrongWords={wrongWords}
            setWrongWords={setWrongWords}
          />
        )}
        {activeModule === 'reading' && (
          <ReadingModule 
            articles={articles} 
            playbackRate={playbackRate} 
            gender={narratorGender} 
          />
        )}
      </main>
    </div>
  );
};

// --- Vocabulary Module (Locked - No changes allowed here) ---
const VocabularyModule = ({ 
  groups, playbackRate, gender, intensiveWords, masteredWords, visitedWords, toggleSet, markVisited, setIntensiveWords, setMasteredWords 
}: any) => {
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
    const friendlyLabels: Record<string, string> = { 'CET-4': 'CET-4', 'CET-6': 'CET-6', 'TEM-8': '专八', 'Business': '商务英语', 'Emotions': '情绪表达', 'Daily': '日常生活' };
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
              <button onClick={() => podcastEngine.speak(currentCardWord.word, 0.9, gender)} className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-all"><Volume2 className="w-8 h-8" /></button>
           </div>
           <div className="space-y-6 mb-12">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">Contextual Examples</h3>
             {currentCardWord.examples.map((ex: any, i: number) => (
                <div key={i} className="bg-slate-50 p-6 rounded-2xl border-l-4 border-emerald-500 relative">
                   <div className="flex justify-between items-start mb-2"><p className="text-lg text-slate-800 font-medium leading-relaxed pr-10">{ex.en}</p><button onClick={() => podcastEngine.speak(ex.en, 0.9, gender)} className="p-1.5 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all flex-shrink-0"><Volume2 className="w-4 h-4" /></button></div>
                   <p className="text-slate-500 font-medium">{ex.zh}</p>
                </div>
             ))}
           </div>
           <div className="grid grid-cols-2 gap-4 mb-10">
             <button onClick={() => toggleSet(intensiveWords, setIntensiveWords, currentCardWord.word)} className={`py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${intensiveWords.has(currentCardWord.word) ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}><Star className={`w-5 h-5 ${intensiveWords.has(currentCardWord.word) ? 'fill-current' : ''}`} /> 加入强化词库</button>
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
      {showBravo && (<div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-white border-2 border-emerald-100 px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-4 animate-fade-in"><div className="w-10 h-10 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg animate-bounce"><Sparkles className="w-5 h-5" /></div><div><h4 className="font-black text-slate-900 text-lg leading-tight">Bravo! 👏</h4><p className="text-emerald-600 font-bold text-xs uppercase tracking-widest">You’ve completed this group.</p></div></div>)}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar">
        <div className="flex items-center gap-2 pr-4 border-r border-slate-200"><Filter className="w-4 h-4 text-slate-400" /><span className="text-xs font-black text-slate-400 uppercase tracking-tighter">Filter</span></div>
        <div className="flex gap-2 pl-2">
          {allAvailableCategories.map(cat => (<button key={cat.id} onClick={() => toggleFilter(cat.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border ${activeFilters.has(cat.id) ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-200'}`}>{cat.label}</button>))}
          {isAggregatedView && (<button onClick={() => setActiveFilters(new Set())} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-all">Clear All</button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {!isAggregatedView && (<aside className="lg:col-span-1 space-y-1.5 h-fit lg:sticky lg:top-4"><h3 className="text-[10px] font-black text-emerald-600/60 uppercase tracking-[0.2em] px-3 mb-3 italic">Study Groups</h3><div className="flex flex-col gap-1">{groups.map((group: any) => (<button key={group.id} onClick={() => { setSelectedGroupId(group.id); setCardWordIdx(null); }} className={`w-full text-left px-4 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium ${selectedGroupId === group.id ? 'bg-emerald-100/60 text-emerald-700 font-bold shadow-sm' : 'text-emerald-400/80 hover:bg-emerald-50 hover:text-emerald-600'}`}>{group.name}</button>))}</div></aside>)}
        <div className={`${isAggregatedView ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-3`}>
          {displayWordsList.length > 0 ? displayWordsList.map((word: any, idx: number) => (<div key={`${word.word}-${word.sourceGroupId || selectedGroupId}`} onClick={() => { setCardWordIdx(idx); markVisited(word.word); }} className={`bg-white rounded-2xl p-5 border flex items-center justify-between group cursor-pointer transition-all hover:shadow-md ${masteredWords.has(word.word) ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 hover:border-emerald-300'}`}><div className="flex-1"><div className="flex items-center gap-3 mb-1"><h3 className="text-xl font-bold text-slate-800 tracking-tight">{word.word}</h3><span className="text-emerald-500 font-mono text-xs font-bold">{word.ipa}</span></div><p className="text-slate-500 font-medium">{word.meaning}</p></div><div className="flex items-center gap-3">{masteredWords.has(word.word) && <Check className="w-5 h-5 text-emerald-500 bg-emerald-50 rounded-full p-1" />}{intensiveWords.has(word.word) && <Star className="w-5 h-5 text-amber-500 fill-amber-500 bg-amber-50 rounded-full p-1" />}<button onClick={(e) => { e.stopPropagation(); podcastEngine.speak(word.word, 0.9, gender); }} className="p-3 rounded-xl bg-slate-50 text-slate-400 hover:bg-emerald-600 hover:text-white transition-all"><Volume2 className="w-5 h-5" /></button></div></div>)) : (<div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-slate-200"><Filter className="w-16 h-16 text-slate-100 mx-auto mb-4" /><p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No entries found for this selection.</p><button onClick={() => setActiveFilters(new Set())} className="mt-4 text-emerald-600 font-black text-[10px] uppercase tracking-widest underline decoration-2 underline-offset-4">Reset Filters</button></div>)}
        </div>
      </div>
    </div>
  );
};

// --- Dictation Module (Locked - No changes allowed here) ---
const DictationModule = ({ groups, playbackRate, gender, wrongWords, setWrongWords }: any) => {
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [reviewInput, setReviewInput] = useState<Record<string, string>>({});
  const [masteredFeedback, setMasteredFeedback] = useState<string | null>(null);
  const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
  const currentWord = selectedGroup?.words[currentWordIdx];
  const mistakesList = useMemo(() => { const list: Word[] = []; groups.forEach((g: VocabularyGroup) => { g.words.forEach(w => { if (wrongWords.has(w.word)) list.push(w); }); }); return list; }, [wrongWords, groups]);
  const handleStart = (id: number) => { setSelectedGroupId(id); setCurrentWordIdx(0); setUserInput(''); setFeedback(null); setShowResult(false); setScore(0); setIsReviewMode(false); setShowMeaning(false); };
  const handleCheck = (e?: React.FormEvent) => { e?.preventDefault(); if (!currentWord || feedback) return; const isCorrect = userInput.trim().toLowerCase() === currentWord.word.toLowerCase(); if (isCorrect) { setFeedback('correct'); setScore(s => s + 1); } else { setFeedback('wrong'); const nextWrong = new Set(wrongWords); nextWrong.add(currentWord.word); setWrongWords(nextWrong); localStorage.setItem('lm_wrong', JSON.stringify(Array.from(nextWrong))); } };
  const handleNext = () => { if (currentWordIdx < selectedGroup.words.length - 1) { setCurrentWordIdx(i => i + 1); setUserInput(''); setFeedback(null); setShowMeaning(false); } else { setShowResult(true); } };
  const handleReviewCheck = (word: Word, input: string) => { if (input.trim().toLowerCase() === word.word.toLowerCase()) { setMasteredFeedback(word.word); setTimeout(() => { const nextWrong = new Set(wrongWords); nextWrong.delete(word.word); setWrongWords(nextWrong); localStorage.setItem('lm_wrong', JSON.stringify(Array.from(nextWrong))); setMasteredFeedback(null); setReviewInput(prev => { const next = {...prev}; delete next[word.word]; return next; }); }, 1000); } };

  if (isReviewMode) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
        <button onClick={() => setIsReviewMode(false)} className="flex items-center gap-2 text-slate-400 font-black uppercase tracking-widest text-[10px] hover:text-slate-900 mb-6 transition-colors"><ChevronLeft className="w-4 h-4" /> Exit Review</button>
        <h2 className="text-2xl font-black text-rose-600 italic tracking-tighter mb-8 border-b border-rose-50 pb-4">Mistake Collection</h2>
        {mistakesList.length === 0 ? (<div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm"><Sparkles className="w-12 h-12 text-emerald-500 mx-auto mb-4" /><p className="text-slate-400 font-bold">Excellent! Your mistake collection is empty.</p></div>) : (<div className="space-y-4">{mistakesList.map((word: any, idx: number) => (<div key={idx} className="bg-white border border-slate-100 p-6 rounded-3xl flex flex-col md:flex-row gap-6 md:items-center shadow-sm hover:shadow-md transition-all relative overflow-hidden">{masteredFeedback === word.word && (<div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center z-10 backdrop-blur-[2px] animate-fade-in"><div className="bg-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-emerald-600 font-black text-xs uppercase tracking-widest border border-emerald-100"><Check className="w-4 h-4" /> 已掌握</div></div>)}<div className="flex-1"><div className="flex items-center gap-3 mb-1"><h3 className="text-xl font-bold text-slate-800">{word.word}</h3><button onClick={() => podcastEngine.speak(word.word, 0.9, gender)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"><Volume2 className="w-4 h-4" /></button></div><p className="text-slate-500 font-medium text-sm italic">{word.meaning}</p></div><div className="flex-1"><input type="text" spellCheck={false} autoComplete="off" value={reviewInput[word.word] || ''} onChange={(e) => { const val = e.target.value; setReviewInput(prev => ({...prev, [word.word]: val})); handleReviewCheck(word, val); }} placeholder="Type to master..." className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 font-bold" /></div></div>))}</div>)}
      </div>
    );
  }
  if (showResult) {
    return (
      <div className="max-w-md mx-auto text-center py-20 bg-white rounded-[3rem] shadow-xl border border-slate-100 animate-fade-in"><div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6"><Sparkles className="w-10 h-10" /></div><h2 className="text-3xl font-black text-slate-800 mb-2">Practice Done!</h2><p className="text-slate-400 font-medium mb-10">You got {score} / {selectedGroup.words.length} correct.</p><div className="flex flex-col gap-3 px-10"><button onClick={() => setSelectedGroupId(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl">Return to Selection</button>{wrongWords.size > 0 && (<button onClick={() => setIsReviewMode(true)} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-rose-100 transition-all border border-rose-100">Review Mistakes ({wrongWords.size})</button>)}</div></div>
    );
  }
  if (selectedGroupId && currentWord) {
    const formattedCorrectAnswer = currentWord.word.charAt(0).toUpperCase() + currentWord.word.slice(1).toLowerCase();
    return (
      <div className="max-w-2xl mx-auto animate-fade-in"><div className="flex items-center justify-between mb-8 px-4"><button onClick={() => setSelectedGroupId(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="w-6 h-6" /></button><div className="bg-emerald-50 px-4 py-1.5 rounded-full text-emerald-600 font-black text-[10px] uppercase tracking-widest border border-emerald-100 shadow-sm">{currentWordIdx + 1} / {selectedGroup.words.length}</div></div><div className="bg-white rounded-[3rem] p-10 md:p-16 shadow-xl border border-slate-50 text-center relative overflow-hidden">{feedback === 'correct' && <div className="absolute top-0 inset-x-0 h-2 bg-emerald-500 animate-pulse"></div>}{feedback === 'wrong' && <div className="absolute top-0 inset-x-0 h-2 bg-rose-400"></div>}<button onClick={() => podcastEngine.speak(currentWord.word, 0.9, gender)} className="w-24 h-24 bg-emerald-600 text-white rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 hover:scale-105 transition-all shadow-xl shadow-emerald-100 active:scale-95 group"><Volume2 className="w-10 h-10 group-hover:scale-110 transition-transform" /></button><form onSubmit={handleCheck} className="space-y-10"><input type="text" autoFocus spellCheck={false} autoComplete="off" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="Spell what you hear..." disabled={!!feedback} className={`w-full text-3xl font-black text-center border-b-2 py-5 focus:outline-none transition-all placeholder:text-slate-200 bg-transparent ${feedback === 'correct' ? 'border-emerald-500 text-emerald-600' : feedback === 'wrong' ? 'border-rose-400 text-rose-500' : 'border-slate-100 focus:border-emerald-500'}`} />{feedback === 'correct' && (<div className="animate-fade-in"><div className="flex items-center justify-center gap-2 text-emerald-600 mb-8 bg-emerald-50 py-4 px-6 rounded-2xl border border-emerald-100 inline-block"><Sparkles className="w-5 h-5" /><p className="text-xl font-black">Correct! Bravo 👏</p></div><button type="button" onClick={handleNext} className="w-full py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg">Next Word <ChevronRight className="w-5 h-5" /></button></div>)}{feedback === 'wrong' && (<div className="animate-fade-in space-y-6"><div className="bg-rose-50 border border-rose-100 p-8 rounded-[2.5rem] text-center shadow-sm"><div className="mb-6"><p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Correct spelling:</p><p className="text-4xl font-black text-rose-600 tracking-tight">{formattedCorrectAnswer}</p></div><div className="bg-white/80 backdrop-blur p-5 rounded-2xl border border-rose-100/50 mb-4"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">🇨🇳 中文释义:</p><p className="text-lg font-bold text-slate-700">{currentWord.meaning}</p></div><p className="text-xs font-bold text-rose-400/80 flex items-center justify-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> 已加入错题集，可稍后强化练习</p></div><div className="flex flex-col sm:flex-row gap-3"><button type="button" onClick={handleNext} className="flex-1 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg">Continue <ChevronRight className="w-5 h-5" /></button><button type="button" onClick={() => setIsReviewMode(true)} className="flex-1 py-5 bg-rose-100 text-rose-700 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 border border-rose-200 hover:bg-rose-200 transition-all">进入错题集 <AlertCircle className="w-5 h-5" /></button></div></div>)}{!feedback && (<div className="space-y-6"><button type="submit" className="w-full py-5 bg-emerald-600 text-white rounded-[1.5rem] font-black text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95">Submit Spelling</button><div className="flex flex-col items-center"><button type="button" onClick={() => setShowMeaning(!showMeaning)} className="group flex items-center gap-2 text-slate-400 font-black text-[10px] uppercase tracking-[0.15em] hover:text-emerald-600 transition-colors bg-white px-4 py-2 rounded-full border border-slate-100"><Book className="w-3.5 h-3.5" /> {showMeaning ? '隐藏中文释义' : '查看中文释义'}</button>{showMeaning && (<div className="mt-5 text-slate-600 font-bold text-lg bg-emerald-50/30 py-4 px-8 rounded-2xl border border-emerald-100/50 animate-fade-in relative"><span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] bg-white border border-emerald-100 px-2 py-0.5 rounded-full text-emerald-500 font-black uppercase">Definition</span>{currentWord.meaning}</div>)}</div></div>)}</form></div></div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8"><div className="flex justify-between items-center px-1"><h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Dictation Practice</h2>{wrongWords.size > 0 && (<button onClick={() => setIsReviewMode(true)} className="flex items-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-700 rounded-xl font-black text-[10px] uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-colors shadow-sm"><AlertCircle className="w-4 h-4" /> Mistake Collection ({wrongWords.size})</button>)}</div><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{groups.map((group: any) => (<button key={group.id} onClick={() => handleStart(group.id)} className="p-8 bg-white rounded-[2.5rem] border border-slate-100 text-left hover:border-emerald-300 hover:shadow-xl transition-all group shadow-sm"><div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors"><Headphones className="w-7 h-7" /></div><h3 className="text-xl font-black text-slate-800 mb-1">{group.name}</h3><p className="text-slate-400 text-sm font-medium mb-8">{group.words.length} Vocabulary Items</p><div className="flex items-center text-emerald-600 text-xs font-black gap-2 uppercase tracking-widest">Start Session <ChevronRight className="w-4 h-4" /></div></button>))}</div></div>
  );
};

// --- Reading Module (Refined Exquisite Layout) ---
const ReadingModule = ({ articles, playbackRate, gender }: any) => {
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  
  const [paraState, setParaState] = useState<Record<number, {
    isPlaying: boolean;
    isRecording: boolean;
    showTranslation: boolean;
    recordedUrl: string | null;
  }>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const selectedArticle = articles.find((a: any) => a.id === selectedArticleId);

  const updateState = (idx: number, patch: any) => {
    setParaState(prev => ({
      ...prev,
      [idx]: { ...(prev[idx] || { isPlaying: false, isRecording: false, showTranslation: false, recordedUrl: null }), ...patch }
    }));
  };

  const handleTogglePlay = (idx: number, text: string) => {
    const isCurrentlyPlaying = paraState[idx]?.isPlaying;
    podcastEngine.stop();
    
    Object.keys(paraState).forEach(k => {
      if (parseInt(k) !== idx) updateState(parseInt(k), { isPlaying: false });
    });

    if (!isCurrentlyPlaying) {
      updateState(idx, { isPlaying: true });
      podcastEngine.speak(text, 0.85, gender, () => {
        updateState(idx, { isPlaying: false });
      });
    } else {
      updateState(idx, { isPlaying: false });
    }
  };

  const handleToggleShadow = async (idx: number) => {
    const isCurrentlyRecording = paraState[idx]?.isRecording;

    if (!isCurrentlyRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
        mediaRecorderRef.current.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          updateState(idx, { recordedUrl: url });
        };

        setTimeout(() => {
          mediaRecorderRef.current?.start();
          updateState(idx, { isRecording: true });
        }, 150);
      } catch (err) {
        console.error('Mic access denied:', err);
      }
    } else {
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
      updateState(idx, { isRecording: false });
    }
  };

  const handleCheckShadow = (url: string) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = url;
      audioPlayerRef.current.play();
    }
  };

  if (selectedArticle) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in pb-32">
        <audio ref={audioPlayerRef} className="hidden" />
        <div className="flex items-center justify-between mb-12 px-2">
          <button onClick={() => { setSelectedArticleId(null); podcastEngine.stop(); }} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-bold uppercase tracking-[0.2em] text-[10px] transition-colors">
            <ChevronLeft className="w-4 h-4" /> Return to List
          </button>
        </div>

        <div className="mb-12 px-2 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight font-serif-magazine tracking-tight">
            {selectedArticle.title}
          </h1>
          <p className="text-sm text-slate-400 font-serif italic mb-6">
            {selectedArticle.subtitle}
          </p>
          <div className="h-px w-12 bg-slate-200 mx-auto mb-10"></div>
        </div>

        {/* Featured Image - Exquisite Small Version */}
        {selectedArticle.imageUrl && (
          <div className="px-2 mb-16">
             <img 
              src={selectedArticle.imageUrl} 
              alt={selectedArticle.title} 
              className="w-full h-[380px] object-cover rounded-xl shadow-lg grayscale-[0.05] contrast-[1.02]" 
            />
          </div>
        )}

        <div className="space-y-16 mb-24 article-text px-4">
          {selectedArticle.paragraphs.map((para: any, i: number) => {
            const state = paraState[i] || { isPlaying: false, isRecording: false, showTranslation: false, recordedUrl: null };
            return (
              <div key={i} className="relative">
                {/* Visual Action Buttons - Smaller & Emerald Green */}
                <div className="flex items-center gap-3 mb-5">
                  <button 
                    onClick={() => handleTogglePlay(i, para.en)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                      state.isPlaying 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
                      : 'bg-white text-emerald-600 border-emerald-100 hover:border-emerald-500'
                    }`}
                  >
                    {state.isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                    <span>{state.isPlaying ? 'Stop' : 'Listen'}</span>
                  </button>
                  
                  <button 
                    onClick={() => handleToggleShadow(i)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                      state.isRecording 
                      ? 'bg-rose-500 text-white border-rose-500 animate-pulse shadow-md' 
                      : 'bg-white text-emerald-600 border-emerald-100 hover:border-emerald-500'
                    }`}
                  >
                    <Mic className="w-3 h-3" />
                    <span>{state.isRecording ? 'Rec...' : 'Shadow'}</span>
                  </button>

                  {state.recordedUrl && (
                    <button 
                      onClick={() => handleCheckShadow(state.recordedUrl!)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest border border-emerald-100"
                    >
                      <RotateCw className="w-3 h-3" /> Check Myself
                    </button>
                  )}
                </div>
                
                <div className="space-y-6">
                  <p className="text-lg md:text-xl text-slate-800 leading-[1.8] font-serif-magazine selection:bg-emerald-100 antialiased">
                    {para.en}
                  </p>
                  
                  <div>
                    <button 
                      onClick={() => updateState(i, { showTranslation: !state.showTranslation })}
                      className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300 hover:text-emerald-600 transition-colors flex items-center gap-1.5"
                    >
                      {state.showTranslation ? 'Hide' : 'Translation'}
                    </button>
                    
                    {state.showTranslation && (
                      <p className="mt-5 text-slate-500 text-base leading-relaxed italic bg-slate-50/50 p-6 rounded-lg border-l-2 border-emerald-100 animate-fade-in font-serif">
                        {para.zh}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Exquisite Footer Material Section */}
        <section className="mt-40 pt-16 border-t border-slate-100 space-y-20 px-4">
           {selectedArticle.sentencePatterns && (
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10 italic text-center">
                Reflective Structures
              </h3>
              <div className="space-y-6">
                {selectedArticle.sentencePatterns.map((pattern, idx) => (
                  <div key={idx} className="flex items-start gap-6 group">
                    <span className="text-[10px] font-black text-emerald-500 mt-1.5">0{idx + 1}</span>
                    <p className="text-base text-slate-700 font-serif leading-relaxed italic pr-6 pb-6 border-b border-slate-50 w-full group-hover:border-emerald-100 transition-colors">
                      {pattern}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-10 italic text-center">
              Core Lexicon
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {selectedArticle.keywords.map((kw: any) => (
                <div key={kw.word} className="border-b border-slate-50 pb-6 flex items-start justify-between group">
                  <div className="pr-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-slate-900 text-lg tracking-tight">{kw.word}</span>
                      <span className="text-[9px] text-emerald-500 font-mono font-black uppercase tracking-widest">{kw.ipa}</span>
                    </div>
                    <p className="text-xs text-slate-400 font-serif leading-relaxed italic pr-4">{kw.definition}</p>
                  </div>
                  <button onClick={() => podcastEngine.speak(kw.word, 0.9, gender)} className="mt-1 text-slate-200 hover:text-emerald-600 transition-colors">
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in pt-6">
      {articles.map((article: any) => (
        <button 
          key={article.id} 
          onClick={() => setSelectedArticleId(article.id)} 
          className="group text-left bg-transparent flex flex-col h-full overflow-hidden"
        >
          <div className="relative aspect-[4/5] mb-6 overflow-hidden rounded-2xl shadow-sm bg-slate-100">
            <img 
              src={article.imageUrl} 
              className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-105" 
              alt="" 
            />
            <div className="absolute inset-0 bg-slate-900/5 group-hover:bg-transparent transition-colors" />
          </div>
          <div className="flex-1 px-1">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-600 mb-3 inline-block italic">Essay // 特稿阅读</span>
            <h3 className="text-2xl font-bold text-slate-900 mb-2 leading-tight tracking-tight font-serif-magazine group-hover:underline decoration-emerald-200 underline-offset-4">
              {article.title}
            </h3>
            <p className="text-slate-400 text-sm font-medium italic mb-4 opacity-80">{article.titleZh}</p>
            <p className="text-slate-400 text-xs line-clamp-2 leading-relaxed italic font-serif">
              “{article.paragraphs[0].en.slice(0, 110)}...”
            </p>
          </div>
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center text-slate-900 text-[9px] font-black uppercase tracking-[0.2em] group-hover:text-emerald-600 transition-colors">
            Start Reading <ChevronRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      ))}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
