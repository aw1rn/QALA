import {
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MarketListing } from '../types/qala';
import { API_BASE } from '../apiBase';

interface QalaMarketModuleProps {
  items: MarketListing[];
  onRefresh: () => Promise<void>;
  onBuyOrReserve: (item: MarketListing) => Promise<void>;
  onShowOnMap: (address: string) => void;
  onNotify: (msg: string) => void;
}

const CATEGORIES = [
  'Все',
  'Электроника',
  'Одежда',
  'Учебники',
  'Для дома',
  'Авто',
  'Даром',
  'Другое',
] as const;

export function QalaMarketModule({
  items,
  onRefresh,
  onBuyOrReserve,
  onShowOnMap,
  onNotify,
}: QalaMarketModuleProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'post' | 'mine'>('all');
  const [category, setCategory] = useState<string>('Все');
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MarketListing | null>(null);

  // Bargain / Seller Chat state per listing
  const [offerInput, setOfferInput] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<
    Record<string, Array<{ from: 'me' | 'seller'; text: string }>>
  >({});

  // Create form state
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [isFree, setIsFree] = useState(false);
  const [newCategory, setNewCategory] = useState<MarketListing['category']>('Электроника');
  const [address, setAddress] = useState('Нуржол желек жолы, 14');
  const [description, setDescription] = useState('');

  const myCount = useMemo(() => items.filter((i) => i.isMine).length, [items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTab === 'mine' && !item.isMine) return false;
      if (category === 'Даром' && !item.isFree) return false;
      if (category !== 'Все' && category !== 'Даром' && item.category !== category) {
        return false;
      }
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q) &&
        !item.address.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [activeTab, category, items, query]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch(`${API_BASE}/api/market`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        price: isFree ? 0 : Number.parseInt(price, 10) || 0,
        isFree,
        category: newCategory,
        address: address.trim(),
        description: description.trim(),
      }),
    });
    setTitle('');
    setPrice('');
    setIsFree(false);
    setDescription('');
    setActiveTab('mine');
    await onRefresh();
    onNotify('Объявление опубликовано в Qala Market');
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API_BASE}/api/market/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setSelectedItem(null);
    await onRefresh();
    onNotify('Объявление удалено');
  };

  const pushChat = (itemId: string, myText: string, sellerReply: string) => {
    setChatHistory((prev) => ({
      ...prev,
      [itemId]: [
        ...(prev[itemId] || []),
        { from: 'me', text: myText },
        { from: 'seller', text: sellerReply },
      ],
    }));
  };

  const handleOfferPrice = (item: MarketListing) => {
    const offer = Number.parseInt(offerInput, 10);
    if (!offer || offer <= 0) return;
    const minAccepted = Math.round(item.price * 0.85);
    const reply =
      offer >= item.price
        ? `Отлично, забирайте по полной цене (${item.price.toLocaleString('ru-RU')} ₸). Жду на ${item.address}.`
        : offer >= minAccepted
        ? `Договорились за ${offer.toLocaleString('ru-RU')} ₸! Можете нажать «Купить» или позвонить.`
        : `Минимум могу уступить до ${minAccepted.toLocaleString('ru-RU')} ₸ — состояние отличное.`;
    pushChat(
      item.id,
      `Предлагаю цену: ${offer.toLocaleString('ru-RU')} ₸`,
      reply
    );
    setOfferInput('');
    onNotify(`Предложение ${offer.toLocaleString('ru-RU')} ₸ отправлено продавцу`);
  };

  const handleSendChat = (e: React.FormEvent, item: MarketListing) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    const msg = chatMessage.trim();
    const reply = msg.toLowerCase().includes('наличи')
      ? `Да, товар в наличии в Астане (${item.address}).`
      : msg.toLowerCase().includes('достав')
      ? 'Могу отправить через Qala Delivery или передать лично сегодня вечером.'
      : `Спасибо за сообщение! По «${item.title}» можно договориться о встрече у ${item.address}.`;
    pushChat(item.id, msg, reply);
    setChatMessage('');
  };

  return (
    <div className="space-y-5">
      <div className="liquid-glass rounded-3xl p-5 sm:p-7">
        {/* Header & Top Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-slate-100">
            Qala <span className="text-orange-600 dark:text-orange-400">Market</span>
          </h2>

          <div className="flex items-center gap-1 rounded-xl border border-white/70 bg-white/60 p-1 dark:border-white/15 dark:bg-slate-900/70">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Объявления
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('post')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'post'
                  ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Подать
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mine')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                activeTab === 'mine'
                  ? 'bg-slate-900 text-white dark:bg-orange-500 dark:text-slate-950'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              Мои · {myCount}
            </button>
          </div>
        </div>

        {/* Post Listing Tab */}
        {activeTab === 'post' ? (
          <form onSubmit={handlePublish} className="mt-6 max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Название товара или услуги
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Ноутбук MacBook Air M2"
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Категория
                </label>
                <select
                  value={newCategory}
                  onChange={(e) =>
                    setNewCategory(e.target.value as MarketListing['category'])
                  }
                  className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                >
                  {CATEGORIES.filter((c) => c !== 'Все').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Цена, ₸
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="number"
                    disabled={isFree}
                    value={isFree ? '0' : price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="5000"
                    className="w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-sm text-slate-900 disabled:opacity-50 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 whitespace-nowrap dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isFree}
                      onChange={(e) => setIsFree(e.target.checked)}
                      className="accent-orange-500"
                    />
                    Даром
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Адрес в Астане
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Описание
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Состояние, детали, условия самовывоза…"
                className="mt-1.5 w-full rounded-xl border border-white/80 bg-white/75 px-4 py-2.5 text-sm text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              Опубликовать объявление
            </button>
          </form>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Search & Categories */}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск объявлений в Астане…"
                className="w-full rounded-xl border border-white/80 bg-white/70 py-2.5 pr-4 pl-10 text-sm text-slate-900 placeholder-slate-500 focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100 dark:placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    category === cat
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-white/65 text-slate-700 hover:bg-white dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Listings Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSelectedItem(item);
                    setOfferInput(
                      !item.isFree && item.price > 0
                        ? String(Math.round(item.price * 0.9))
                        : ''
                    );
                  }}
                  className="liquid-glass-subtle flex items-start gap-3.5 rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/80 text-slate-700 shadow-sm dark:bg-slate-800 dark:text-orange-400">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                      {item.isFree ? 'Даром' : `${item.price.toLocaleString('ru-RU')} ₸`}
                      <span className="mx-1.5 font-sans font-normal text-slate-400">·</span>
                      <span className="font-sans font-normal text-slate-600 dark:text-slate-400">
                        {item.category}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                      {item.distanceMeters} м · {item.createdAt}
                      {item.status === 'reserved' ? ' · Забронировано' : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Объявления сохраняются в локальной базе данных SQLite на этом устройстве.
            </p>
          </div>
        )}
      </div>

      {/* Item Detail Modal with Bargain & Seller Chat */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {selectedItem.category} · {selectedItem.address}
                </div>
                <h3 className="mt-1 font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  {selectedItem.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-lg bg-white/60 p-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="font-mono text-2xl font-extrabold text-slate-900 tabular-nums dark:text-slate-100">
              {selectedItem.isFree
                ? 'Даром'
                : `${selectedItem.price.toLocaleString('ru-RU')} ₸`}
            </div>

            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {selectedItem.description}
            </p>

            <div className="text-xs text-slate-600 dark:text-slate-400">
              Продавец:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {selectedItem.sellerName}
              </span>{' '}
              · <span className="font-mono">{selectedItem.phone}</span>
            </div>

            {/* Bargain Offer + Seller Quick Chat */}
            {!selectedItem.isFree && selectedItem.price > 0 && (
              <div className="rounded-2xl bg-white/70 p-3 space-y-2 dark:bg-slate-900/65">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  <Tag className="h-3.5 w-3.5 text-orange-500" />
                  Предложить свою цену (Торг)
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    value={offerInput}
                    onChange={(e) => setOfferInput(e.target.value)}
                    placeholder="Ваша цена, ₸"
                    className="min-w-0 flex-1 rounded-xl border border-white/80 bg-white px-3 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleOfferPrice(selectedItem)}
                    className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600"
                  >
                    Предложить
                  </button>
                </div>
              </div>
            )}

            {/* Seller Chat Thread */}
            <div className="rounded-2xl bg-white/70 p-3 space-y-2 dark:bg-slate-900/65">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                <MessageSquare className="h-3.5 w-3.5 text-sky-600" />
                Чат с продавцом
              </div>

              {(chatHistory[selectedItem.id] || []).length > 0 && (
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1 text-xs">
                  {(chatHistory[selectedItem.id] || []).map((m, idx) => (
                    <div
                      key={idx}
                      className={`rounded-xl px-2.5 py-1.5 ${
                        m.from === 'me'
                          ? 'bg-sky-600 text-white ml-6'
                          : 'bg-white text-slate-800 mr-6 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => handleSendChat(e, selectedItem)}
                className="flex gap-1.5"
              >
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  placeholder="Написать продавцу (наличие, доставка)…"
                  className="min-w-0 flex-1 rounded-xl border border-white/80 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-3 py-1.5 text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950"
                  aria-label="Отправить сообщение"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onShowOnMap(selectedItem.address);
                  setSelectedItem(null);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/80 py-2.5 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
              >
                <MapPin className="h-3.5 w-3.5" />
                На карте
              </button>
              <a
                href={`tel:${selectedItem.phone}`}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-white/80 py-2.5 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
              >
                <Phone className="h-3.5 w-3.5" />
                Позвонить
              </a>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={selectedItem.status === 'reserved'}
                onClick={async () => {
                  await onBuyOrReserve(selectedItem);
                  setSelectedItem(null);
                }}
                className="flex-1 rounded-xl bg-emerald-800 py-2.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
              >
                {selectedItem.status === 'reserved'
                  ? 'Уже забронировано'
                  : selectedItem.isFree
                  ? 'Забрать даром'
                  : 'Купить и записать в расходы'}
              </button>

              {selectedItem.isMine && (
                <button
                  type="button"
                  onClick={() => handleDelete(selectedItem.id)}
                  className="flex items-center justify-center rounded-xl bg-rose-100 px-3.5 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-900/50 dark:text-rose-200"
                  aria-label="Удалить объявление"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
