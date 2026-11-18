import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  Globe,
  KeyRound,
  Link2,
  Lock,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
  Tv,
  Unlock,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { M3uSource, TvChannel } from '../types/qala';

interface QalaAdminModuleProps {
  onPlayChannel?: (channel: TvChannel) => void;
  onNotify?: (msg: string) => void;
  onChannelsUpdated?: () => void;
}

export function QalaAdminModule({
  onPlayChannel,
  onNotify,
  onChannelsUpdated,
}: QalaAdminModuleProps) {
  // PIN Security Gate
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isDefaultPin, setIsDefaultPin] = useState(true);

  const [currentPinForChange, setCurrentPinForChange] = useState('');
  const [newPinInput, setNewPinInput] = useState('');

  const [channels, setChannels] = useState<TvChannel[]>([]);
  const [sources, setSources] = useState<M3uSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // M3U form state
  const [m3uName, setM3uName] = useState('');
  const [m3uUrl, setM3uUrl] = useState('');
  const [m3uRaw, setM3uRaw] = useState('');
  const [showRawM3u, setShowRawM3u] = useState(false);

  // Manual channel form state
  const [chName, setChName] = useState('');
  const [chCategory, setChCategory] = useState('Национальный');
  const [chUrl, setChUrl] = useState('');
  const [chUrl720, setChUrl720] = useState('');
  const [chUrl1080, setChUrl1080] = useState('');
  const [chRegional, setChRegional] = useState(false);

  useEffect(() => {
    fetch('/api/admin/pin/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { isDefault?: boolean } | null) => {
        if (d && typeof d.isDefault === 'boolean') {
          setIsDefaultPin(d.isDefault);
        }
      })
      .catch(() => {});
  }, []);

  const verifyPin = async (pinToCheck: string) => {
    setPinError(null);
    const res = await fetch('/api/admin/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinToCheck }),
    });
    if (res.ok) {
      setUnlocked(true);
      setPinInput('');
      onNotify?.('Доступ в Админку QALA открыт');
    } else {
      setPinError('Неверный PIN-код');
      setPinInput('');
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/pin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin: currentPinForChange, newPin: newPinInput }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      onNotify?.(data.error || 'Не удалось сменить PIN');
      return;
    }
    setCurrentPinForChange('');
    setNewPinInput('');
    setIsDefaultPin(false);
    onNotify?.('PIN-код Админки успешно обновлён');
  };

  const loadAdminData = useCallback(async () => {
    if (!unlocked) return;
    setLoading(true);
    try {
      const [chRes, m3uRes] = await Promise.all([
        fetch('/api/tv/channels?all=1'),
        fetch('/api/tv/m3u'),
      ]);
      if (chRes.ok) {
        const d = (await chRes.json()) as { channels: TvChannel[] };
        setChannels(d.channels || []);
      }
      if (m3uRes.ok) {
        const m = (await m3uRes.json()) as { sources: M3uSource[] };
        setSources(m.sources || []);
      }
    } finally {
      setLoading(false);
    }
  }, [unlocked]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleImportM3u = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!m3uUrl.trim() && !m3uRaw.trim()) {
      onNotify?.('Укажите ссылку на M3U или вставьте содержимое плейлиста');
      return;
    }
    setBusyAction('import-m3u');
    try {
      const res = await fetch('/api/tv/m3u/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: m3uName.trim() || undefined,
          url: m3uUrl.trim() || undefined,
          rawContent: m3uRaw.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        importedCount?: number;
        error?: string;
      };
      if (!res.ok) {
        onNotify?.(data.error || 'Ошибка импорта M3U');
        return;
      }
      setM3uName('');
      setM3uUrl('');
      setM3uRaw('');
      await loadAdminData();
      onChannelsUpdated?.();
      onNotify?.(`Добавлено каналов из M3U: ${data.importedCount ?? 0}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportKzFree = async () => {
    setBusyAction('import-kz');
    try {
      const res = await fetch('/api/tv/m3u/import-kz-free', { method: 'POST' });
      const data = (await res.json()) as {
        ok?: boolean;
        importedCount?: number;
        isLive?: boolean;
        error?: string;
      };
      if (!res.ok) {
        onNotify?.(data.error || 'Не удалось собрать каналы KZ');
        return;
      }
      await loadAdminData();
      onChannelsUpdated?.();
      onNotify?.(`Собрано бесплатных каналов Казахстана: ${data.importedCount ?? 0}`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncSource = async (src: M3uSource) => {
    if (!src.url) return;
    setBusyAction(`sync-${src.id}`);
    try {
      const res = await fetch('/api/tv/m3u/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: src.name, url: src.url }),
      });
      const data = (await res.json()) as { importedCount?: number; error?: string };
      if (!res.ok) {
        onNotify?.(data.error || 'Ошибка обновления плейлиста');
        return;
      }
      await loadAdminData();
      onChannelsUpdated?.();
      onNotify?.(`Плейлист «${src.name}» обновлён (${data.importedCount ?? 0} каналов)`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteSource = async (src: M3uSource) => {
    setBusyAction(`del-src-${src.id}`);
    try {
      await fetch(`/api/tv/m3u/${encodeURIComponent(src.id)}`, { method: 'DELETE' });
      await loadAdminData();
      onChannelsUpdated?.();
      onNotify?.(`Плейлист «${src.name}» и его каналы удалены`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chName.trim() || !chUrl.trim()) {
      onNotify?.('Введите название канала и URL потока');
      return;
    }
    setBusyAction('add-channel');
    try {
      const qualityStreams: Record<string, string> = {};
      if (chUrl720.trim()) qualityStreams['720p'] = chUrl720.trim();
      if (chUrl1080.trim()) qualityStreams['1080p'] = chUrl1080.trim();

      const res = await fetch('/api/tv/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: chName.trim(),
          category: chCategory.trim() || 'ТВ',
          streamUrl: chUrl.trim(),
          qualityStreams: Object.keys(qualityStreams).length > 0 ? qualityStreams : undefined,
          isRegional: chRegional,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify?.(data.error || 'Не удалось добавить канал');
        return;
      }
      setChName('');
      setChUrl('');
      setChUrl720('');
      setChUrl1080('');
      setChRegional(false);
      await loadAdminData();
      onChannelsUpdated?.();
      onNotify?.('Канал добавлен в базу Qala TV');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleChannelActive = async (ch: TvChannel) => {
    await fetch(`/api/tv/channels/${encodeURIComponent(ch.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: ch.isActive === false }),
    });
    await loadAdminData();
    onChannelsUpdated?.();
  };

  const handleDeleteChannel = async (ch: TvChannel) => {
    await fetch(`/api/tv/channels/${encodeURIComponent(ch.id)}`, {
      method: 'DELETE',
    });
    await loadAdminData();
    onChannelsUpdated?.();
    onNotify?.(`Канал «${ch.name}» удалён`);
  };

  const filteredChannels = channels.filter((ch) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      ch.name.toLowerCase().includes(q) ||
      ch.category.toLowerCase().includes(q) ||
      ch.streamUrl.toLowerCase().includes(q)
    );
  });

  if (!unlocked) {
    return (
      <div className="liquid-glass mx-auto max-w-md rounded-3xl p-6 sm:p-8 space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-extrabold text-slate-900">
            Админка защищена PIN-кодом
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Введите PIN для управления M3U-плейлистами, каналами и настройками сервера.
            {isDefaultPin && (
              <span className="block mt-1 font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                Код по умолчанию: 1234
              </span>
            )}
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            verifyPin(pinInput);
          }}
          className="space-y-3"
        >
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            className="w-full rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.4em] text-slate-900 focus:outline-none"
          />
          {pinError && <div className="text-xs font-semibold text-rose-600">{pinError}</div>}

          {/* Touch Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Очистить', '0', 'Войти'].map(
              (keyLabel) => (
                <button
                  key={keyLabel}
                  type="button"
                  onClick={() => {
                    if (keyLabel === 'Очистить') {
                      setPinInput('');
                      setPinError(null);
                    } else if (keyLabel === 'Войти') {
                      verifyPin(pinInput);
                    } else if (pinInput.length < 6) {
                      const next = pinInput + keyLabel;
                      setPinInput(next);
                    }
                  }}
                  className={`min-h-[46px] rounded-xl font-display text-sm font-bold transition-colors ${
                    keyLabel === 'Войти'
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'liquid-glass-subtle text-slate-900'
                  }`}
                >
                  {keyLabel}
                </button>
              )
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <span>Панель администратора IPTV · SQLite + M3U/M3U8</span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-900">
              Админка <span className="text-indigo-600">Qala TV</span>
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleImportKzFree}
              disabled={busyAction === 'import-kz'}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
            >
              <Globe className="h-3.5 w-3.5" />
              {busyAction === 'import-kz'
                ? 'Сбор каналов KZ…'
                : 'Собрать бесплатные каналы KZ'}
            </button>

            <a
              href="/api/tv/export.m3u"
              download="qala-kz-tv.m3u"
              className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-xs hover:bg-white whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              Скачать .M3U
            </a>

            <a
              href="/api/download-source"
              download="qala-project-source.zip"
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 whitespace-nowrap"
            >
              <FileArchive className="h-3.5 w-3.5" />
              Весь проект (.ZIP)
            </a>

            <button
              type="button"
              onClick={() => setUnlocked(false)}
              className="flex items-center gap-1.5 rounded-xl bg-white/75 px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-white"
              title="Заблокировать Админку"
            >
              <Unlock className="h-3.5 w-3.5 text-amber-600" />
              Блокировка
            </button>
          </div>
        </div>
      </div>

      {/* M3U Link Publisher + Manual Channel Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* M3U Link Form */}
        <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-indigo-600" />
              <h3 className="font-display text-base font-bold text-slate-900">
                Выставить ссылку M3U / M3U8
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setShowRawM3u((prev) => !prev)}
              className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
            >
              {showRawM3u ? 'Указать URL' : 'Вставить текст #EXTM3U'}
            </button>
          </div>

          <form onSubmit={handleImportM3u} className="space-y-3">
            <input
              type="text"
              value={m3uName}
              onChange={(e) => setM3uName(e.target.value)}
              placeholder="Название плейлиста (например, Казахстан ТВ)"
              className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
            />

            {showRawM3u ? (
              <textarea
                rows={4}
                value={m3uRaw}
                onChange={(e) => setM3uRaw(e.target.value)}
                placeholder={'#EXTM3U\n#EXTINF:-1 group-title="Национальный",Qazaqstan\nhttps://.../playlist.m3u8'}
                className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 font-mono text-[11px] text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
              />
            ) : (
              <input
                type="url"
                value={m3uUrl}
                onChange={(e) => setM3uUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u"
                className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={busyAction === 'import-m3u'}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" />
                {busyAction === 'import-m3u' ? 'Загрузка M3U…' : 'Загрузить и сохранить M3U'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setM3uName('Казахстан iptv-org');
                  setM3uUrl('https://iptv-org.github.io/iptv/countries/kz.m3u');
                  setShowRawM3u(false);
                }}
                className="rounded-xl bg-white/70 px-3 py-2 text-[11px] font-semibold text-slate-700 hover:bg-white"
              >
                Подставить KZ M3U
              </button>
            </div>
          </form>

          {/* Saved M3U Sources */}
          <div className="space-y-2 pt-2 border-t border-slate-900/10 dark:border-white/10">
            <div className="text-xs font-bold text-slate-700">
              Сохранённые M3U ссылки ({sources.length})
            </div>
            {sources.length === 0 ? (
              <div className="rounded-xl bg-white/50 p-3 text-xs text-slate-500">
                Пока нет добавленных внешних M3U ссылок — нажмите «Собрать бесплатные каналы KZ»
                или добавьте свою ссылку выше.
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {sources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 truncate">{src.name}</div>
                      <div className="truncate font-mono text-[10px] text-slate-500">
                        {src.url || 'Вставлено вручную'} · {src.channelCount} кан.
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {src.url && (
                        <button
                          type="button"
                          onClick={() => handleSyncSource(src)}
                          disabled={busyAction === `sync-${src.id}`}
                          title="Пересинхронизировать M3U"
                          className="rounded-lg bg-white p-1.5 text-slate-700 hover:text-indigo-600"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              busyAction === `sync-${src.id}` ? 'animate-spin' : ''
                            }`}
                          />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteSource(src)}
                        title="Удалить плейлист"
                        className="rounded-lg bg-white p-1.5 text-slate-600 hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Manual Channel Form + PIN Change */}
        <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-rose-600" />
            <h3 className="font-display text-base font-bold text-slate-900">
              Добавить канал вручную
            </h3>
          </div>

          <form onSubmit={handleAddChannel} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                placeholder="Название (например, Хабар 24)"
                className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
              />
              <input
                type="text"
                value={chCategory}
                onChange={(e) => setChCategory(e.target.value)}
                placeholder="Категория (Новости, Спорт…)"
                className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
              />
            </div>

            <input
              type="url"
              value={chUrl}
              onChange={(e) => setChUrl(e.target.value)}
              placeholder="Основной поток: https://.../playlist.m3u8 или .mp4"
              className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="url"
                value={chUrl720}
                onChange={(e) => setChUrl720(e.target.value)}
                placeholder="Поток 720p (необязательно)"
                className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
              />
              <input
                type="url"
                value={chUrl1080}
                onChange={(e) => setChUrl1080(e.target.value)}
                placeholder="Поток 1080p (необязательно)"
                className="w-full rounded-xl border border-white/80 bg-white/70 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={chRegional}
                onChange={(e) => setChRegional(e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-600"
              />
              Региональный канал Казахстана
            </label>

            <button
              type="submit"
              disabled={busyAction === 'add-channel'}
              className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-600 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить канал в Qala TV
            </button>
          </form>

          {/* Change Admin PIN */}
          <form
            onSubmit={handleChangePin}
            className="rounded-2xl bg-white/65 p-3.5 space-y-2.5 border border-white/80 dark:border-white/10"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <KeyRound className="h-4 w-4 text-indigo-600" />
              Сменить PIN-код Админки (4–6 цифр)
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={currentPinForChange}
                onChange={(e) => setCurrentPinForChange(e.target.value.replace(/\D/g, ''))}
                placeholder="Текущий PIN"
                className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="Новый PIN (4–6 цифр)"
                className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Обновить
              </button>
            </div>
          </form>

          {/* Python Backend Info Card */}
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 space-y-2 dark:border-emerald-500/20 dark:bg-emerald-950/35">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Terminal className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              Python-сервер в комплекте (<code>python_app/server.py</code>)
            </div>
            <pre className="overflow-x-auto rounded-xl bg-slate-900 px-3 py-2 font-mono text-[11px] text-emerald-300">
              npm run build && python3 python_app/server.py
            </pre>
          </div>
        </div>
      </div>

      {/* All Channels Table */}
      <div className="liquid-glass rounded-3xl p-5 sm:p-7 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h3 className="font-display text-base font-bold text-slate-900">
              База каналов ({channels.length})
            </h3>
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по названию, категории или URL…"
            className="w-full sm:w-72 rounded-xl border border-white/80 bg-white/70 px-3.5 py-2 text-xs font-medium text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">Загрузка базы каналов…</div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {filteredChannels.map((ch) => (
              <div
                key={ch.id}
                className={`flex items-center justify-between gap-3 rounded-2xl p-3 transition-colors ${
                  ch.isActive === false ? 'bg-white/40 opacity-60' : 'bg-white/75'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[10px] font-bold text-white"
                    style={{ backgroundColor: ch.accentColor }}
                  >
                    {ch.logoUrl ? (
                      <img
                        src={ch.logoUrl}
                        alt={ch.name}
                        className="h-full w-full bg-white/90 object-contain p-1"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      'TV'
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-display text-xs font-bold text-slate-900">
                      {ch.name}
                    </div>
                    <div className="truncate text-[11px] text-slate-600">
                      {ch.category} {ch.isRegional ? '· Регион' : ''}
                    </div>
                    <div className="truncate font-mono text-[10px] text-slate-400">
                      {ch.streamUrl}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onPlayChannel && (
                    <button
                      type="button"
                      onClick={() => onPlayChannel(ch)}
                      title="Смотреть в плеере"
                      className="rounded-lg bg-rose-500 p-2 text-white hover:bg-rose-600"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleChannelActive(ch)}
                    title={ch.isActive === false ? 'Включить канал' : 'Скрыть канал'}
                    className="rounded-lg bg-white p-2 text-slate-700 hover:text-slate-950"
                  >
                    {ch.isActive === false ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteChannel(ch)}
                    title="Удалить канал"
                    className="rounded-lg bg-white p-2 text-slate-600 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
