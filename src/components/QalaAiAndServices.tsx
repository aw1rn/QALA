import {
  AlertTriangle,
  Calendar,
  Car,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileBadge,
  HardDrive,
  Mic,
  MicOff,
  Plus,
  QrCode,
  Scale,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Wallet,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ASTANA_CENTER,
  BUS_ROUTES,
  EGOV_GUIDES,
  KAZAKHSTAN_TV_CHANNELS,
} from '../data/astanaData';
import type {
  GarageVehicle,
  MapNote,
  PlanItem,
  QalaProfile,
  QalaSection,
  WalletTransaction,
} from '../types/qala';
import { API_BASE } from '../apiBase';

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/* -------------------------------------------------------------------------- */
/* 1. Qala AI Assistant (Server-side Gemini API + Voice Input + Actions)      */
/* -------------------------------------------------------------------------- */
interface AiActionChip {
  label: string;
  run: () => void;
}

export function QalaAiModule({
  onNavigateSection,
  onPlayTvByName,
  onBuildRouteToPlace,
  onLogExpense,
}: {
  onNavigateSection?: (s: QalaSection) => void;
  onPlayTvByName?: (query: string) => void;
  onBuildRouteToPlace?: (query: string) => void;
  onLogExpense?: (
    title: string,
    category: WalletTransaction['category'],
    amount: number
  ) => Promise<void>;
} = {}) {
  const [messages, setMessages] = useState<
    Array<{ role: 'user' | 'assistant'; text: string; actions?: AiActionChip[] }>
  >([
    {
      role: 'assistant',
      text: 'Қайырлы күн! Я — Qala AI. Могу подсказать маршруты по Астане, включить телеканал (например: «включи Qazaqstan»), построить маршрут («маршрут до Байтерека») или записать трату («запиши расход кофе 1500»).',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'ru-RU' | 'kk-KZ'>('ru-RU');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const quickPrompts = [
    'Включи канал Qazaqstan',
    'Построй маршрут до Хан Шатыр',
    'Запиши расход кофе 1800',
    'Где выгоднее снять 1-комнатную квартиру в Астане?',
  ];

  const tryHandleActionIntent = async (
    clean: string
  ): Promise<{ handled: boolean; reply: string; actions: AiActionChip[] }> => {
    const low = clean.toLowerCase();
    const actions: AiActionChip[] = [];

    // 1. Play TV channel intent
    const tvMatch = low.match(/(?:включи|покажи|тв|канал)\s+(.+)/i);
    if (tvMatch && (low.includes('включи') || low.includes('канал') || low.includes('тв'))) {
      const chQuery = tvMatch[1].replace(/канал/gi, '').trim();
      if (chQuery && onPlayTvByName) {
        onPlayTvByName(chQuery);
        actions.push({
          label: `Открыть Qala TV (${chQuery})`,
          run: () => onNavigateSection?.('tv'),
        });
        return {
          handled: true,
          reply: `Запускаю телеканал по запросу «${chQuery}» в Qala TV.`,
          actions,
        };
      }
    }

    // 2. Log expense intent: "запиши расход такси 1500" / "потратил 2500 на еду"
    const expMatch = low.match(/(?:запиши\s+расход|расход|потратил)\s+([а-яёa-z0-9\s-]+?)\s+(\d{2,7})/i);
    if (expMatch && onLogExpense) {
      const rawTitle = expMatch[1].trim();
      const amount = Number.parseInt(expMatch[2], 10);
      if (amount > 0) {
        const cat: WalletTransaction['category'] = rawTitle.includes('такси')
          ? 'Такси'
          : rawTitle.includes('автобус') || rawTitle.includes('штраф')
          ? 'Транспорт'
          : rawTitle.includes('кино')
          ? 'Кино'
          : rawTitle.includes('маркет')
          ? 'Маркет'
          : 'Еда';
        await onLogExpense(rawTitle, cat, amount);
        actions.push({
          label: 'Открыть Wallet',
          run: () => onNavigateSection?.('wallet'),
        });
        return {
          handled: true,
          reply: `Записано в Qala Wallet: «${rawTitle}» (${cat}) — ${amount.toLocaleString('ru-RU')} ₸.`,
          actions,
        };
      }
    }

    // 3. Build route intent
    const routeMatch = low.match(/(?:маршрут\s+до|поехали\s+в|такси\s+до|доехать\s+до)\s+(.+)/i);
    if (routeMatch && onBuildRouteToPlace) {
      const placeQ = routeMatch[1].trim();
      onBuildRouteToPlace(placeQ);
      return {
        handled: true,
        reply: `Открываю карту и строю маршрут до «${placeQ}».`,
        actions: [{ label: 'Перейти на карту', run: () => onNavigateSection?.('taxi') }],
      };
    }

    // 4. Direct navigation keywords
    if (low.startsWith('открой ') || low.startsWith('покажи ')) {
      const targetMap: Array<[string[], QalaSection, string]> = [
        [['пробк', 'погод', 'воздух', 'aqi'], 'traffic', 'Пробки и погода 7д'],
        [['карт', 'парков'], 'map', 'Карта Астаны'],
        [['еда', 'еду', 'ресторан', 'food'], 'food', 'Qala Food'],
        [['кино', 'фильм', 'афиш'], 'qino', 'Qala Qino'],
        [['кошелек', 'бюджет', 'wallet'], 'wallet', 'Qala Wallet'],
        [['налог', 'зарплат', 'штраф', 'намаз', 'праздник', 'ikomek'], 'info', 'Инфо, eGov и налоги'],
        [['гараж', 'документ', 'профиль', 'резерв'], 'id', 'Qala ID и Гараж'],
      ];
      for (const [keys, sec, label] of targetMap) {
        if (keys.some((k) => low.includes(k))) {
          onNavigateSection?.(sec);
          return {
            handled: true,
            reply: `Перехожу в раздел «${label}».`,
            actions: [{ label, run: () => onNavigateSection?.(sec) }],
          };
        }
      }
    }

    return { handled: false, reply: '', actions: [] };
  };

  const sendPrompt = async (promptText: string) => {
    const clean = promptText.trim();
    if (!clean || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', text: clean }]);
    setInput('');

    const intent = await tryHandleActionIntent(clean);
    if (intent.handled) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: intent.reply, actions: intent.actions },
      ]);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: clean }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || data.error) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.error || 'Не удалось получить ответ от Qala AI.',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: data.reply || 'Ответ получен.' },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Ошибка соединения с сервером Qala AI.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => BrowserSpeechRecognition;
      webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
    };
    const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechCtor) {
      setVoiceNotice('Голосовой ввод недоступен в этом браузере. Введите запрос текстом.');
      window.setTimeout(() => setVoiceNotice(null), 3200);
      return;
    }

    const rec = new SpeechCtor();
    rec.lang = voiceLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onerror = () => {
      setIsListening(false);
      setVoiceNotice('Не удалось распознать речь — проверьте доступ к микрофону.');
      window.setTimeout(() => setVoiceNotice(null), 3000);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    recognitionRef.current = rec;
    setIsListening(true);
    rec.start();
  };

  return (
    <div className="liquid-glass mx-auto max-w-4xl rounded-3xl p-5 sm:p-7 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900/10 pb-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
              Qala AI · Исполнитель команд
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Ассистент Астаны с голосовым вводом и быстрыми действиями в приложении
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-white/60 p-1 border border-white/70 dark:bg-slate-900/70 dark:border-white/15">
          {(['ru-RU', 'kk-KZ'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setVoiceLang(lang)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                voiceLang === lang
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {lang === 'ru-RU' ? 'RU' : 'KZ'}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => sendPrompt(p)}
            className="rounded-xl bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white transition-colors text-left dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/80 text-slate-900 shadow-sm dark:bg-slate-800/90 dark:text-slate-100'
              }`}
            >
              <div>{msg.text}</div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {msg.actions.map((act, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={act.run}
                      className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-bold text-white hover:bg-indigo-700"
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-white/75 px-4 py-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Qala AI формирует ответ…
            </div>
          </div>
        )}
      </div>

      {voiceNotice && (
        <div className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
          {voiceNotice}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendPrompt(input);
        }}
        className="flex gap-2 pt-2 border-t border-slate-900/10 dark:border-white/10"
      >
        <button
          type="button"
          onClick={toggleVoiceInput}
          title={isListening ? 'Остановить диктовку' : 'Голосовой ввод'}
          aria-label="Голосовой ввод"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
            isListening
              ? 'bg-rose-600 text-white shadow-md'
              : 'bg-white/75 text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200'
          }`}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isListening
              ? 'Слушаю ваш голос…'
              : 'Команда или вопрос: «включи Хабар», «маршрут до Байтерека»…'
          }
          className="flex-1 rounded-xl border border-white/80 bg-white/75 px-4 py-3 text-sm text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Отправить</span>
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Qala Шешім (Decision Helper)                                            */
/* -------------------------------------------------------------------------- */
export function QalaSheshimModule() {
  const [options, setOptions] = useState([
    { id: '1', name: 'Есиль (Левый берег)', priceScore: 6, commuteScore: 9, comfortScore: 9 },
    { id: '2', name: 'Сарыарка (Правый берег)', priceScore: 9, commuteScore: 7, comfortScore: 7 },
  ]);
  const [newOptionName, setNewOptionName] = useState('');
  const [weightPrice, setWeightPrice] = useState(40);
  const [weightCommute, setWeightCommute] = useState(35);
  const [weightComfort, setWeightComfort] = useState(25);

  const scoredOptions = options
    .map((opt) => {
      const totalWeight = weightPrice + weightCommute + weightComfort || 1;
      const score =
        (opt.priceScore * weightPrice +
          opt.commuteScore * weightCommute +
          opt.comfortScore * weightComfort) /
        totalWeight;
      return { ...opt, score: Number(score.toFixed(1)) };
    })
    .sort((a, b) => b.score - a.score);

  const addOption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOptionName.trim()) return;
    setOptions((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        name: newOptionName.trim(),
        priceScore: 7,
        commuteScore: 7,
        comfortScore: 8,
      },
    ]);
    setNewOptionName('');
  };

  const updateScore = (
    id: string,
    field: 'priceScore' | 'commuteScore' | 'comfortScore',
    val: number
  ) => {
    setOptions((prev) =>
      prev.map((o) => (o.id === id ? { ...o, [field]: val } : o))
    );
  };

  return (
    <div className="liquid-glass mx-auto max-w-4xl rounded-3xl p-5 sm:p-7 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950">
          <Scale className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Qala Шешім
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Взвешенное сравнение вариантов для принятия решения
          </p>
        </div>
      </div>

      {/* Criteria Weights */}
      <div className="grid grid-cols-1 gap-4 rounded-2xl bg-white/60 p-4 sm:grid-cols-3 dark:bg-slate-800/60">
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Важность цены</span>
            <span className="font-mono tabular-nums">{weightPrice}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weightPrice}
            onChange={(e) => setWeightPrice(Number(e.target.value))}
            className="mt-2 w-full accent-slate-900 dark:accent-orange-500"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Важность дороги</span>
            <span className="font-mono tabular-nums">{weightCommute}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weightCommute}
            onChange={(e) => setWeightCommute(Number(e.target.value))}
            className="mt-2 w-full accent-slate-900 dark:accent-orange-500"
          />
        </div>
        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span>Важность комфорта</span>
            <span className="font-mono tabular-nums">{weightComfort}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={weightComfort}
            onChange={(e) => setWeightComfort(Number(e.target.value))}
            className="mt-2 w-full accent-slate-900 dark:accent-orange-500"
          />
        </div>
      </div>

      {/* Add Option */}
      <form onSubmit={addOption} className="flex gap-2">
        <input
          type="text"
          value={newOptionName}
          onChange={(e) => setNewOptionName(e.target.value)}
          placeholder="Добавить свой вариант (например: Район Алматы)…"
          className="flex-1 rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white dark:bg-orange-500 dark:text-slate-950"
        >
          <Plus className="h-4 w-4" />
          Добавить
        </button>
      </form>

      {/* Ranked Options */}
      <div className="space-y-3">
        {scoredOptions.map((opt, idx) => (
          <div
            key={opt.id}
            className={`rounded-2xl p-4 ${
              idx === 0
                ? 'bg-white/90 ring-2 ring-emerald-700 shadow-sm dark:bg-slate-800/95'
                : 'bg-white/65 dark:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                {idx + 1}. {opt.name}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-base font-extrabold text-emerald-800 dark:text-emerald-400 tabular-nums">
                  {opt.score} / 10
                </span>
                {options.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setOptions((prev) => prev.filter((x) => x.id !== opt.id))
                    }
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="Удалить вариант"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <label className="block">
                <span className="text-slate-600 dark:text-slate-400">Цена ({opt.priceScore})</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={opt.priceScore}
                  onChange={(e) => updateScore(opt.id, 'priceScore', Number(e.target.value))}
                  className="mt-1 w-full accent-orange-500"
                />
              </label>
              <label className="block">
                <span className="text-slate-600 dark:text-slate-400">Дорога ({opt.commuteScore})</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={opt.commuteScore}
                  onChange={(e) => updateScore(opt.id, 'commuteScore', Number(e.target.value))}
                  className="mt-1 w-full accent-blue-600"
                />
              </label>
              <label className="block">
                <span className="text-slate-600 dark:text-slate-400">Комфорт ({opt.comfortScore})</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={opt.comfortScore}
                  onChange={(e) => updateScore(opt.id, 'comfortScore', Number(e.target.value))}
                  className="mt-1 w-full accent-emerald-600"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Wallet & Plans (SQLite + Category Shield + Recurring + Split Bill)      */
/* -------------------------------------------------------------------------- */
interface QalaWalletModuleProps {
  transactions: WalletTransaction[];
  totalSpent: number;
  plans: PlanItem[];
  onAddTransaction: (
    title: string,
    category: WalletTransaction['category'],
    amount: number
  ) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onAddPlan: (title: string, dateLabel: string) => Promise<void>;
  onTogglePlan: (id: string, completed: boolean) => Promise<void>;
  onDeletePlan: (id: string) => Promise<void>;
}

const WALLET_CATEGORIES: WalletTransaction['category'][] = [
  'Еда',
  'Такси',
  'Транспорт',
  'Маркет',
  'Кино',
  'Другое',
];

const RECURRING_PRESETS: Array<{
  title: string;
  category: WalletTransaction['category'];
  amount: number;
}> = [
  { title: 'Интернет Kazakhtelecom', category: 'Другое', amount: 5990 },
  { title: 'ЖКХ Астана ЕРЦ', category: 'Другое', amount: 14500 },
  { title: 'Абонемент Avtobys', category: 'Транспорт', amount: 7500 },
  { title: 'Аренда жилья (месяц)', category: 'Другое', amount: 180000 },
];

export function QalaWalletModule({
  transactions,
  totalSpent,
  plans,
  onAddTransaction,
  onDeleteTransaction,
  onAddPlan,
  onTogglePlan,
  onDeletePlan,
}: QalaWalletModuleProps) {
  const [txTitle, setTxTitle] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txCat, setTxCat] = useState<WalletTransaction['category']>('Еда');

  const [planTitle, setPlanTitle] = useState('');
  const [planDate, setPlanDate] = useState('Сегодня');

  const [monthlyBudget, setMonthlyBudget] = useState<number>(150000);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('150000');

  // Category Budget Shield thresholds
  const [catLimits, setCatLimits] = useState<Record<string, number>>(() => {
    try {
      const saved = window.localStorage.getItem('qala_cat_limits_v1');
      return saved
        ? (JSON.parse(saved) as Record<string, number>)
        : { Еда: 50000, Такси: 25000, Маркет: 40000, Кино: 15000 };
    } catch {
      return { Еда: 50000, Такси: 25000, Маркет: 40000, Кино: 15000 };
    }
  });
  const [showShieldModal, setShowShieldModal] = useState(false);

  // Split Bill Calculator
  const [billTotal, setBillTotal] = useState('16500');
  const [billPeople, setBillPeople] = useState('3');
  const [billTipPct, setBillTipPct] = useState('10');

  useEffect(() => {
    fetch(`${API_BASE}/api/wallet/budget`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { budget?: number } | null) => {
        if (d?.budget && d.budget > 0) {
          setMonthlyBudget(d.budget);
          setBudgetInput(String(d.budget));
        }
      })
      .catch(() => undefined);
  }, []);

  const saveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Math.max(1000, Number.parseInt(budgetInput, 10) || 150000);
    setMonthlyBudget(val);
    setEditingBudget(false);
    await fetch(`${API_BASE}/api/wallet/budget`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget: val }),
    }).catch(() => undefined);
  };

  const budgetPct = Math.min(100, Math.round((totalSpent / Math.max(1, monthlyBudget)) * 100));

  const categoryBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const c of WALLET_CATEGORIES) totals[c] = 0;
    for (const tx of transactions) {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
    }
    return WALLET_CATEGORIES.map((cat) => {
      const amount = totals[cat] || 0;
      const limit = catLimits[cat] || 0;
      const limitPct = limit > 0 ? Math.round((amount / limit) * 100) : 0;
      return {
        cat,
        amount,
        limit,
        limitPct,
        pct: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
      };
    });
  }, [catLimits, totalSpent, transactions]);

  const overLimitAlerts = useMemo(
    () => categoryBreakdown.filter((x) => x.limit > 0 && x.limitPct >= 80),
    [categoryBreakdown]
  );

  const splitPerPerson = useMemo(() => {
    const tot = Math.max(0, Number.parseFloat(billTotal) || 0);
    const cnt = Math.max(1, Number.parseInt(billPeople, 10) || 1);
    const tip = Math.max(0, Number.parseFloat(billTipPct) || 0);
    return Math.round((tot * (1 + tip / 100)) / cnt);
  }, [billPeople, billTipPct, billTotal]);

  const updateCatLimit = (cat: string, val: number) => {
    setCatLimits((prev) => {
      const next = { ...prev, [cat]: Math.max(0, val) };
      try {
        window.localStorage.setItem('qala_cat_limits_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const downloadExport = (format: 'csv' | 'json') => {
    let content = '';
    let mime = 'text/plain;charset=utf-8';
    if (format === 'json') {
      content = JSON.stringify({ totalSpent, monthlyBudget, transactions, plans }, null, 2);
      mime = 'application/json;charset=utf-8';
    } else {
      const header = 'ID,Название,Категория,Сумма (KZT),Дата\n';
      const rows = transactions
        .map(
          (t) =>
            `"${t.id}","${t.title.replace(/"/g, '""')}","${t.category}",${t.amount},"${t.createdAt}"`
        )
        .join('\n');
      content = `\uFEFF${header}${rows}`;
      mime = 'text/csv;charset=utf-8';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qala-wallet.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Wallet */}
        <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  Qala Wallet
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Лимит: {monthlyBudget.toLocaleString('ru-RU')} ₸/мес
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">
                {totalSpent.toLocaleString('ru-RU')} ₸
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => setEditingBudget((v) => !v)}
                  className="text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400"
                >
                  {editingBudget ? 'Отмена' : 'Лимит'}
                </button>
                <span className="text-slate-400">·</span>
                <button
                  type="button"
                  onClick={() => setShowShieldModal((v) => !v)}
                  className="text-[11px] font-semibold text-amber-700 hover:underline dark:text-amber-300"
                >
                  Щит категорий
                </button>
                <span className="text-slate-400">·</span>
                <button
                  type="button"
                  onClick={() => downloadExport('csv')}
                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300"
                >
                  CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadExport('json')}
                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300"
                >
                  JSON
                </button>
              </div>
            </div>
          </div>

          {/* Budget Progress Bar */}
          <div className="rounded-2xl bg-white/65 p-3 space-y-2 dark:bg-slate-800/60">
            {editingBudget && (
              <form onSubmit={saveBudget} className="flex gap-2 pb-1">
                <input
                  type="number"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="flex-1 rounded-xl border border-white/80 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white dark:bg-orange-500 dark:text-slate-950"
                >
                  Сохранить
                </button>
              </form>
            )}

            {showShieldModal && (
              <div className="rounded-xl border border-amber-400/40 bg-white/90 p-3 space-y-2 dark:bg-slate-900/90">
                <div className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                  Бюджетный щит (пороги по категориям, ₸)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {WALLET_CATEGORIES.map((c) => (
                    <label key={c} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-600 dark:text-slate-300">{c}</span>
                      <input
                        type="number"
                        value={catLimits[c] || 0}
                        onChange={(e) => updateCatLimit(c, Number(e.target.value))}
                        className="w-20 rounded-lg border border-slate-300/70 bg-white px-2 py-1 font-mono text-[11px] text-slate-900 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {overLimitAlerts.length > 0 && (
              <div className="flex items-start gap-2 rounded-xl bg-rose-500/15 px-3 py-2 text-[11px] font-bold text-rose-800 dark:text-rose-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Щит бюджета:{' '}
                  {overLimitAlerts.map((a) => `${a.cat} (${a.limitPct}%)`).join(', ')}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-slate-600 dark:text-slate-300">
                Использовано {budgetPct}% бюджета
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                Остаток: {Math.max(0, monthlyBudget - totalSpent).toLocaleString('ru-RU')} ₸
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  totalSpent > monthlyBudget
                    ? 'bg-rose-600'
                    : budgetPct >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, budgetPct)}%` }}
              />
            </div>

            {categoryBreakdown.some((x) => x.amount > 0) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categoryBreakdown
                  .filter((x) => x.amount > 0)
                  .map((item) => (
                    <span
                      key={item.cat}
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                        item.limit > 0 && item.limitPct >= 100
                          ? 'bg-rose-600 text-white'
                          : 'bg-white/80 text-slate-800 dark:bg-slate-900/80 dark:text-slate-200'
                      }`}
                    >
                      {item.cat}: <span className="font-mono">{item.amount.toLocaleString('ru-RU')}₸</span> ({item.pct}%)
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Quick Recurring Payments */}
          <div className="flex flex-wrap gap-1.5">
            {RECURRING_PRESETS.map((pr) => (
              <button
                key={pr.title}
                type="button"
                onClick={() => void onAddTransaction(pr.title, pr.category, pr.amount)}
                className="rounded-xl bg-white/75 px-2.5 py-1.5 text-[11px] font-semibold text-slate-800 hover:bg-white dark:bg-slate-800/80 dark:text-slate-200"
              >
                + {pr.title} ({pr.amount.toLocaleString('ru-RU')} ₸)
              </button>
            ))}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!txTitle.trim() || !txAmount) return;
              await onAddTransaction(txTitle.trim(), txCat, Number.parseInt(txAmount, 10));
              setTxTitle('');
              setTxAmount('');
            }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_110px_auto]"
          >
            <input
              type="text"
              value={txTitle}
              onChange={(e) => setTxTitle(e.target.value)}
              placeholder="Расход (например: Кофе)"
              className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <select
              value={txCat}
              onChange={(e) => setTxCat(e.target.value as WalletTransaction['category'])}
              className="rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            >
              {WALLET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={txAmount}
              onChange={(e) => setTxAmount(e.target.value)}
              placeholder="Сумма ₸"
              className="rounded-xl border border-white/80 bg-white/75 px-3 py-2 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
            >
              +
            </button>
          </form>

          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {transactions.length === 0 ? (
              <div className="rounded-2xl bg-white/50 p-6 text-center text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                Расходов за месяц пока 0 ₸. Закажите такси, купите билет в кино или добавьте
                трату вручную.
              </div>
            ) : (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-2xl bg-white/70 px-4 py-2.5 text-xs dark:bg-slate-800/70"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">{tx.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{tx.category}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      -{tx.amount.toLocaleString('ru-RU')} ₸
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteTransaction(tx.id)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label="Удалить расход"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Plans + Split Bill */}
        <div className="space-y-5">
          {/* Split Bill Calculator */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Разделить счёт (Split Bill)
                  </h3>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Удобно после ужина в ресторане Астаны
                  </p>
                </div>
              </div>
              <div className="font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
                {splitPerPerson.toLocaleString('ru-RU')} ₸/чел
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="block">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Чек, ₸
                </span>
                <input
                  type="number"
                  value={billTotal}
                  onChange={(e) => setBillTotal(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Гостей
                </span>
                <input
                  type="number"
                  min={1}
                  value={billPeople}
                  onChange={(e) => setBillPeople(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Чаевые / %
                </span>
                <input
                  type="number"
                  min={0}
                  value={billTipPct}
                  onChange={(e) => setBillTipPct(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() =>
                void onAddTransaction(
                  `Моя доля чека (на ${billPeople})`,
                  'Еда',
                  splitPerPerson
                )
              }
              className="w-full rounded-xl bg-emerald-700 py-2 text-xs font-bold text-white hover:bg-emerald-800"
            >
              Записать мою долю ({splitPerPerson.toLocaleString('ru-RU')} ₸)
            </button>
          </div>

          {/* Plans & Reminders */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Планы и напоминания
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Ежедневное планирование</p>
                </div>
              </div>
              <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                {plans.filter((p) => !p.completed).length} активных
              </span>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!planTitle.trim()) return;
                await onAddPlan(planTitle.trim(), planDate);
                setPlanTitle('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                placeholder="Добавить план (например: Позвонить курьеру)…"
                className="flex-1 rounded-xl border border-white/80 bg-white/75 px-3.5 py-2 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
              <select
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="Сегодня">Сегодня</option>
                <option value="Завтра">Завтра</option>
                <option value="На неделе">На неделе</option>
              </select>
              <button
                type="submit"
                className="rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-700"
              >
                +
              </button>
            </form>

            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {plans.length === 0 ? (
                <div className="rounded-2xl bg-white/50 p-6 text-center text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                  Нет планов. Добавьте задачу или купите билет в Qala Qino.
                </div>
              ) : (
                plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-2.5 text-xs dark:bg-slate-800/70"
                  >
                    <button
                      type="button"
                      onClick={() => onTogglePlan(plan.id, !plan.completed)}
                      className="flex items-center gap-3 text-left flex-1 min-w-0"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          plan.completed
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-400 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {plan.completed && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`truncate font-semibold ${
                            plan.completed
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {plan.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {plan.dateLabel}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePlan(plan.id)}
                      className="text-slate-400 hover:text-rose-600"
                      aria-label="Удалить план"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Qala Офлайн (Real Offline Snapshot Cache + Viewer)                      */
/* -------------------------------------------------------------------------- */
interface OfflineSnapshot {
  savedAt: string;
  apartmentsCount: number;
  bookmarksCount: number;
  busRoutesCount: number;
  channelsCount: number;
  guidesCount: number;
}

export function QalaOfflineModule({ onNotify }: { onNotify: (msg: string) => void }) {
  const [downloadedKeys, setDownloadedKeys] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('qala_offline_packs');
      return saved ? (JSON.parse(saved) as string[]) : ['map'];
    } catch {
      return ['map'];
    }
  });
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(() => {
    try {
      const raw = localStorage.getItem('qala_offline_snapshot_v1');
      return raw ? (JSON.parse(raw) as OfflineSnapshot) : null;
    } catch {
      return null;
    }
  });
  const [showCachePreview, setShowCachePreview] = useState(false);

  const packs = [
    { id: 'map', title: 'Карта Астаны и закладки', sizeMb: 14.2, detail: '4 из 4 районов' },
    { id: 'bus', title: 'Маршруты автобусов', sizeMb: 2.8, detail: `${BUS_ROUTES.length} линий` },
    { id: 'afisha', title: 'Афиша кино и eGov памятки', sizeMb: 1.4, detail: `${EGOV_GUIDES.length} гайдов` },
    { id: 'tv', title: 'Список телеканалов и EPG', sizeMb: 0.9, detail: `${KAZAKHSTAN_TV_CHANNELS.length} каналов РК` },
    { id: 'profile', title: 'Жильё Qala Үй и SQLite снимок', sizeMb: 1.2, detail: 'Кэш объявлений' },
  ];

  const totalMb = packs
    .filter((p) => downloadedKeys.includes(p.id))
    .reduce((sum, p) => sum + p.sizeMb, 0)
    .toFixed(1);

  const performSnapshot = async () => {
    try {
      const [aptRes, bmRes] = await Promise.all([
        fetch(`${API_BASE}/api/apartments`).catch(() => null),
        fetch(`${API_BASE}/api/map/bookmarks`).catch(() => null),
      ]);
      const aptData = aptRes && aptRes.ok ? ((await aptRes.json()) as { apartments?: unknown[] }) : {};
      const bmData = bmRes && bmRes.ok ? ((await bmRes.json()) as { bookmarks?: unknown[] }) : {};
      const nextSnap: OfflineSnapshot = {
        savedAt: new Date().toLocaleString('ru-RU'),
        apartmentsCount: (aptData.apartments || []).length,
        bookmarksCount: (bmData.bookmarks || []).length,
        busRoutesCount: BUS_ROUTES.length,
        channelsCount: KAZAKHSTAN_TV_CHANNELS.length,
        guidesCount: EGOV_GUIDES.length,
      };
      localStorage.setItem('qala_offline_snapshot_v1', JSON.stringify(nextSnap));
      setSnapshot(nextSnap);
    } catch {
      // keep silent
    }
  };

  const togglePack = (id: string) => {
    const next = downloadedKeys.includes(id)
      ? downloadedKeys.filter((k) => k !== id)
      : [...downloadedKeys, id];
    setDownloadedKeys(next);
    localStorage.setItem('qala_offline_packs', JSON.stringify(next));
    void performSnapshot();
  };

  const downloadAll = async () => {
    const all = packs.map((p) => p.id);
    setDownloadedKeys(all);
    localStorage.setItem('qala_offline_packs', JSON.stringify(all));
    await performSnapshot();
    onNotify('Реальный офлайн-снимок QALA сохранён на устройстве');
  };

  return (
    <div className="liquid-glass mx-auto max-w-3xl rounded-3xl p-5 sm:p-7 space-y-5">
      <div>
        <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
          Qala Офлайн
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 px-4 py-3 text-xs dark:bg-emerald-950/50 dark:border-emerald-500/30">
          <span className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200">
            <Wifi className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            {snapshot ? `Снимок от ${snapshot.savedAt}` : 'Локальный кэш готов'}
          </span>
          <span className="font-mono font-bold text-emerald-900 dark:text-emerald-200 tabular-nums">
            Сохранено: {totalMb} МБ
          </span>
        </div>
      </div>

      <div className="space-y-2.5">
        {packs.map((pack) => {
          const isSaved = downloadedKeys.includes(pack.id);
          return (
            <div
              key={pack.id}
              className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 dark:bg-slate-800/70"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isSaved
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <HardDrive className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {pack.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {pack.detail} · {pack.sizeMb} МБ
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => togglePack(pack.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  isSaved
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950'
                }`}
              >
                {isSaved ? 'Скачано' : 'Скачать'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadAll}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
        >
          <Download className="h-4 w-4" />
          Скачать всё для офлайна
        </button>
        <button
          type="button"
          onClick={() => setShowCachePreview(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
        >
          <Eye className="h-4 w-4" />
          Просмотр кэша
        </button>
      </div>

      {showCachePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setShowCachePreview(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-md rounded-3xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                Содержимое офлайн-кэша
              </h3>
              <button
                type="button"
                onClick={() => setShowCachePreview(false)}
                className="rounded-lg bg-white/70 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-2xl bg-white/75 p-4 text-xs space-y-2 dark:bg-slate-900/75 dark:text-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Обновлён</span>
                <span className="font-mono font-bold">{snapshot?.savedAt || 'Только что'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Квартиры Qala Үй</span>
                <span className="font-mono font-bold">{snapshot?.apartmentsCount ?? 10}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Автобусные линии</span>
                <span className="font-mono font-bold">{snapshot?.busRoutesCount ?? BUS_ROUTES.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Каналы Qala TV</span>
                <span className="font-mono font-bold">{snapshot?.channelsCount ?? KAZAKHSTAN_TV_CHANNELS.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Закладки на карте</span>
                <span className="font-mono font-bold">{snapshot?.bookmarksCount ?? 2}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Qala ID, Digital Docs, Garage, Family Zones & JSON Backup               */
/* -------------------------------------------------------------------------- */
export function QalaIdModule({
  profile,
  onSave,
  onNotify,
  onDataRestored,
}: {
  profile: QalaProfile;
  onSave: (p: QalaProfile) => Promise<void>;
  onNotify?: (msg: string) => void;
  onDataRestored?: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'profile' | 'docs' | 'garage' | 'family' | 'backup'>('profile');
  const [form, setForm] = useState<QalaProfile>(profile);
  const [saved, setSaved] = useState(false);

  // Digital Docs state
  const [showIin, setShowIin] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<'id' | 'driver' | 'srts'>('id');

  // Garage state
  const [vehicles, setVehicles] = useState<GarageVehicle[]>([]);
  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('2022');
  const [mileageKm, setMileageKm] = useState('45000');
  const [tireSeason, setTireSeason] =
    useState<GarageVehicle['tireSeason']>('Зима (шипы)');

  // Family Geofences (stored via /api/map/notes kind='family_zone')
  const [familyZones, setFamilyZones] = useState<MapNote[]>([]);
  const [zoneTitle, setZoneTitle] = useState('');
  const [zoneAddress, setZoneAddress] = useState('ул. Сыганак, 18');

  // Backup state
  const [restoreJson, setRestoreJson] = useState('');

  const loadGarageAndZones = useCallback(async () => {
    const [gRes, nRes] = await Promise.all([fetch(`${API_BASE}/api/garage`), fetch(`${API_BASE}/api/map/notes`)]);
    if (gRes.ok) {
      const gd = (await gRes.json()) as { vehicles?: GarageVehicle[] };
      setVehicles(gd.vehicles || []);
    }
    if (nRes.ok) {
      const nd = (await nRes.json()) as { notes?: MapNote[] };
      setFamilyZones((nd.notes || []).filter((n) => n.kind === 'family_zone'));
    }
  }, []);

  useEffect(() => {
    void loadGarageAndZones();
  }, [loadGarageAndZones]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim() || !model.trim()) return;
    const res = await fetch(`${API_BASE}/api/garage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plate: plate.trim().toUpperCase(),
        model: model.trim(),
        year: Number.parseInt(year, 10) || 2022,
        mileageKm: Number.parseInt(mileageKm, 10) || 40000,
        techInspectionDate: '2026-10-15',
        insuranceDate: '2026-11-30',
        tireSeason,
        nextOilChangeKm: (Number.parseInt(mileageKm, 10) || 40000) + 7000,
      }),
    });
    if (res.ok) {
      setPlate('');
      setModel('');
      await loadGarageAndZones();
      onNotify?.('Автомобиль добавлен в Гараж QALA');
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    await fetch(`${API_BASE}/api/garage/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadGarageAndZones();
  };

  const handleAddFamilyZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneTitle.trim()) return;
    const res = await fetch(`${API_BASE}/api/map/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: zoneTitle.trim(),
        note: 'Безопасная зона семьи · радиус 350 м',
        kind: 'family_zone',
        rating: 5,
        address: zoneAddress.trim() || 'Астана',
        lat: ASTANA_CENTER[0] + (Math.random() - 0.5) * 0.02,
        lng: ASTANA_CENTER[1] + (Math.random() - 0.5) * 0.02,
      }),
    });
    if (res.ok) {
      setZoneTitle('');
      await loadGarageAndZones();
      onNotify?.('Семейная геозона сохранена на карте');
    }
  };

  const handleExportBackup = async () => {
    const res = await fetch(`${API_BASE}/api/backup/export`);
    if (!res.ok) return;
    const json = await res.json();
    const blob = new Blob([JSON.stringify(json, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qala-astana-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    onNotify?.('Полная резервная копия SQLite скачана');
  };

  const handleRestoreBackup = async () => {
    if (!restoreJson.trim()) return;
    try {
      const parsed = JSON.parse(restoreJson);
      const res = await fetch(`${API_BASE}/api/backup/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.ok) {
        await loadGarageAndZones();
        await onDataRestored?.();
        onNotify?.('Данные QALA успешно восстановлены из резервной копии');
      } else {
        onNotify?.('Неверный формат резервной копии');
      }
    } catch {
      onNotify?.('Ошибка чтения JSON резервной копии');
    }
  };

  const docData = {
    id: {
      title: 'Удостоверение личности РК',
      number: '№ 045891234',
      iin: '960418350412',
      validUntil: '18.04.2032',
      extra: 'МВД РК · г. Астана',
    },
    driver: {
      title: 'Водительское удостоверение',
      number: 'KZ 71849012',
      iin: '960418350412',
      validUntil: '12.09.2030',
      extra: 'Категории: B, B1 · Стаж 8 лет',
    },
    srts: {
      title: 'Свидетельство о регистрации ТС (Техпаспорт)',
      number: 'ZX 00419284',
      iin: '010 ZZZ 01 · Hyundai Tucson',
      validUntil: 'Бессрочно',
      extra: 'Департамент полиции г. Астаны',
    },
  }[selectedDoc];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Sub-navigation tabs */}
      <div className="liquid-glass flex flex-wrap gap-1.5 rounded-3xl p-3">
        {(
          [
            { id: 'profile', label: 'Профиль ID' },
            { id: 'docs', label: 'Цифровые документы + QR' },
            { id: 'garage', label: `Мой Гараж (${vehicles.length})` },
            { id: 'family', label: `Семья (${familyZones.length})` },
            { id: 'backup', label: 'Резервная копия' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-2xl px-3.5 py-2 text-xs font-bold transition-colors ${
              tab === t.id
                ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                : 'bg-white/65 text-slate-800 hover:bg-white dark:bg-slate-800/75 dark:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: PROFILE */}
      {tab === 'profile' && (
        <form onSubmit={handleSubmit} className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-4 border-b border-slate-900/10 pb-5 dark:border-white/10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 font-display text-2xl font-extrabold text-white shadow-md">
              {(form.name.charAt(0) || 'А').toUpperCase()}
            </div>
            <div>
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                Qala ID
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Единый городской профиль · сохраняется в локальной базе SQLite
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Имя
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Город
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Домашний адрес
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Телефон
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-orange-500 dark:text-slate-950"
          >
            <UserCheck className="h-4 w-4" />
            {saved ? 'Профиль сохранён' : 'Сохранить профиль'}
          </button>
        </form>
      )}

      {/* TAB 2: DIGITAL DOCUMENTS + QR */}
      {tab === 'docs' && (
        <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white">
                <FileBadge className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  Цифровые документы
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Быстрый доступ к реквизитам и QR-коду предъявления
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              {(
                [
                  { id: 'id', label: 'Удостоверение' },
                  { id: 'driver', label: 'Права' },
                  { id: 'srts', label: 'Техпаспорт' },
                ] as const
              ).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDoc(d.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                    selectedDoc === d.id
                      ? 'bg-sky-600 text-white'
                      : 'bg-white/70 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px] rounded-2xl bg-white/80 p-5 dark:bg-slate-900/80">
            <div className="space-y-2.5 text-xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                {docData.title}
              </div>
              <div className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                {form.name} · г. {form.city}
              </div>
              <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-800 dark:text-slate-200">
                <span>
                  {showIin ? docData.iin : docData.iin.replace(/(\d{4})\d+(\d{2})/, '$1 •••••• $2')}
                </span>
                <button
                  type="button"
                  onClick={() => setShowIin((v) => !v)}
                  className="rounded-lg bg-slate-200/80 p-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  aria-label="Показать/скрыть ИИН"
                >
                  {showIin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(docData.iin).catch(() => {});
                    onNotify?.(`Скопировано: ${docData.iin}`);
                  }}
                  className="rounded-lg bg-slate-200/80 p-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  aria-label="Копировать реквизит"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                Документ: <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{docData.number}</span> · Действует до {docData.validUntil}
              </div>
              <div className="text-slate-500 dark:text-slate-400">{docData.extra}</div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
              <QrCode className="h-24 w-24 text-slate-900 dark:text-white" strokeWidth={1.4} />
              <div className="mt-1 font-mono text-[10px] font-bold text-slate-500">
                QR eGov · 6 цифр: 482910
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MY GARAGE */}
      {tab === 'garage' && (
        <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Мой Авто / Гараж
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Контроль страховки ОГПО, техосмотра, пробега и замены шин (зима/лето)
              </p>
            </div>
          </div>

          <form onSubmit={handleAddVehicle} className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            <input
              type="text"
              required
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="010 ZZZ 01"
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 font-mono text-xs font-bold uppercase text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              required
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Модель (Kia K5)"
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Год"
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              value={mileageKm}
              onChange={(e) => setMileageKm(e.target.value)}
              placeholder="Пробег км"
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 font-mono text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <select
              value={tireSeason}
              onChange={(e) => setTireSeason(e.target.value as GarageVehicle['tireSeason'])}
              className="rounded-xl border border-white/80 bg-white/80 px-2.5 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="Зима (шипы)">Зима (шипы)</option>
              <option value="Зима (липучка)">Зима (липучка)</option>
              <option value="Лето">Лето</option>
            </select>
            <button
              type="submit"
              className="sm:col-span-5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-amber-500 dark:text-slate-950"
            >
              + Добавить авто в Гараж
            </button>
          </form>

          <div className="space-y-3">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className="rounded-2xl bg-white/75 p-4 text-xs space-y-2 dark:bg-slate-800/75"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="rounded-lg bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-extrabold text-white dark:bg-amber-400 dark:text-slate-950">
                      {v.plate}
                    </span>
                    <span className="ml-2.5 font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                      {v.model} ({v.year})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteVehicle(v.id)}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="Удалить авто"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px] text-slate-600 dark:text-slate-300">
                  <div>Пробег: <span className="font-mono font-bold">{v.mileageKm.toLocaleString('ru-RU')} км</span></div>
                  <div>Шины: <span className="font-bold">{v.tireSeason}</span></div>
                  <div>ОГПО до: <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{v.insuranceDate}</span></div>
                  <div>ТО / Масло: <span className="font-mono font-bold">{v.nextOilChangeKm.toLocaleString('ru-RU')} км</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: FAMILY GEOFENCES */}
      {tab === 'family' && (
        <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Семейные геозоны безопасности
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Контрольные точки на карте Астаны (Дом, Школа, Секция)
              </p>
            </div>
          </div>

          <form onSubmit={handleAddFamilyZone} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              type="text"
              required
              value={zoneTitle}
              onChange={(e) => setZoneTitle(e.target.value)}
              placeholder="Название (например: Школа BINOM)"
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={zoneAddress}
              onChange={(e) => setZoneAddress(e.target.value)}
              placeholder="Адрес в Астане"
              className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700"
            >
              + Геозона
            </button>
          </form>

          <div className="space-y-2">
            {familyZones.length === 0 ? (
              <div className="rounded-2xl bg-white/60 p-5 text-center text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Добавьте безопасные зоны для семьи — они автоматически появятся на карте Астаны со значком 🛡️.
              </div>
            ) : (
              familyZones.map((fz) => (
                <div
                  key={fz.id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-white/75 px-4 py-3 text-xs dark:bg-slate-800/75"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      🛡️ {fz.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {fz.address} · {fz.note}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`${API_BASE}/api/map/notes/${encodeURIComponent(fz.id)}`, {
                        method: 'DELETE',
                      });
                      await loadGarageAndZones();
                    }}
                    className="text-slate-400 hover:text-rose-600"
                    aria-label="Удалить геозону"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: FULL JSON BACKUP & RESTORE */}
      {tab === 'backup' && (
        <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Резервная копия QALA (SQLite JSON)
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Экспорт и восстановление профиля, Wallet, закладок, заметок, гаража и заявок iKomek
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExportBackup}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 dark:bg-emerald-600"
          >
            <Download className="h-4 w-4" />
            Скачать полную копию (.json)
          </button>

          <div className="space-y-2 border-t border-slate-900/10 pt-4 dark:border-white/10">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span>Восстановление из JSON-файла</span>
              <label className="cursor-pointer rounded-xl bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-white dark:bg-slate-800 dark:text-sky-300">
                <Upload className="inline h-3.5 w-3.5 mr-1" />
                Выбрать файл
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    file.text().then((txt) => setRestoreJson(txt)).catch(() => {});
                  }}
                />
              </label>
            </div>
            <textarea
              rows={4}
              value={restoreJson}
              onChange={(e) => setRestoreJson(e.target.value)}
              placeholder="Вставьте содержимое qala-astana-backup.json или выберите файл выше…"
              className="w-full rounded-2xl border border-white/80 bg-white/75 p-3 font-mono text-[11px] text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={handleRestoreBackup}
              disabled={!restoreJson.trim()}
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Восстановить данные из JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
