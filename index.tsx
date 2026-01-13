import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BookOpen, 
  FileText, 
  Volume2, 
  ChevronRight, 
  ChevronLeft, 
  Loader2,
  Clock,
  Zap,
  Play,
  Headphones,
  Pause,
  Grid,
  Layers
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

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
  paragraphs: { en: string; zh: string; audioUrl?: string }[];
  keywords: { word: string; meaning: string; ipa?: string }[];
  imageUrl?: string;
}

type Module = 'vocabulary' | 'dictation' | 'reading';

// --- Audio Decoding Helpers (High Performance) ---

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodePCMToBuffer(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const buffer = ctx.createBuffer(1, dataInt16.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

// --- Global Audio Manager (Preload & Cache Focused) ---

class GlobalAudioManager {
  private static instance: GlobalAudioManager;
  private audioContext: AudioContext | null = null;
  private bufferCache: Map<string, AudioBuffer> = new Map();
  private activeSource: AudioBufferSourceNode | null = null;
  private preloadingKeys: Set<string> = new Set();
  private isProcessing: boolean = false;

  private constructor() {}

  static getInstance() {
    if (!GlobalAudioManager.instance) {
      GlobalAudioManager.instance = new GlobalAudioManager();
    }
    return GlobalAudioManager.instance;
  }

  private async getContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext;
  }

  stopAll() {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.onended = null;
      } catch (e) {}
      this.activeSource = null;
    }
    this.isProcessing = false;
  }

  // Preload audio into buffer cache to ensure < 1s latency on click
  async preload(text: string) {
    const key = text?.trim();
    if (!key || this.bufferCache.has(key) || this.preloadingKeys.has(key)) return;
    
    this.preloadingKeys.add(key);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: key }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (audioData) {
        const ctx = await this.getContext();
        const buffer = await decodePCMToBuffer(decodeBase64(audioData), ctx);
        this.bufferCache.set(key, buffer);
      }
    } catch (e) {
      console.warn("Preload failed for:", key, e);
    } finally {
      this.preloadingKeys.delete(key);
    }
  }

  // High-priority play: immediate from cache or fast-fetch
  async speak(text: string, rate: number = 1.0, onFinished?: () => void) {
    const key = text?.trim();
    if (!key) { onFinished?.(); return; }

    this.stopAll();
    const ctx = await this.getContext();

    // Strategy 1: Immediate cache hit
    if (this.bufferCache.has(key)) {
      this.playBuffer(this.bufferCache.get(key)!, rate, onFinished);
      return;
    }

    // Strategy 2: Fast-fetch if not in cache (Fallback)
    this.isProcessing = true;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: key }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (!audioData) throw new Error("Empty audio");

      const buffer = await decodePCMToBuffer(decodeBase64(audioData), ctx);
      this.bufferCache.set(key, buffer);
      this.playBuffer(buffer, rate, onFinished);
    } catch (e) {
      console.error("TTS Click-to-Play Error:", e);
      this.isProcessing = false;
      onFinished?.();
    }
  }

  private playBuffer(buffer: AudioBuffer, rate: number, onFinished?: () => void) {
    this.getContext().then(ctx => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      source.connect(ctx.destination);
      source.onended = () => {
        if (this.activeSource === source) this.activeSource = null;
        onFinished?.();
      };
      this.activeSource = source;
      source.start(0);
    });
  }

  // Handle recorded files with same manager logic
  playRecorded(url: string, onEnded?: () => void) {
    this.stopAll();
    const audio = new Audio(url);
    audio.play().then(() => {
      audio.onended = onEnded;
    }).catch(e => {
      console.error("Recorded audio play failed", e);
      onEnded?.();
    });
  }
}

const audioManager = GlobalAudioManager.getInstance();

// --- Vocabulary Module ---

const mapToFixedCategory = (word: Word): string => {
  const cat = word.category;
  if (['Finance', 'Market', 'Risk'].includes(cat)) return "金融";
  if (['Business', 'Strategy', 'Marketing'].includes(cat)) return "商务";
  if (['Analysis', 'Technology', 'Communication', 'Psychology', 'Concept'].includes(cat)) return "雅思";
  if (['Legal'].includes(cat)) return "专八";
  if (['Social', 'Academic'].includes(cat)) return "六级";
  if (['Life', 'Emotions', 'Personality'].includes(cat)) return "四级";
  return "其他类";
};

const VocabularyModule = ({ groups }: { groups: VocabularyGroup[] }) => {
  const [viewMode, setViewMode] = useState<'group' | 'category'>('group');
  const [selectedGroupId, setSelectedGroupId] = useState<number>(groups?.[0]?.id || 1);
  const [selectedCategory, setSelectedCategory] = useState<string>("雅思");
  const [cardWordIdx, setCardWordIdx] = useState<number | null>(null);

  const words = useMemo(() => {
    if (viewMode === 'group') {
      return groups.find(g => g.id === selectedGroupId)?.words || [];
    }
    return groups.flatMap(g => g.words.filter(w => mapToFixedCategory(w) === selectedCategory));
  }, [viewMode, selectedGroupId, selectedCategory, groups]);

  // Preload first few words of a group to ensure instant feedback
  useEffect(() => {
    words.slice(0, 5).forEach(w => audioManager.preload(w.word));
  }, [words]);

  if (cardWordIdx !== null && words[cardWordIdx]) {
    const w = words[cardWordIdx];
    return (
      <div className="animate-fade-in max-w-2xl mx-auto space-y-8 pb-20">
        <button onClick={() => setCardWordIdx(null)} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-bold uppercase text-[10px] tracking-widest transition-colors"><ChevronLeft className="w-4 h-4" /> 返回列表</button>
        <div className="bg-white rounded-[3rem] p-10 md:p-14 border border-slate-100 shadow-2xl">
           <div className="flex justify-between items-start mb-12">
              <div>
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 block">{mapToFixedCategory(w)}</span>
                <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">{w.word}</h2>
                <span className="text-emerald-600 font-mono font-bold text-lg">{w.ipa}</span>
                <p className="text-2xl font-black text-slate-800 mt-6">{w.meaning}</p>
              </div>
              <button onClick={() => audioManager.speak(w.word)} className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"><Volume2 className="w-8 h-8" /></button>
           </div>
           <div className="space-y-8">
             <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-widest border-b border-slate-50 pb-2">语境用法</h3>
             {w.examples.map((ex, i) => (
                <div key={i} className="bg-slate-50 p-6 rounded-[1.5rem] border-l-4 border-emerald-500">
                   <div className="flex justify-between items-start gap-4 mb-3">
                     <p className="text-lg text-slate-800 font-medium leading-relaxed font-serif-magazine">{ex.en}</p>
                     <button onClick={() => audioManager.speak(ex.en)} className="p-2 bg-white text-slate-300 hover:text-emerald-600 rounded-lg shadow-sm transition-all flex-shrink-0"><Volume2 className="w-4 h-4" /></button>
                   </div>
                   <p className="text-slate-500 font-medium italic">{ex.zh}</p>
                </div>
             ))}
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between mb-4 px-2">
        <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl">
          <button onClick={() => setViewMode('group')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'group' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Grid className="w-3.5 h-3.5" /> 按单元</button>
          <button onClick={() => setViewMode('category')} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'category' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Layers className="w-3.5 h-3.5" /> 按分类</button>
        </div>
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">VOCABULARY ENGINE 2.5</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-2 max-h-[65vh] overflow-y-auto no-scrollbar pr-2">
          {viewMode === 'group' ? groups.map((g) => (
            <button key={g.id} onClick={() => setSelectedGroupId(g.id)} className={`w-full text-left px-5 py-4 rounded-[1.25rem] transition-all flex justify-between items-center ${selectedGroupId === g.id ? 'bg-emerald-600 text-white shadow-xl font-bold scale-[1.02]' : 'bg-white text-slate-500 border border-slate-100 hover:border-emerald-100'}`}><span className="text-sm">Group {g.id}</span><span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedGroupId === g.id ? 'bg-emerald-50 text-white' : 'bg-slate-100 text-slate-400'}`}>{g.words.length}</span></button>
          )) : ["四级", "六级", "专八", "商务", "雅思", "金融", "其他类"].map((cat) => (
            <button key={cat} onClick={() => setSelectedCategory(cat)} className={`w-full text-left px-5 py-4 rounded-[1.25rem] transition-all flex justify-between items-center ${selectedCategory === cat ? 'bg-emerald-600 text-white shadow-xl font-bold scale-[1.02]' : 'bg-white text-slate-500 border border-slate-100 hover:border-emerald-100'}`}><span className="text-sm">{cat}</span></button>
          ))}
        </aside>
        <div className="lg:col-span-3 space-y-3">
          {words.map((w, i) => (
            <div key={i} onClick={() => setCardWordIdx(i)} className="bg-white p-6 rounded-[1.5rem] border border-slate-100 hover:shadow-xl hover:border-emerald-100 cursor-pointer flex justify-between items-center transition-all group animate-fade-in">
               <div className="flex-1">
                 <div className="flex items-center gap-3 mb-1"><h3 className="text-xl font-bold text-slate-800 tracking-tight group-hover:text-emerald-700">{w.word}</h3><span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">{mapToFixedCategory(w)}</span></div>
                 <p className="text-slate-500 text-sm font-medium line-clamp-1">{w.meaning}</p>
               </div>
               <button onClick={(e) => { e.stopPropagation(); audioManager.speak(w.word); }} className="p-3 bg-slate-50 rounded-xl text-slate-300 hover:bg-emerald-600 hover:text-white transition-all active:scale-90"><Volume2 className="w-5 h-5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Dictation Module ---

const DictationModule = () => {
  const [view, setView] = useState<'groups' | 'exercise'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [userInput, setUserInput] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const activeGroup = vocabularyData.groups.find(g => g.id === selectedGroupId);
  const currentWord = activeGroup?.words[currentIdx];

  const handleStart = (id: number) => {
    setSelectedGroupId(id);
    setView('exercise');
    setCurrentIdx(0);
    setUserInput('');
    setShowFeedback(false);
    // Preload first word audio immediately
    const firstWord = vocabularyData.groups.find(g => g.id === id)?.words[0];
    if (firstWord) audioManager.preload(firstWord.word);
  };

  const checkAndNext = () => {
    if (!currentWord) return;
    const correct = userInput.trim().toLowerCase() === currentWord.word.trim().toLowerCase();
    setIsCorrect(correct);
    setShowFeedback(true);
    // Preload next word audio
    const nextWord = activeGroup?.words[currentIdx + 1];
    if (nextWord) audioManager.preload(nextWord.word);
  };

  if (view === 'groups') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-fade-in">
        {vocabularyData.groups.map(g => (
          <button key={g.id} onClick={() => handleStart(g.id)} className="p-6 bg-white border border-slate-100 rounded-[2rem] text-left hover:border-emerald-200 hover:shadow-xl transition-all group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-lg">Group {g.id}</span>
              <Headphones className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">{g.words.length} 词</span>
              <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-emerald-600 group-hover:text-white transition-all"><Play className="w-3.5 h-3.5 fill-current" /></div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto animate-fade-in space-y-6 pt-4">
      <div className="flex items-center justify-between px-2">
        <button onClick={() => setView('groups')} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-950 font-black uppercase text-[9px] tracking-widest"><ChevronLeft className="w-3.5 h-3.5" /> 返回</button>
        <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">{currentIdx + 1} / {activeGroup?.words.length}</span>
      </div>
      <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-50 flex flex-col items-center gap-4 text-center">
        <button onClick={() => audioManager.speak(currentWord!.word, 0.75)} className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"><Volume2 className="w-8 h-8" /></button>
        <input autoFocus type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} disabled={showFeedback} onKeyDown={(e) => e.key === 'Enter' && !showFeedback && userInput.trim() && checkAndNext()} placeholder="听到的是哪个单词？" className="w-full text-center py-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-emerald-500 transition-all text-2xl font-bold tracking-tight outline-none" />
        {showFeedback && (
          <div className={`w-full p-6 rounded-[1.5rem] animate-fade-in border-2 ${isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            {isCorrect ? <p className="text-emerald-700 font-black text-xl">正确!</p> : (
              <div className="space-y-1">
                <span className="text-rose-400 font-black text-[9px] uppercase tracking-widest">正确拼写</span>
                <p className="text-2xl font-black text-rose-700 leading-tight">{currentWord!.word}</p>
                <p className="text-rose-600 font-medium text-sm">{currentWord!.meaning}</p>
              </div>
            )}
          </div>
        )}
        <div className="w-full flex gap-3 mt-2">
          {!showFeedback ? <button disabled={!userInput.trim()} onClick={checkAndNext} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-emerald-600 disabled:opacity-20 transition-all shadow-lg">确认</button> : <button onClick={() => { setShowFeedback(false); setUserInput(''); if (currentIdx < activeGroup!.words.length - 1) setCurrentIdx(currentIdx + 1); else setView('groups'); }} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2">下一个 <ChevronRight className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  );
};

// --- Reading Module ---

const ArticleDetailView = ({ article, onBack }: { article: Article; onBack: () => void }) => {
  const [activeParaIdx, setActiveParaIdx] = useState<number | null>(null);
  const [showTrans, setShowTrans] = useState<Record<number, boolean>>({});

  // Preload next paragraph automatically when one starts playing
  const handlePlay = (idx: number, text: string) => {
    if (activeParaIdx === idx) { audioManager.stopAll(); setActiveParaIdx(null); return; }
    setActiveParaIdx(idx);
    
    // Play Logic
    const para = article.paragraphs[idx];
    if (para.audioUrl) {
      audioManager.playRecorded(para.audioUrl, () => setActiveParaIdx(null));
    } else {
      audioManager.speak(text, 1.0, () => setActiveParaIdx(null));
    }

    // Preload Logic (Next paragraph)
    const nextIdx = idx + 1;
    if (nextIdx < article.paragraphs.length) {
      const nextPara = article.paragraphs[nextIdx];
      if (!nextPara.audioUrl) audioManager.preload(nextPara.en);
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in pb-32">
      <div className="flex items-center justify-between mb-12 sticky top-0 bg-[#f8fafc]/95 backdrop-blur-md z-30 py-4 border-b border-slate-100/50">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-950 font-black uppercase tracking-[0.2em] text-[9px] transition-all"><ChevronLeft className="w-3.5 h-3.5" /> 返回图书馆</button>
      </div>
      <div className="mb-12 px-4">
        <div className="flex justify-between items-start">
          <h1 className="text-xl md:text-2xl font-bold text-slate-950 mb-3 leading-snug font-serif-magazine tracking-tight pr-4">{article.title}</h1>
          <button onClick={() => audioManager.speak(article.title)} className="p-2 rounded-xl text-slate-300 hover:text-emerald-600 transition-all"><Volume2 className="w-5 h-5" /></button>
        </div>
        <p className="text-slate-400 text-sm italic mb-4 font-serif leading-relaxed opacity-90">{article.titleZh}</p>
        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-300"><Clock className="w-3 h-3" /> {article.readingTime}</div>
      </div>
      <div className="space-y-4 px-2 md:px-6">
        {article.paragraphs.map((para, i) => (
          <div key={i} className={`group flex flex-col gap-2 p-3 rounded-2xl transition-all duration-300 border-l-4 ${activeParaIdx === i ? 'bg-emerald-50/50 border-emerald-500' : 'border-transparent hover:bg-slate-50/50'}`}>
            <div className="flex gap-4 items-start">
              <div className="flex-1"><p className={`text-[15px] md:text-[16px] leading-[1.7] font-serif-magazine antialiased text-justify ${activeParaIdx === i ? 'text-emerald-950 font-medium' : 'text-slate-700'}`}>{para.en}</p></div>
              <button onClick={() => handlePlay(i, para.en)} className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm border focus:outline-none transition-all active:scale-90 ${activeParaIdx === i ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-400 border-slate-100'}`}>
                {activeParaIdx === i ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </div>
            <button onClick={() => setShowTrans(prev => ({...prev, [i]: !prev[i]}))} className="w-fit flex items-center gap-1.5 text-slate-400 hover:text-emerald-600 font-bold uppercase tracking-widest text-[9px] transition-all bg-slate-100/50 px-2.5 py-1.5 rounded-lg"><Zap className={`w-2.5 h-2.5 ${showTrans[i] ? 'fill-emerald-600 text-emerald-600' : ''}`} />{showTrans[i] ? '隐藏译文' : '显示译文'}</button>
            {showTrans[i] && <div className="animate-fade-in px-4 py-3 bg-emerald-50/20 rounded-xl border-l-2 border-emerald-200"><p className="text-slate-500 text-[14px] leading-relaxed italic font-serif text-justify">{para.zh}</p></div>}
          </div>
        ))}
      </div>
    </div>
  );
};

const ReadingModule = ({ articles }: { articles: Article[] }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedArticle = articles.find(a => a.id === selectedId);
  if (selectedArticle) return <ArticleDetailView article={selectedArticle} onBack={() => setSelectedId(null)} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in pt-4">
      {articles.map((article) => (
        <button key={article.id} onClick={() => setSelectedId(article.id)} className="group text-left bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden transition-all duration-500 hover:shadow-2xl">
          <div className="relative aspect-[16/10] overflow-hidden bg-slate-50"><img src={article.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" loading="lazy" /><div className="absolute top-4 left-4"><div className="bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-[9px] font-black text-slate-800 uppercase tracking-tighter shadow-sm">{article.readingTime}</div></div></div>
          <div className="flex-1 p-8 flex flex-col">
            <h3 className="text-lg font-bold text-slate-950 mb-2 leading-snug font-serif-magazine group-hover:text-emerald-700">{article.title}</h3>
            <p className="text-slate-400 text-[11px] font-medium italic mb-4 line-clamp-1">{article.titleZh}</p>
            <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-50">
              <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[120px]">{article.source}</span>
              <span className="text-emerald-600 text-[10px] font-black uppercase flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">开始阅读 <ChevronRight className="w-3.5 h-3.5" /></span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

// --- App Root ---

const App = () => {
  const [activeModule, setActiveModule] = useState<Module>('vocabulary'); 
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-[100]">
      <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
      <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">系统就绪中...</p>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 md:py-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">Lingo<span className="text-emerald-600">Master</span></h1><p className="text-slate-400 text-xs font-medium uppercase tracking-widest italic">专业英语精进系统</p></div>
        <nav className="flex gap-1 bg-slate-200/50 p-1.5 rounded-2xl w-full md:w-fit">{[
            { id: 'vocabulary', label: '核心词汇', icon: BookOpen },
            { id: 'dictation', label: '听写实验室', icon: Headphones },
            { id: 'reading', label: '精选阅读', icon: FileText }
          ].map((item) => (
            <button key={item.id} onClick={() => { audioManager.stopAll(); setActiveModule(item.id as Module); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${activeModule === item.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}><item.icon className="w-4 h-4" /><span className="hidden sm:inline">{item.label}</span></button>
          ))}</nav>
      </header>
      <main className="flex-1">
        {activeModule === 'vocabulary' && <VocabularyModule groups={vocabularyData.groups as VocabularyGroup[]} />}
        {activeModule === 'dictation' && <DictationModule />}
        {activeModule === 'reading' && <ReadingModule articles={readingData as Article[]} />}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}