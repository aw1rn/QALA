import {
  Activity,
  Building2,
  Bus,
  Calendar,
  Car,
  CloudSun,
  Coins,
  Compass,
  Film,
  HardDrive,
  LayoutGrid,
  Music,
  Package,
  Scale,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tv,
  User,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { QalaSection } from '../types/qala';

interface ServiceItem {
  id: QalaSection;
  label: string;
  sub: string;
  icon: typeof LayoutGrid;
  tint: string;
}

const SERVICE_GROUPS: Array<{ group: string; items: ServiceItem[] }> = [
  {
    group: 'Город и передвижение',
    items: [
      { id: 'dashboard', label: 'Главная', sub: 'Сводка дня', icon: LayoutGrid, tint: 'text-sky-600' },
      { id: 'map', label: 'Карта QALA', sub: 'Слои, парковки, знаки', icon: Compass, tint: 'text-blue-600' },
      { id: 'taxi', label: 'Qala Taxi', sub: 'Тарифы и подача A→B', icon: Car, tint: 'text-amber-600' },
      { id: 'bus', label: 'Автобусы', sub: 'Маршруты и остановки', icon: Bus, tint: 'text-sky-600' },
      { id: 'traffic', label: 'Пробки и 7д', sub: 'Сергек и погода', icon: CloudSun, tint: 'text-rose-600' },
      { id: 'delivery', label: 'Delivery', sub: 'Оптимальный маршрут', icon: Package, tint: 'text-emerald-700' },
      { id: 'uy', label: 'Qala Үй', sub: 'Квартиры на карте', icon: Building2, tint: 'text-emerald-600' },
    ],
  },
  {
    group: 'Еда, покупки и финансы',
    items: [
      { id: 'food', label: 'Qala Food', sub: 'Доставка по Астане', icon: Utensils, tint: 'text-orange-600' },
      { id: 'market', label: 'Market', sub: 'Объявления рядом', icon: ShoppingBag, tint: 'text-orange-500' },
      { id: 'wallet', label: 'Wallet', sub: 'Кошелёк и планы', icon: Wallet, tint: 'text-amber-700' },
      { id: 'info', label: 'Валюты · eGov', sub: 'Курсы и памятки', icon: Coins, tint: 'text-emerald-600' },
    ],
  },
  {
    group: 'ТВ, кино и досуг',
    items: [
      { id: 'tv', label: 'Qala TV', sub: 'Казахстанское ТВ', icon: Tv, tint: 'text-rose-600' },
      { id: 'qino', label: 'Qino', sub: 'Фильмы и афиша', icon: Film, tint: 'text-pink-600' },
      { id: 'music', label: 'Music · Radio', sub: 'Эфир Астаны', icon: Music, tint: 'text-indigo-600' },
      { id: 'sport', label: 'Sport', sub: 'Бег и велосипед', icon: Activity, tint: 'text-emerald-600' },
    ],
  },
  {
    group: 'Помощники и система',
    items: [
      { id: 'ai', label: 'Qala AI', sub: 'Голосовой ассистент', icon: Sparkles, tint: 'text-violet-600' },
      { id: 'sheshim', label: 'Шешім', sub: 'Сравнение вариантов', icon: Scale, tint: 'text-slate-700 dark:text-slate-300' },
      { id: 'history', label: 'История', sub: 'Журнал действий', icon: Calendar, tint: 'text-slate-600 dark:text-slate-300' },
      { id: 'offline', label: 'Офлайн', sub: 'Кэш города', icon: HardDrive, tint: 'text-sky-600' },
      { id: 'id', label: 'Qala ID', sub: 'Личный профиль', icon: User, tint: 'text-blue-700' },
      { id: 'admin', label: 'Админка', sub: 'PIN · M3U · каналы', icon: ShieldCheck, tint: 'text-indigo-600' },
    ],
  },
];

interface MobileServiceSheetProps {
  open: boolean;
  activeSection: QalaSection;
  onSelect: (section: QalaSection) => void;
  onClose: () => void;
}

export function MobileServiceSheet({
  open,
  activeSection,
  onSelect,
  onClose,
}: MobileServiceSheetProps) {
  const [query, setQuery] = useState('');

  if (!open) return null;

  const q = query.trim().toLowerCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Все сервисы QALA"
    >
      <div
        className="liquid-glass w-full max-w-[460px] rounded-t-3xl p-4 pb-6 shadow-2xl max-h-[82vh] flex flex-col gap-3.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-400/50" />

        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
              Все сервисы QALA
            </h3>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Быстрый доступ одной рукой ко всем 20 модулям
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            aria-label="Закрыть меню сервисов"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск сервиса (еда, такси, eGov, ТВ…)"
            className="w-full rounded-xl border border-white/80 bg-white/80 py-2.5 pr-3.5 pl-10 text-xs font-medium text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-100"
          />
        </div>

        <div className="overflow-y-auto space-y-4 pr-1">
          {SERVICE_GROUPS.map((grp) => {
            const visible = grp.items.filter(
              (item) =>
                !q ||
                item.label.toLowerCase().includes(q) ||
                item.sub.toLowerCase().includes(q)
            );
            if (visible.length === 0) return null;
            return (
              <div key={grp.group} className="space-y-2">
                <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {grp.group}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {visible.map((item) => {
                    const Icon = item.icon;
                    const active = activeSection === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onSelect(item.id);
                          onClose();
                        }}
                        className={`flex min-h-[54px] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${
                          active
                            ? 'bg-slate-900 text-white shadow-md dark:bg-orange-500 dark:text-slate-950'
                            : 'liquid-glass-subtle'
                        }`}
                      >
                        <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-current' : item.tint}`} />
                        <div className="min-w-0">
                          <div className="truncate font-display text-xs font-bold">
                            {item.label}
                          </div>
                          <div className="truncate text-[10px] opacity-75">{item.sub}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
