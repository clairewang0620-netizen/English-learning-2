import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BookOpen, 
  FileText, 
  Volume2, 
  ChevronRight, 
  ChevronLeft, 
  Mic,
  Loader2,
  Star, 
  Filter,
  RotateCw,
  Clock,
  Zap,
  Play,
  Headphones,
  Eye,
  FolderOpen,
  Square
} from 'lucide-react';

// Import data directly
import { vocabularyData } from './vocabulary.ts';
import { readingData } from './reading.ts';

// --- Types ---

interface Word {
  word: string;
  ipa: string;
  meaning: string;
  category: string;
  examples: { en: string; zh: string }[];
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
  defaultPace?: number;
  imageUrl?: string;
  paragraphs: { en: string; zh: string }[];
  keywords: { word: string; meaning: string; ipa?: string }[];
}

type Module = 'vocabulary' | 'dictation' | 'reading';

// --- Global Audio Manager (Singleton) ---

class GlobalAudioManager {
  private static instance: GlobalAudioManager;
  private synth: SpeechSynthesis;
  private currentAudioElement: HTMLAudioElement | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private resumeTimer: any = null;

  private constructor() {
    this.synth = window.speechSynthesis;
  }

  static getInstance() {
    if (!GlobalAudioManager.instance) {
      GlobalAudioManager.instance = new GlobalAudioManager();
    }
    return GlobalAudioManager.instance;
  }

  stopAll() {
    if (this.synth.speaking) {
      this.synth.cancel();
    }
    if (this.resumeTimer) {
      clearInterval(this.resumeTimer);
      this.resumeTimer = null;
    }
    this.activeUtterance = null;
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }
  }

  async speak(text: string, rate: number = 0.85, onFinished?: () => void) {
    this.stopAll();
    if (!text || !text.trim()) {
      if (onFinished) onFinished();
      return;
    }

    const cleanText = text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.activeUtterance = utterance;

    const voices = this.synth.getVoices();
    const preferred = voices.filter(v => v.lang.startsWith('en-US'));
    const voice = preferred.find(v => v.name.includes('Natural') || v.name.includes('Aria') || v.name.includes('Google US English')) 
           || preferred[0] || voices[0] || null;

    if (voice) utterance.voice = voice;
    utterance.lang = 'en-US';
    utterance.rate = rate; 
    utterance.pitch = 0.95; 

    utterance.onend = () => {
      this.activeUtterance = null;
      if (this.resumeTimer) clearInterval(this.resumeTimer);
      if (onFinished) onFinished();
    };

    utterance.onerror = () => {
      this.activeUtterance = null;
      if (this.resumeTimer) clearInterval(this.resumeTimer);
      if (onFinished) onFinished();
    };

    this.resumeTimer = setInterval(() => {
      if (this.synth.speaking && !this.synth.paused) {
        this.synth.pause();
        this.synth.resume();
      }
    }, 12000);

    this.synth.speak(utterance);
  }

  playRecorded(url: string, onEnded?: () => void): HTMLAudioElement {
    this.stopAll();
    const audio = new Audio(url);
    this.currentAudioElement = audio;
    audio.onended = () => {
      this.currentAudioElement = null;
      if (onEnded) onEnded();
    };
    audio.play();
    return audio;
  }
}

const audioManager = GlobalAudioManager.getInstance();

// --- Dictation Module ---

const DictationModule = () => {
  const [view, setView] = useState<'groups' | 'exercise' | 'wrongWords'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  
  const [wrongWordsSource, setWrongWordsSource] = useState<'dictation_home' | 'word_dictation' | null>(null);
  const [savedExerciseState, setSavedExerciseState] = useState<{ groupId: number | null, idx: number, showFeedback: boolean, isCorrect: boolean } | null>(null);

  const [wrongWordIds, setWrongWordIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('dictation_wrong_ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const allWords = useMemo(() => vocabularyData.groups.flatMap(g => g.words), []);
  const wrongWordsList = useMemo(() => allWords.filter(w => wrongWordIds.has(w.word)), [wrongWordIds, allWords]);

  useEffect(() => {
    localStorage.setItem('dictation_wrong_ids', JSON.stringify(Array.from(wrongWordIds)));
  }, [wrongWordIds]);

  const activeGroup = vocabularyData.groups.find(g => g.id === selectedGroupId);
  const currentList = view === 'wrongWords' ? wrongWordsList : (activeGroup?.words || []);
  const currentWord = currentList[currentIdx];

  const handleStartGroup = (id: number) => {
    audioManager.stopAll();
    setSelectedGroupId(id);
    setView('exercise');
    setWrongWordsSource(null);
    setCurrentIdx(0);
    resetState();
  };

  const handleStartWrongWords = () => {
    if (wrongWordsList.length === 0) return;
    audioManager.stopAll();
    setWrongWordsSource('dictation_home');
    setView('wrongWords');
    setCurrentIdx(0);
    resetState();
  };

  const handleGoToWrongWordsFromExercise = () => {
    audioManager.stopAll();
    setSavedExerciseState({ 
      groupId: selectedGroupId, 
      idx: currentIdx, 
      showFeedback, 
      isCorrect 
    });
    setWrongWordsSource('word_dictation');
    setView('wrongWords');
    setCurrentIdx(0);
    resetState();
  };

  const handleBack = () => {
    audioManager.stopAll();
    if (view === 'wrongWords' && wrongWordsSource === 'word_dictation' && savedExerciseState) {
      setSelectedGroupId(savedExerciseState.groupId);
      setCurrentIdx(savedExerciseState.idx);
      setShowFeedback(savedExerciseState.showFeedback);
      setIsCorrect(savedExerciseState.isCorrect);
      setView('exercise');
    } else {
      setView('groups');
      setSelectedGroupId(null);
      setSavedExerciseState(null);
      setWrongWordsSource(null);
    }
  };

  const resetState = () => {
    setUserInput('');
    setShowFeedback(false);
    setShowMeaning(false);
  };

  const handleCheck = () => {
    if (!currentWord) return;
    const correct = userInput.trim().toLowerCase() === currentWord.word.trim().toLowerCase();
    setIsCorrect(correct);
    setShowFeedback(true);

    const nextWrongs = new Set(wrongWordIds);
    if (correct) {
      nextWrongs.delete(currentWord.word);
    } else {
      nextWrongs.add(currentWord.word);
    }
    setWrongWordIds(nextWrongs);
  };

  const handleNext = () => {
    if (currentIdx < currentList.length - 1) {
      setCurrentIdx(prev => prev + 1);
      resetState();
    } else {
      setView('groups');
      setSelectedGroupId(null);
    }
  };

  if (view === 'groups') {
    return (
      <div className="animate-fade-in space-y-8">
        {wrongWordIds.size > 0 && (
          <button 
            onClick={handleStartWrongWords}
            className="w-full p-6 bg-amber-50 border border-amber-200 rounded-[2rem] flex items-center justify-between group hover:shadow-lg transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white">
                <Star className="w-6 h-6 fill-current" />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-amber-900">Wrong Words</h3>
                <p className="text-amber-600 text-xs font-medium">{wrongWordIds.size} 个单词需要复习</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-transform" />
          </button>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {vocabularyData.groups.map(g => (
            <button key={g.id} onClick={() => handleStartGroup(g.id)} className="p-6 bg-white border border-slate-100 rounded-[2rem] text-left hover:border-emerald-200 hover:shadow-xl transition-all group">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-lg">Group {g.id}</span>
                <Headphones className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">{g.words.length} 单词</span>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  <Play className="w-3.5 h-3.5 fill-current" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="max-w-md mx-auto animate-fade-in space-y-6 pt-4">
      <div className="flex items-center justify-between px-2">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-900 font-black uppercase text-[9px] tracking-widest">
          <ChevronLeft className="w-3.5 h-3.5" /> {view === 'wrongWords' ? 'Back' : '返回听写列表'}
        </button>
        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
          {view === 'wrongWords' ? 'Wrong Words' : `GROUP ${selectedGroupId}`} · {currentIdx + 1} / {currentList.length}
        </span>
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-50 flex flex-col items-center gap-4 text-center">
        <button 
          onClick={() => audioManager.speak(currentWord.word, 0.75)}
          className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-100 hover:scale-105 active:scale-95 transition-all"
        >
          <Volume2 className="w-8 h-8" />
        </button>
        
        <div className="w-full space-y-3">
          <input
            autoFocus
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            disabled={showFeedback}
            onKeyDown={(e) => e.key === 'Enter' && userInput.trim() && !showFeedback && handleCheck()}
            placeholder="输入听到的单词..."
            className="w-full text-center py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-emerald-500 transition-all text-2xl font-bold tracking-tight outline-none"
          />
          {!showFeedback && (
            <button onClick={() => setShowMeaning(!showMeaning)} className="text-[9px] font-black uppercase text-slate-300 hover:text-emerald-500 transition-colors flex items-center gap-1 mx-auto">
              <Eye className="w-3 h-3" /> {showMeaning ? '隐藏释义' : '查看中文释义'}
            </button>
          )}
        </div>

        {showMeaning && !showFeedback && (
          <div className="w-full p-4 bg-slate-50 rounded-xl animate-fade-in">
            <p className="text-sm font-bold text-slate-600">{currentWord.meaning}</p>
          </div>
        )}

        {showFeedback && (
          <div className={`w-full p-6 rounded-[1.5rem] animate-fade-in border-2 ${isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            {isCorrect ? (
              <p className="text-emerald-700 font-black text-xl">正确! Bravo 👏</p>
            ) : (
              <div className="space-y-1">
                <span className="text-rose-400 font-black text-[9px] uppercase tracking-widest">正确拼写</span>
                <p className="text-2xl font-black text-rose-700 leading-tight">{currentWord.word}</p>
                <p className="text-rose-600 font-medium text-sm">{currentWord.meaning}</p>
                <button 
                  onClick={handleGoToWrongWordsFromExercise}
                  className="mt-3 py-2 px-4 bg-white border border-rose-200 rounded-xl flex items-center gap-1.5 mx-auto text-[9px] font-black uppercase text-rose-500 hover:bg-rose-50 transition-all"
                >
                  <FolderOpen className="w-3 h-3" /> 已加入错题集
                </button>
              </div>
            )}
          </div>
        )}

        <div className="w-full flex gap-3 mt-2">
          {!showFeedback ? (
            <button 
              disabled={!userInput.trim()}
              onClick={handleCheck}
              className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-emerald-600 disabled:opacity-20 transition-all shadow-lg"
            >
              comfirm
            </button>
          ) : (
            <button 
              onClick={handleNext}
              className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              下一词 <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// --- Reading Module Components ---

const ArticleDetailView = ({ article, onBack }: { article: Article; onBack: () => void }) => {
  const [activeParaIdx, setActiveParaIdx] = useState<number | null>(null);
  const [shadowingIdx, setShadowingIdx] = useState<number | null>(null);
  const [showTranslationMap, setShowTranslationMap] = useState<Record<number, boolean>>({});
  const [playRate, setPlayRate] = useState(article.defaultPace || 0.85);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    return () => {
      audioManager.stopAll();
      stopRecording();
    };
  }, [article.id]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handlePlayPara = (idx: number, text: string) => {
    setShadowingIdx(null);
    stopRecording();
    if (activeParaIdx === idx) {
      audioManager.stopAll();
      setActiveParaIdx(null);
      return;
    }
    setActiveParaIdx(idx);

    // Apply specific pronunciation fixes for article-deep-thinking
    let textToSpeak = text;
    if (article.id === 'article-deep-thinking') {
      if (text.trim().startsWith('I.')) {
        textToSpeak = textToSpeak.replace('I.', 'First.');
      } else if (text.trim().startsWith('IV.')) {
        textToSpeak = textToSpeak.replace('IV.', 'Four.');
      }
    }

    audioManager.speak(textToSpeak, playRate, () => setActiveParaIdx(null));
  };

  const handleShadowing = async (idx: number) => {
    setActiveParaIdx(null);
    audioManager.stopAll();
    
    if (shadowingIdx === idx && isRecording) {
      stopRecording();
      return;
    }

    setShadowingIdx(idx);
    setRecordedUrl(null);
    setIsPlayingRecorded(false);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic access failed", err);
      setIsRecording(true);
      setTimeout(() => setIsRecording(false), 3000);
    }
  };

  const toggleRecordedPlayback = () => {
    if (isPlayingRecorded) {
      audioManager.stopAll();
      setIsPlayingRecorded(false);
    } else if (recordedUrl) {
      setIsPlayingRecorded(true);
      audioManager.playRecorded(recordedUrl, () => setIsPlayingRecorded(false));
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-32">
      <div className="flex items-center justify-between mb-12 sticky top-0 bg-[#f8fafc]/95 backdrop-blur-md z-30 py-4 border-b border-slate-100/50">
        <button onClick={() => { audioManager.stopAll(); onBack(); }} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-950 font-black uppercase tracking-[0.2em] text-[9px] transition-all">
          <ChevronLeft className="w-3.5 h-3.5" /> Back to Reading
        </button>
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
          {[0.85, 1.0, 1.15].map(v => (
            <button key={v} onClick={() => { audioManager.stopAll(); setPlayRate(v); }} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${playRate === v ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
              {v === 0.85 ? '较慢' : v === 1.0 ? '常规' : '较快'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-12 px-4 text-left">
        <h1 className="text-xl md:text-2xl font-bold text-slate-950 mb-3 leading-snug font-serif-magazine tracking-tight">{article.title}</h1>
        <p className="text-slate-400 text-sm italic mb-4 font-serif leading-relaxed opacity-90">{article.titleZh}</p>
        {article.subtitle && (
          <p className="text-slate-500 text-xs font-serif leading-relaxed mb-6 border-l-2 border-slate-100 pl-4">{article.subtitle}</p>
        )}
        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">
           <Clock className="w-3 h-3" /> {article.readingTime || '5 min read'}
        </div>
      </div>

      <div className="space-y-4 px-2 md:px-6">
        {article.paragraphs.map((para, i) => {
          const isActive = activeParaIdx === i;
          const isShadowing = shadowingIdx === i;
          const isTranslated = !!showTranslationMap[i];
          return (
            <div key={i} className={`group flex flex-col gap-2 p-3 rounded-2xl transition-all duration-300 border-l-4 ${isActive ? 'bg-emerald-50/50 border-emerald-500' : 'border-transparent hover:bg-slate-50/50'}`}>
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="flex-1">
                   <p className={`text-[15px] md:text-[16px] leading-[1.7] font-serif-magazine antialiased transition-colors duration-300 text-justify ${isActive ? 'text-emerald-950 font-medium' : 'text-slate-700'}`}>
                    {para.en}
                  </p>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); handlePlayPara(i, para.en); }} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 shadow-sm border ${isActive ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 hover:text-emerald-600 border-slate-100'}`}>
                    {isActive ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleShadowing(i); }} 
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90 shadow-sm border ${isShadowing && isRecording ? 'bg-rose-500 text-white border-rose-500 animate-pulse' : 'bg-white text-slate-400 hover:text-emerald-600 border-slate-100'}`}
                  >
                    {isShadowing && isRecording ? <Square className="w-2.5 h-2.5 fill-current" /> : <Mic className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {isShadowing && (
                <div className="flex flex-col gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest flex items-center gap-2">
                      {isRecording ? <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping" /> : null}
                      {isRecording ? "🎤 正在录音... 请跟读" : "录音已保存"}
                    </span>
                    {!isRecording && recordedUrl && (
                      <button onClick={(e) => { e.stopPropagation(); toggleRecordedPlayback(); }} className={`flex items-center gap-1.5 text-[9px] font-bold uppercase transition-colors ${isPlayingRecorded ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-600'}`}>
                        {isPlayingRecorded ? <Square className="w-2.5 h-2.5 fill-current" /> : <RotateCw className="w-2.5 h-2.5" />}
                        {isPlayingRecorded ? 'Stop Playback' : 'Playback'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.stopPropagation(); setShowTranslationMap(p => ({ ...p, [i]: !p[i] })); }} className="w-fit flex items-center gap-1.5 text-slate-400 hover:text-emerald-600 font-bold uppercase tracking-widest text-[9px] transition-all bg-slate-100/50 px-2.5 py-1.5 rounded-lg">
                  <Zap className={`w-2.5 h-2.5 ${isTranslated ? 'fill-emerald-600 text-emerald-600' : ''}`} />
                  {isTranslated ? '隐藏翻译' : '显示翻译'}
                </button>
              </div>
              {isTranslated && (
                <div className="animate-fade-in px-4 py-3 bg-emerald-50/20 rounded-xl border-l-2 border-emerald-200">
                  <p className="text-slate-500 text-[14px] leading-relaxed italic font-serif text-justify">{para.zh}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {article.keywords && article.keywords.length > 0 && (
        <div className="mt-16 space-y-5 px-4 md:px-6 animate-fade-in">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.25em] border-b border-slate-100 pb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600/20" /> 关键词提炼 / Key Takeaways
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {article.keywords.map((kw, i) => (
              <div key={i} className="group p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-200 transition-all hover:shadow-md flex items-center justify-between">
                <div>
                  <span className="text-emerald-700 font-bold text-sm block mb-0.5">{kw.word}</span>
                  <span className="text-slate-500 text-[11px] font-medium">{kw.meaning}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); audioManager.stopAll(); audioManager.speak(kw.word, 0.8); }} 
                  className="p-2 rounded-xl text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-16 pt-8 border-t border-slate-100 px-6 text-left space-y-4">
        {article.source && <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] italic">来源: {article.source}</p>}
        <div className="flex justify-center pt-4">
          <button onClick={() => { audioManager.stopAll(); onBack(); }} className="px-8 py-3 bg-slate-900 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full hover:bg-emerald-600 transition-all shadow-lg shadow-slate-200">完成阅读</button>
        </div>
      </div>
    </div>
  );
};

const ReadingModule = ({ articles }: { articles: Article[] }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedArticle = articles.find(a => a.id === selectedId);

  useEffect(() => { audioManager.stopAll(); }, [selectedId]);

  if (selectedId && selectedArticle) {
    return <ArticleDetailView article={selectedArticle} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in pt-4">
      {articles.map((article) => (
        <button key={article.id} onClick={() => setSelectedId(article.id)} className="group text-left bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden transition-all duration-500 hover:shadow-2xl hover:-translate-y-1.5">
          <div className="relative aspect-[16/10] overflow-hidden bg-slate-50">
            <img src={article.imageUrl} className="w-full h-full object-cover transition-transform duration-[8s] group-hover:scale-110" alt="" />
            <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-transparent transition-all" />
            <div className="absolute top-4 left-4">
               <div className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[9px] font-black text-slate-800 uppercase tracking-tighter shadow-sm">
                 <Clock className="w-2.5 h-2.5 text-emerald-600" /> {article.readingTime}
               </div>
            </div>
          </div>
          <div className="flex-1 p-8 flex flex-col">
            <h3 className="text-lg font-bold text-slate-950 mb-3 leading-snug tracking-tight font-serif-magazine group-hover:text-emerald-700 transition-colors">{article.title}</h3>
            <p className="text-slate-400 text-[11px] font-medium italic leading-relaxed mb-6 line-clamp-1">{article.titleZh}</p>
            <div className="space-y-3 mb-6">
               <p className="text-slate-600 text-[13px] leading-relaxed line-clamp-2 font-serif opacity-80">{article.paragraphs[0].en}</p>
            </div>
            <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-50">
              <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest truncate max-w-[120px]">{article.source}</div>
              <div className="text-emerald-600 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                立刻阅读 <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

// --- Vocabulary Module ---

const VocabularyModule = ({ groups }: any) => {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id);
  const [cardWordIdx, setCardWordIdx] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    groups.forEach((g: VocabularyGroup) => g.words.forEach(w => cats.add(w.category)));
    return Array.from(cats).sort();
  }, [groups]);

  const filteredWordsByGroup = useMemo(() => {
    if (activeFilters.size === 0) return null;
    return groups.map((g: VocabularyGroup) => ({
      ...g,
      words: g.words.filter(w => activeFilters.has(w.category))
    })).filter((g: any) => g.words.length > 0);
  }, [activeFilters, groups]);

  const toggleFilter = (cat: string) => {
    audioManager.stopAll();
    const next = new Set(activeFilters);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setActiveFilters(next);
  };

  if (cardWordIdx !== null) {
    let w: Word;
    if (activeFilters.size > 0 && filteredWordsByGroup) {
      const allFiltered = filteredWordsByGroup.flatMap(g => g.words);
      w = allFiltered[cardWordIdx];
    } else {
      const selectedGroup = groups.find((g: any) => g.id === selectedGroupId);
      w = selectedGroup.words[cardWordIdx];
    }

    return (
      <div className="animate-fade-in max-w-2xl mx-auto space-y-8 pb-20">
        <button onClick={() => setCardWordIdx(null)} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-bold uppercase text-[10px] tracking-widest transition-colors">
          <ChevronLeft className="w-4 h-4" /> 返回列表
        </button>
        <div className="bg-white rounded-[3rem] p-10 md:p-14 border border-slate-100 shadow-2xl">
           <div className="flex justify-between items-start mb-12">
              <div>
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 block">{w.category}</span>
                <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">{w.word}</h2>
                <span className="text-emerald-600 font-mono font-bold text-lg">{w.ipa}</span>
                <p className="text-2xl font-black text-slate-800 mt-6">{w.meaning}</p>
              </div>
              <button onClick={() => audioManager.speak(w.word)} className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 transition-all">
                <Volume2 className="w-8 h-8" />
              </button>
           </div>
           
           <div className="space-y-8">
             <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50 pb-2">语境例句</h3>
             {w.examples.map((ex: any, i: number) => (
                <div key={i} className="bg-slate-50 p-6 rounded-[1.5rem] border-l-4 border-emerald-500 group">
                   <div className="flex justify-between items-start gap-4 mb-3">
                     <p className="text-lg text-slate-800 font-medium leading-relaxed">{ex.en}</p>
                     <button onClick={() => audioManager.speak(ex.en)} className="p-2 bg-white text-slate-300 hover:text-emerald-600 rounded-lg shadow-sm transition-all flex-shrink-0">
                       <Volume2 className="w-4 h-4" />
                     </button>
                   </div>
                   <p className="text-slate-500 font-medium">{ex.zh}</p>
                </div>
             ))}
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full border border-slate-200">
           <Filter className="w-3 h-3 text-slate-500" />
           <span className="text-[10px] font-black uppercase text-slate-500">分类</span>
        </div>
        {allCategories.map(cat => (
          <button 
            key={cat} 
            onClick={() => toggleFilter(cat)}
            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all whitespace-nowrap border ${activeFilters.has(cat) ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-200'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {activeFilters.size === 0 && (
          <aside className="lg:col-span-1 space-y-3">
            <h3 className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest px-2">单词分组</h3>
            {groups.map((g: any) => (
              <button 
                key={g.id} 
                onClick={() => { audioManager.stopAll(); setSelectedGroupId(g.id); setCardWordIdx(null); }} 
                className={`w-full text-left px-5 py-4 rounded-[1.25rem] transition-all flex justify-between items-center ${selectedGroupId === g.id ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-100 font-bold' : 'bg-white text-slate-500 border border-slate-100 hover:border-emerald-200'}`}
              >
                <span>{g.name}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedGroupId === g.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {g.words.length}
                </span>
              </button>
            ))}
          </aside>
        )}
        
        <div className={`${activeFilters.size === 0 ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-3`}>
          {activeFilters.size > 0 ? (
            filteredWordsByGroup && filteredWordsByGroup.length > 0 ? (
              filteredWordsByGroup.map((g, gIdx) => (
                <div key={g.id} className="space-y-3">
                  <div className="px-4 py-2 bg-emerald-50 rounded-xl">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{g.name} MATCHES</span>
                  </div>
                  {g.words.map((w, wIdx) => {
                    const globalIdx = filteredWordsByGroup.slice(0, gIdx).reduce((acc, prevG) => acc + prevG.words.length, 0) + wIdx;
                    return (
                      <div 
                        key={w.word} 
                        onClick={() => setCardWordIdx(globalIdx)} 
                        className="bg-white p-6 rounded-[1.5rem] border border-slate-100 hover:shadow-xl hover:border-emerald-100 cursor-pointer flex justify-between items-center transition-all group"
                      >
                         <div>
                           <div className="flex items-center gap-3 mb-1">
                             <h3 className="text-xl font-bold text-slate-800 tracking-tight group-hover:text-emerald-700">{w.word}</h3>
                             <span className="text-[9px] font-black uppercase text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full">{w.category}</span>
                           </div>
                           <p className="text-slate-500 text-sm font-medium">{w.meaning}</p>
                         </div>
                         <button 
                          onClick={(e) => { e.stopPropagation(); audioManager.stopAll(); audioManager.speak(w.word); }} 
                          className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:bg-emerald-600 hover:text-white transition-all"
                         >
                           <Volume2 className="w-5 h-5" />
                         </button>
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="p-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                 <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">该分类下暂无单词</p>
              </div>
            )
          ) : (
            groups.find(g => g.id === selectedGroupId)?.words.map((w: any, i: number) => (
              <div 
                key={w.word} 
                onClick={() => setCardWordIdx(i)} 
                className="bg-white p-6 rounded-[1.5rem] border border-slate-100 hover:shadow-xl hover:border-emerald-100 cursor-pointer flex justify-between items-center transition-all group"
              >
                 <div>
                   <div className="flex items-center gap-3 mb-1">
                     <h3 className="text-xl font-bold text-slate-800 tracking-tight group-hover:text-emerald-700">{w.word}</h3>
                     <span className="text-[9px] font-black uppercase text-slate-300 bg-slate-50 px-2 py-0.5 rounded-full">{w.category}</span>
                   </div>
                   <p className="text-slate-500 text-sm font-medium">{w.meaning}</p>
                 </div>
                 <button 
                  onClick={(e) => { e.stopPropagation(); audioManager.stopAll(); audioManager.speak(w.word); }} 
                  className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:bg-emerald-600 hover:text-white transition-all"
                 >
                   <Volume2 className="w-5 h-5" />
                 </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('vocabulary'); 
  const [vocabGroups, setVocabGroups] = useState<any>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initData = () => {
      setVocabGroups(vocabularyData.groups || []);
      setArticles(readingData || []);
      setTimeout(() => setLoading(false), 600);
    };
    initData();
  }, []);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Initializing mastery system...</p>
        </div>
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
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest italic">English Mastery System</p>
          </div>
        </div>
        
        <nav className="flex gap-1 bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit">
          {[
            { id: 'vocabulary', label: 'Words', icon: BookOpen },
            { id: 'dictation', label: 'Dictation', icon: Headphones },
            { id: 'reading', label: 'Reading', icon: FileText }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { audioManager.stopAll(); setActiveModule(item.id as Module); }}
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
          <VocabularyModule groups={vocabGroups} />
        )}
        {activeModule === 'dictation' && (
          <DictationModule />
        )}
        {activeModule === 'reading' && (
          <ReadingModule articles={articles} />
        )}
      </main>
    </div>
  );
};

// --- Generic Helpers ---

const Pause = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
  </svg>
);

const root = createRoot(document.getElementById('root')!);
root.render(<App />);