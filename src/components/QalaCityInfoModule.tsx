import {
  ArrowRightLeft,
  BellRing,
  Calculator,
  CalendarDays,
  Check,
  Coins,
  Compass,
  Copy,
  FileCheck2,
  Flame,
  Languages,
  MapPin,
  Megaphone,
  MoonStar,
  Percent,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ASTANA_CENTER,
  ASTANA_WEEKEND_DESTINATIONS,
  EGOV_GUIDES,
  KZ_HOLIDAYS,
  PHRASEBOOK_ENTRIES,
} from '../data/astanaData';
import type {
  CurrentGeoState,
  ExchangeRatesData,
  IkomekReport,
  PrayerTimesData,
  ReminderItem,
  UtilityReading,
  WalletTransaction,
} from '../types/qala';
import { API_BASE } from '../apiBase';

type CurrencyCode = keyof ExchangeRatesData['rates'];
const CURRENCIES: Array<{ code: CurrencyCode; label: string }> = [
  { code: 'USD', label: 'Доллар США' },
  { code: 'EUR', label: 'Евро' },
  { code: 'RUB', label: 'Российский рубль' },
  { code: 'CNY', label: 'Китайский юань' },
  { code: 'GBP', label: 'Фунт стерлингов' },
  { code: 'TRY', label: 'Турецкая лира' },
];

const PDD_VIOLATIONS = [
  { id: 'speed-10', label: 'Превышение скорости 10–20 км/ч (ч.1 ст.592)', mrpCount: 5 },
  { id: 'speed-20', label: 'Превышение скорости 20–40 км/ч (ч.2 ст.592)', mrpCount: 10 },
  { id: 'speed-40', label: 'Превышение скорости 40+ км/ч (ч.3 ст.592)', mrpCount: 20 },
  { id: 'stop-sign', label: 'Остановка / стоянка под знаком 3.27 (ст.597)', mrpCount: 5 },
  { id: 'red-light', label: 'Проезд на запрещающий сигнал (ст.599)', mrpCount: 10 },
  { id: 'seatbelt', label: 'Непристёгнутый ремень безопасности (ст.593)', mrpCount: 5 },
  { id: 'phone', label: 'Телефон за рулём без гарнитуры (ст.591)', mrpCount: 5 },
] as const;

export function QalaCityInfoModule({
  currentLocation,
  onOpenRoute,
  onNotify,
  onLogExpense,
}: {
  currentLocation?: CurrentGeoState;
  onOpenRoute?: (name: string, address: string, lat: number, lng: number) => void;
  onNotify: (msg: string) => void;
  onLogExpense?: (
    title: string,
    category: WalletTransaction['category'],
    amount: number
  ) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<'finance' | 'ikomek' | 'guide'>('finance');

  const [ratesData, setRatesData] = useState<ExchangeRatesData>({
    base: 'KZT',
    updatedAt: '',
    isLive: false,
    rates: { USD: 495.5, EUR: 528.4, RUB: 5.05, CNY: 68.7, GBP: 628.2, TRY: 14.35 },
  });
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('USD');
  const [amountInput, setAmountInput] = useState('100');
  const [reverseToKzt, setReverseToKzt] = useState(true);

  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [remTitle, setRemTitle] = useState('');
  const [remTime, setRemTime] = useState('Сегодня · 19:00');
  const [remCat, setRemCat] = useState<ReminderItem['category']>('Город');

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [activeGuideId, setActiveGuideId] = useState<string>(EGOV_GUIDES[0].id);

  // PDD Fine Calculator state
  const [mrpValue, setMrpValue] = useState('4128');
  const [selectedViolationId, setSelectedViolationId] = useState<string>(PDD_VIOLATIONS[0].id);
  const [discount50, setDiscount50] = useState(true);

  // Astana Utilities Calculator state
  const [utilPeriod, setUtilPeriod] = useState('Текущий месяц');
  const [coldWater, setColdWater] = useState('8');
  const [hotWater, setHotWater] = useState('5');
  const [electricityKwh, setElectricityKwh] = useState('210');
  const [heatingArea, setHeatingArea] = useState('54');
  const [utilities, setUtilities] = useState<UtilityReading[]>([]);

  // KZ Salary / IP 910 Tax Calculator
  const [grossSalary, setGrossSalary] = useState('450000');
  const [applyMrpDeduction, setApplyMrpDeduction] = useState(true);
  const [ipRevenue, setIpRevenue] = useState('1500000');

  // Installment 0% vs Credit Comparison
  const [itemPrice, setItemPrice] = useState('420000');
  const [monthsCount, setMonthsCount] = useState('12');
  const [cashDiscountPct, setCashDiscountPct] = useState('10');
  const [creditApr, setCreditApr] = useState('22');

  // iKomek 109 Reports
  const [reports, setReports] = useState<IkomekReport[]>([]);
  const [repCat, setRepCat] = useState<IkomekReport['category']>('Дороги');
  const [repTitle, setRepTitle] = useState('');
  const [repAddress, setRepAddress] = useState(
    currentLocation?.address || 'Нұржол желек жолы, 14'
  );

  // Prayer times & Phrasebook
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimesData | null>(null);
  const [phraseCat, setPhraseCat] = useState<string>('Все');

  useEffect(() => {
    if (currentLocation?.address && !repTitle) {
      setRepAddress(currentLocation.address);
    }
  }, [currentLocation?.address, repTitle]);

  const loadAll = useCallback(async () => {
    const [rRes, remRes, uRes, ikRes, prRes] = await Promise.all([
      fetch(`${API_BASE}/api/rates`),
      fetch(`${API_BASE}/api/reminders`),
      fetch(`${API_BASE}/api/utilities`),
      fetch(`${API_BASE}/api/ikomek`),
      fetch(`${API_BASE}/api/prayer-times`),
    ]);
    if (rRes.ok) {
      setRatesData((await rRes.json()) as ExchangeRatesData);
    }
    if (remRes.ok) {
      const d = (await remRes.json()) as { reminders: ReminderItem[] };
      setReminders(d.reminders || []);
    }
    if (uRes.ok) {
      const u = (await uRes.json()) as { readings: UtilityReading[] };
      setUtilities(u.readings || []);
    }
    if (ikRes.ok) {
      const ik = (await ikRes.json()) as { reports: IkomekReport[] };
      setReports(ik.reports || []);
    }
    if (prRes.ok) {
      setPrayerTimes((await prRes.json()) as PrayerTimesData);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const numericAmount = Number.parseFloat(amountInput) || 0;
  const currentRate = ratesData.rates[selectedCurrency] || 1;
  const convertedResult = reverseToKzt
    ? numericAmount * currentRate
    : numericAmount / currentRate;

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim()) return;
    const res = await fetch(`${API_BASE}/api/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: remTitle.trim(), remindAt: remTime, category: remCat }),
    });
    if (res.ok) {
      setRemTitle('');
      await loadAll();
      onNotify('Напоминание добавлено');
    }
  };

  const toggleReminder = async (item: ReminderItem) => {
    await fetch(`${API_BASE}/api/reminders/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: !item.done }),
    });
    await loadAll();
  };

  const deleteReminder = async (id: string) => {
    await fetch(`${API_BASE}/api/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadAll();
  };

  const activeGuide = EGOV_GUIDES.find((g) => g.id === activeGuideId) || EGOV_GUIDES[0];

  const activeViolation =
    PDD_VIOLATIONS.find((v) => v.id === selectedViolationId) || PDD_VIOLATIONS[0];
  const mrpNum = Math.max(1000, Number.parseInt(mrpValue, 10) || 4128);
  const fullFineKzt = activeViolation.mrpCount * mrpNum;
  const finalFineKzt = discount50 ? Math.round(fullFineKzt * 0.5) : fullFineKzt;

  const cwVal = Math.max(0, Number.parseFloat(coldWater) || 0);
  const hwVal = Math.max(0, Number.parseFloat(hotWater) || 0);
  const elVal = Math.max(0, Number.parseFloat(electricityKwh) || 0);
  const heatVal = Math.max(0, Number.parseFloat(heatingArea) || 0);
  const utilTotalKzt = Math.round(cwVal * 92 + hwVal * 348 + elVal * 22.5 + heatVal * 156);

  // KZ Salary math
  const salaryCalc = useMemo(() => {
    const gross = Math.max(0, Number.parseFloat(grossSalary) || 0);
    const opv = Math.round(gross * 0.1);
    const vosms = Math.round(gross * 0.02);
    const stdDeduct = applyMrpDeduction ? 14 * mrpNum : 0;
    const ipnBase = Math.max(0, gross - opv - vosms - stdDeduct);
    const ipn = Math.round(ipnBase * 0.1);
    const net = Math.max(0, gross - opv - vosms - ipn);
    const opvr = Math.round(gross * 0.025);

    const rev = Math.max(0, Number.parseFloat(ipRevenue) || 0);
    const ipTax3 = Math.round(rev * 0.03);
    const ipIpn15 = Math.round(ipTax3 * 0.5);
    const ipSn15 = Math.max(0, ipTax3 - ipIpn15);
    return { gross, opv, vosms, ipn, net, opvr, rev, ipTax3, ipIpn15, ipSn15 };
  }, [applyMrpDeduction, grossSalary, ipRevenue, mrpNum]);

  // Installment 0% vs Credit comparison math
  const installmentCalc = useMemo(() => {
    const price = Math.max(0, Number.parseFloat(itemPrice) || 0);
    const months = Math.max(1, Number.parseInt(monthsCount, 10) || 12);
    const disc = Math.max(0, Math.min(50, Number.parseFloat(cashDiscountPct) || 0));
    const apr = Math.max(0, Number.parseFloat(creditApr) || 0);

    const cashNowPrice = Math.round(price * (1 - disc / 100));
    const instMonthly = Math.round(price / months);
    const hiddenOverpay = price - cashNowPrice;

    const r = apr / 100 / 12;
    const creditMonthly =
      r > 0
        ? Math.round((cashNowPrice * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1))
        : Math.round(cashNowPrice / months);
    const creditTotal = creditMonthly * months;
    const cheaperOption =
      price <= creditTotal
        ? `Рассрочка 0% выгоднее кредита на ${(creditTotal - price).toLocaleString('ru-RU')} ₸`
        : `Кредит со скидкой за наличные выгоднее рассрочки на ${(price - creditTotal).toLocaleString('ru-RU')} ₸`;

    return { price, cashNowPrice, instMonthly, hiddenOverpay, creditMonthly, creditTotal, cheaperOption };
  }, [cashDiscountPct, creditApr, itemPrice, monthsCount]);

  const saveUtilityReading = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE}/api/utilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        period: utilPeriod.trim() || 'Месяц',
        coldWater: cwVal,
        hotWater: hwVal,
        electricityKwh: elVal,
        heatingArea: heatVal,
        totalKzt: utilTotalKzt,
      }),
    });
    if (res.ok) {
      await loadAll();
      onNotify(`Показания ЖКХ сохранены (${utilTotalKzt.toLocaleString('ru-RU')} ₸)`);
    }
  };

  const deleteUtility = async (id: string) => {
    await fetch(`${API_BASE}/api/utilities/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadAll();
  };

  const handleSubmitIkomek = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repTitle.trim()) return;
    const res = await fetch(`${API_BASE}/api/ikomek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: repCat,
        title: repTitle.trim(),
        address: repAddress.trim() || 'Астана',
        lat: currentLocation?.lat ?? ASTANA_CENTER[0],
        lng: currentLocation?.lng ?? ASTANA_CENTER[1],
      }),
    });
    if (res.ok) {
      setRepTitle('');
      await loadAll();
      onNotify('Обращение отправлено в реестр iKomek 109');
    }
  };

  const cycleIkomekStatus = async (rep: IkomekReport) => {
    const next: IkomekReport['status'] =
      rep.status === 'Принято'
        ? 'В работе'
        : rep.status === 'В работе'
        ? 'Решено'
        : 'Принято';
    await fetch(`${API_BASE}/api/ikomek/${encodeURIComponent(rep.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    await loadAll();
  };

  const deleteIkomek = async (id: string) => {
    await fetch(`${API_BASE}/api/ikomek/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadAll();
  };

  const speakPhrase = (text: string, lang: 'ru-RU' | 'kk-KZ' | 'en-US') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.96;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  };

  const phraseCategories = useMemo(
    () => ['Все', ...Array.from(new Set(PHRASEBOOK_ENTRIES.map((p) => p.cat)))],
    []
  );

  const visiblePhrases = useMemo(
    () =>
      phraseCat === 'Все'
        ? PHRASEBOOK_ENTRIES
        : PHRASEBOOK_ENTRIES.filter((p) => p.cat === phraseCat),
    [phraseCat]
  );

  return (
    <div className="space-y-5">
      {/* Section Internal Navigation Tabs */}
      <div className="liquid-glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3 sm:px-5">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'finance', label: 'Финансы, Налоги и ПДД' },
              { id: 'ikomek', label: `iKomek 109, eGov и ЖКХ (${reports.length})` },
              { id: 'guide', label: 'Намаз, Праздники и Гид' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-2xl px-4 py-2 text-xs font-bold transition-colors ${
                activeTab === t.id
                  ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                  : 'bg-white/65 text-slate-800 hover:bg-white dark:bg-slate-800/75 dark:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={loadAll}
          className="flex items-center gap-1.5 rounded-xl bg-white/75 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:bg-slate-800 dark:text-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Обновить
        </button>
      </div>

      {/* TAB 1: FINANCE, TAXES, INSTALLMENT & PDD */}
      {activeTab === 'finance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Currency Rates & Converter */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Курсы валют (KZT)
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {ratesData.isLive ? 'Актуальный рыночный курс' : 'Справочный курс НБ РК'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setSelectedCurrency(c.code)}
                    className={`rounded-2xl p-3 text-left transition-colors ${
                      selectedCurrency === c.code
                        ? 'bg-slate-900 text-white dark:bg-emerald-600'
                        : 'liquid-glass-subtle'
                    }`}
                  >
                    <div className="font-mono text-xs font-bold">{c.code} / KZT</div>
                    <div className="mt-1 font-mono text-base font-extrabold tabular-nums">
                      {ratesData.rates[c.code].toFixed(2)} ₸
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-white/70 p-4 space-y-3 dark:bg-slate-800/60">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span>Конвертер валют</span>
                  <button
                    type="button"
                    onClick={() => setReverseToKzt((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-xs dark:bg-slate-900 dark:text-slate-200"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    {reverseToKzt ? `${selectedCurrency} → KZT` : `KZT → ${selectedCurrency}`}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-36 rounded-xl border border-white/80 bg-white px-3.5 py-2.5 font-mono text-sm font-bold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                    {reverseToKzt ? selectedCurrency : 'KZT'} =
                  </span>
                  <div className="font-mono text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {convertedResult.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}{' '}
                    {reverseToKzt ? '₸' : selectedCurrency}
                  </div>
                </div>
              </div>
            </div>

            {/* KZ Salary & IP Tax Calculator */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                  <Calculator className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Зарплата РК и налог ИП 3%
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Расчёт «На руки» (ОПВ 10%, ВОСМС 2%, ИПН 10%) и формы 910
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Оклад (Gross), ₸
                  </span>
                  <input
                    type="number"
                    value={grossSalary}
                    onChange={(e) => setGrossSalary(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-3 py-2 font-mono text-sm font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Доход ИП за полугодие, ₸
                  </span>
                  <input
                    type="number"
                    value={ipRevenue}
                    onChange={(e) => setIpRevenue(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-3 py-2 font-mono text-sm font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyMrpDeduction}
                  onChange={(e) => setApplyMrpDeduction(e.target.checked)}
                  className="h-4 w-4 accent-indigo-600"
                />
                Вычет 14 МРП по ИПН ({(14 * mrpNum).toLocaleString('ru-RU')} ₸)
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl bg-white/75 p-3.5 space-y-1 dark:bg-slate-800/70">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    На руки (Net)
                  </div>
                  <div className="font-mono text-xl font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {salaryCalc.net.toLocaleString('ru-RU')} ₸
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">
                    ОПВ: {salaryCalc.opv.toLocaleString('ru-RU')} · ВОСМС:{' '}
                    {salaryCalc.vosms.toLocaleString('ru-RU')} · ИПН:{' '}
                    {salaryCalc.ipn.toLocaleString('ru-RU')} · ОПВР работодателя:{' '}
                    {salaryCalc.opvr.toLocaleString('ru-RU')} ₸
                  </div>
                </div>

                <div className="rounded-2xl bg-white/75 p-3.5 space-y-1 dark:bg-slate-800/70">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    ИП Упрощёнка 3% (ф.910)
                  </div>
                  <div className="font-mono text-xl font-extrabold text-indigo-700 dark:text-indigo-400 tabular-nums">
                    {salaryCalc.ipTax3.toLocaleString('ru-RU')} ₸
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">
                    ИПН 1.5%: {salaryCalc.ipIpn15.toLocaleString('ru-RU')} ₸ · СН 1.5%:{' '}
                    {salaryCalc.ipSn15.toLocaleString('ru-RU')} ₸
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Installment 0% vs Cash Discount / Credit */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                  <Percent className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    Рассрочка 0% vs Кредит со скидкой
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Честное сравнение цены товара в Kaspi/магазинах РК
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Цена рассрочки, ₸
                  </span>
                  <input
                    type="number"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Срок, мес
                  </span>
                  <input
                    type="number"
                    value={monthsCount}
                    onChange={(e) => setMonthsCount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Скидка за кэш, %
                  </span>
                  <input
                    type="number"
                    value={cashDiscountPct}
                    onChange={(e) => setCashDiscountPct(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Ставка кредита, %
                  </span>
                  <input
                    type="number"
                    value={creditApr}
                    onChange={(e) => setCreditApr(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/80 bg-white/80 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-2xl bg-white/75 p-3 dark:bg-slate-800/70">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Рассрочка 0%</div>
                  <div className="font-mono text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {installmentCalc.instMonthly.toLocaleString('ru-RU')} ₸/мес
                  </div>
                  <div className="text-[10px] text-amber-700 dark:text-amber-300">
                    Скрытая наценка: +{installmentCalc.hiddenOverpay.toLocaleString('ru-RU')} ₸
                  </div>
                </div>
                <div className="rounded-2xl bg-white/75 p-3 dark:bg-slate-800/70">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Кредит от кэш-цены ({installmentCalc.cashNowPrice.toLocaleString('ru-RU')} ₸)
                  </div>
                  <div className="font-mono text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {installmentCalc.creditMonthly.toLocaleString('ru-RU')} ₸/мес
                  </div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-400">
                    Итого: {installmentCalc.creditTotal.toLocaleString('ru-RU')} ₸
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                {installmentCalc.cheaperOption}
              </div>
            </div>

            {/* PDD MRP Calculator */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                      Штрафы ПДД РК (МРП)
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Расчёт по КоАП РК со скидкой 50% в первые 7 суток
                    </p>
                  </div>
                </div>
                <div className="w-24">
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    1 МРП, ₸
                  </label>
                  <input
                    type="number"
                    value={mrpValue}
                    onChange={(e) => setMrpValue(e.target.value)}
                    className="w-full rounded-xl border border-white/80 bg-white/75 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <select
                value={selectedViolationId}
                onChange={(e) => setSelectedViolationId(e.target.value)}
                aria-label="Статья КоАП РК"
                className="w-full rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-xs font-semibold text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              >
                {PDD_VIOLATIONS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} — {v.mrpCount} МРП
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={discount50}
                  onChange={(e) => setDiscount50(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
                Применить льготную скидку 50% (оплата в течение 7 дней)
              </label>

              <div className="rounded-2xl bg-white/75 p-4 flex flex-wrap items-center justify-between gap-3 dark:bg-slate-800/70">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeViolation.mrpCount} МРП {discount50 ? '× 50%' : '(полный)'}
                  </div>
                  <div className="font-mono text-2xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
                    {finalFineKzt.toLocaleString('ru-RU')} ₸
                  </div>
                </div>
                {onLogExpense && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onLogExpense(
                        `Штраф ПДД (${activeViolation.mrpCount} МРП)`,
                        'Транспорт',
                        finalFineKzt
                      );
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-rose-600"
                  >
                    Записать в Wallet
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IKOMEK 109, REMINDERS, EGOV & UTILITIES */}
      {activeTab === 'ikomek' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* iKomek 109 City Issue Reporter */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-sm">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    iKomek 109 · Заявка в акимат
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Сообщить о проблеме с дорогами, снегом или освещением по геопозиции
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmitIkomek} className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={repCat}
                    onChange={(e) => setRepCat(e.target.value as IkomekReport['category'])}
                    className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {(['Дороги', 'Освещение', 'ЖКХ', 'Уборка снега', 'Транспорт', 'Другое'] as const).map(
                      (c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      )
                    )}
                  </select>
                  <input
                    type="text"
                    value={repAddress}
                    onChange={(e) => setRepAddress(e.target.value)}
                    placeholder="Адрес / перекрёсток"
                    className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={repTitle}
                    onChange={(e) => setRepTitle(e.target.value)}
                    placeholder="Опишите проблему (например: не горит фонарь, гололёд)…"
                    className="flex-1 rounded-xl border border-white/80 bg-white/80 px-3.5 py-2.5 text-xs text-slate-900 dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    Отправить
                  </button>
                </div>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-white/75 p-3 text-xs dark:bg-slate-800/70"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-900 dark:text-slate-100">
                        [{rep.category}] {rep.title}
                      </div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {rep.address} · {rep.createdAt}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => cycleIkomekStatus(rep)}
                        title="Сменить статус заявки"
                        className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                          rep.status === 'Решено'
                            ? 'bg-emerald-600 text-white'
                            : rep.status === 'В работе'
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-sky-600 text-white'
                        }`}
                      >
                        {rep.status}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteIkomek(rep.id)}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        aria-label="Удалить заявку"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reminders Manager */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                      Напоминания
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Городские дела, платежи и сроки документов
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                  {reminders.filter((r) => !r.done).length} активных
                </span>
              </div>

              <form onSubmit={handleAddReminder} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_auto]">
                <input
                  type="text"
                  value={remTitle}
                  onChange={(e) => setRemTitle(e.target.value)}
                  placeholder="Напомнить про…"
                  className="rounded-xl border border-white/80 bg-white/75 px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
                />
                <input
                  type="text"
                  value={remTime}
                  onChange={(e) => setRemTime(e.target.value)}
                  placeholder="Когда"
                  className="rounded-xl border border-white/80 bg-white/75 px-3 py-2.5 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <select
                    value={remCat}
                    onChange={(e) => setRemCat(e.target.value as ReminderItem['category'])}
                    className="rounded-xl border border-white/80 bg-white/75 px-2.5 py-2.5 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900/75 dark:text-slate-100"
                  >
                    <option value="Город">Город</option>
                    <option value="Документы">Документы</option>
                    <option value="Финансы">Финансы</option>
                    <option value="Здоровье">Здоровье</option>
                    <option value="Личное">Личное</option>
                  </select>
                  <button
                    type="submit"
                    className="flex min-h-[42px] items-center justify-center rounded-xl bg-sky-600 px-3.5 text-white hover:bg-sky-700"
                    aria-label="Добавить напоминание"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </form>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {reminders.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3.5 py-2.5 text-xs dark:bg-slate-800/65"
                  >
                    <button
                      type="button"
                      onClick={() => toggleReminder(r)}
                      className="flex flex-1 items-center gap-3 text-left min-w-0"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          r.done
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-400 bg-white dark:bg-slate-900'
                        }`}
                      >
                        {r.done && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0">
                        <div
                          className={`truncate font-semibold ${
                            r.done
                              ? 'line-through text-slate-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {r.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {r.category} · {r.remindAt}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteReminder(r.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                      aria-label="Удалить напоминание"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* eGov.kz Guides */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  Памятки eGov.kz и ЦОН
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Пошаговые чек-листы популярных государственных услуг Казахстана
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
              <div className="space-y-2">
                {EGOV_GUIDES.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setActiveGuideId(g.id)}
                    className={`w-full rounded-2xl p-3.5 text-left transition-colors ${
                      activeGuide.id === g.id
                        ? 'bg-slate-900 text-white dark:bg-indigo-600'
                        : 'liquid-glass-subtle'
                    }`}
                  >
                    <div className="text-[11px] opacity-75">{g.category}</div>
                    <div className="mt-0.5 font-display text-xs font-bold">{g.title}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-white/75 p-4 sm:p-5 space-y-3 dark:bg-slate-800/65">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/10 pb-3 dark:border-white/10">
                  <h3 className="font-display text-base font-extrabold text-slate-900 dark:text-slate-100">
                    {activeGuide.title}
                  </h3>
                  <div className="font-mono text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                    {activeGuide.duration} · {activeGuide.fee}
                  </div>
                </div>

                <div className="space-y-2">
                  {activeGuide.steps.map((step, idx) => {
                    const key = `${activeGuide.id}-${idx}`;
                    const done = Boolean(checkedSteps[key]);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setCheckedSteps((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                        className="flex w-full items-start gap-3 rounded-xl bg-white/80 p-3 text-left text-xs transition-colors hover:bg-white dark:bg-slate-900/70 dark:hover:bg-slate-900"
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold ${
                            done
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {done ? <Check className="h-3 w-3" /> : idx + 1}
                        </span>
                        <span
                          className={`leading-relaxed ${
                            done
                              ? 'line-through text-slate-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {step}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Astana Utilities Calculator */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    Калькулятор ЖКХ Астаны
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Вода, свет и отопление с сохранением показаний
                  </p>
                </div>
              </div>
              <div className="font-mono text-lg font-extrabold text-amber-700 dark:text-amber-400 tabular-nums">
                {utilTotalKzt.toLocaleString('ru-RU')} ₸
              </div>
            </div>

            <form onSubmit={saveUtilityReading} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Период
                  </label>
                  <input
                    type="text"
                    value={utilPeriod}
                    onChange={(e) => setUtilPeriod(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    ХВС (м³)
                  </label>
                  <input
                    type="number"
                    value={coldWater}
                    onChange={(e) => setColdWater(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 font-mono text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    ГВС (м³)
                  </label>
                  <input
                    type="number"
                    value={hotWater}
                    onChange={(e) => setHotWater(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 font-mono text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Свет (кВт·ч)
                  </label>
                  <input
                    type="number"
                    value={electricityKwh}
                    onChange={(e) => setElectricityKwh(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 font-mono text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Площадь (м²)
                  </label>
                  <input
                    type="number"
                    value={heatingArea}
                    onChange={(e) => setHeatingArea(e.target.value)}
                    className="mt-0.5 w-full rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 font-mono text-xs text-slate-900 focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600"
                >
                  Сохранить показания
                </button>
                {onLogExpense && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onLogExpense(`Оплата ЖКХ · ${utilPeriod}`, 'Другое', utilTotalKzt);
                    }}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-emerald-600"
                  >
                    Оплатить в Wallet
                  </button>
                )}
              </div>
            </form>

            {utilities.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pt-1">
                {utilities.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs dark:bg-slate-800/65"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{u.period}</span>
                      <span className="ml-2 text-[11px] text-slate-500 dark:text-slate-400">
                        ХВС {u.coldWater} · ГВС {u.hotWater} · {u.electricityKwh} кВт·ч
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                        {u.totalKzt.toLocaleString('ru-RU')} ₸
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteUtility(u.id)}
                        className="text-slate-400 hover:text-rose-600"
                        aria-label="Удалить запись ЖКХ"
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
      )}

      {/* TAB 3: PRAYER TIMES, KZ HOLIDAYS, WEEKEND GUIDE & PHRASEBOOK */}
      {activeTab === 'guide' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Namaz Prayer Times (Astana) */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
                    <MoonStar className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                      Намаз уақыты · Астана
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      {prayerTimes
                        ? `${prayerTimes.date} · Следующий: ${prayerTimes.nextPrayer}`
                        : 'Загрузка расписания…'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {prayerTimes?.isLive ? 'AlAdhan Live' : 'Календарь РК'}
                </span>
              </div>

              {prayerTimes && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    { key: 'Таң (Фаджр)', val: prayerTimes.fajr },
                    { key: 'Күн (Восход)', val: prayerTimes.sunrise },
                    { key: 'Бесін (Зухр)', val: prayerTimes.dhuhr },
                    { key: 'Екінті (Аср)', val: prayerTimes.asr },
                    { key: 'Ақшам (Магриб)', val: prayerTimes.maghrib },
                    { key: 'Құптан (Иша)', val: prayerTimes.isha },
                  ].map((item) => {
                    const isNext = prayerTimes.nextPrayer.includes(item.val);
                    return (
                      <div
                        key={item.key}
                        className={`rounded-2xl p-2.5 text-center ${
                          isNext
                            ? 'bg-emerald-700 text-white shadow-sm'
                            : 'bg-white/75 text-slate-900 dark:bg-slate-800/75 dark:text-slate-100'
                        }`}
                      >
                        <div className="text-[10px] font-semibold opacity-80">{item.key}</div>
                        <div className="mt-1 font-mono text-sm font-extrabold">{item.val}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Kazakhstan Holidays Calendar */}
            <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
                  <CalendarDays className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Праздники Республики Казахстан
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Государственные и городские даты Астаны
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {KZ_HOLIDAYS.map((h) => (
                  <div
                    key={h.date}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-white/75 px-3.5 py-2 text-xs dark:bg-slate-800/70"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{h.title}</div>
                      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {h.note}
                      </div>
                    </div>
                    <span className="rounded-lg bg-sky-500/15 px-2.5 py-1 font-mono text-[11px] font-bold text-sky-800 dark:text-sky-300 shrink-0">
                      {h.date}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Weekend Trips from Astana */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                  Weekend-гид из Астаны (Бурабай, Коргалжын, Баянаул)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Расстояние, время в пути и ориентировочный бюджет дороги (топливо + платная трасса)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {ASTANA_WEEKEND_DESTINATIONS.map((wk) => (
                <div
                  key={wk.id}
                  className="liquid-glass-subtle flex flex-col justify-between rounded-2xl p-4 space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-slate-100">
                        {wk.title}
                      </h3>
                      <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
                        {wk.distanceKm} км
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                      {wk.driveTime}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                      {wk.seasonTip}
                    </p>
                  </div>

                  <div className="space-y-2 border-t border-slate-900/10 pt-2.5 dark:border-white/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Бюджет дороги:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        ~{wk.fuelAndTollKzt.toLocaleString('ru-RU')} ₸
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {onOpenRoute && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenRoute(wk.title, `${wk.distanceKm} км от Астаны`, wk.lat, wk.lng)
                          }
                          className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-900 py-2 text-[11px] font-bold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          На карте
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`${API_BASE}/api/plans`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              title: `Поездка: ${wk.title} (~${wk.fuelAndTollKzt.toLocaleString('ru-RU')} ₸)`,
                              dateLabel: 'Выходные',
                            }),
                          });
                          onNotify(`«${wk.title}» добавлен в Планы`);
                        }}
                        className="rounded-xl bg-white/80 px-3 py-2 text-[11px] font-bold text-slate-900 hover:bg-white dark:bg-slate-800 dark:text-slate-100"
                      >
                        В планы
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mini Phrasebook RU <-> KK <-> EN */}
          <div className="liquid-glass rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
                  <Languages className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Мини-разговорник RU ↔ Қазақша ↔ EN
                  </h2>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Быстрое копирование и озвучка фраз для такси, кафе и ЦОНа
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {phraseCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setPhraseCat(cat)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                      phraseCat === cat
                        ? 'bg-violet-600 text-white'
                        : 'bg-white/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {visiblePhrases.map((entry, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white/75 p-3.5 text-xs space-y-1.5 dark:bg-slate-800/75"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100">{entry.ru}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(entry.kk).catch(() => {});
                        onNotify(`Скопировано: ${entry.kk}`);
                      }}
                      className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:text-slate-950 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <Copy className="inline h-3 w-3 mr-1" />
                      KZ
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 font-semibold text-violet-700 dark:text-violet-300">
                    <span>{entry.kk}</span>
                    <button
                      type="button"
                      onClick={() => speakPhrase(entry.kk, 'kk-KZ')}
                      aria-label="Озвучить на казахском"
                      className="p-1 text-violet-600 hover:text-violet-800 dark:text-violet-300"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
                    <span>{entry.en}</span>
                    <button
                      type="button"
                      onClick={() => speakPhrase(entry.en, 'en-US')}
                      aria-label="Озвучить на английском"
                      className="p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
