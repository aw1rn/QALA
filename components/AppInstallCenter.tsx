import {
  Check,
  Copy,
  Download,
  FileArchive,
  FolderOpen,
  Monitor,
  Smartphone,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SourceManifest {
  count: number;
  totalBytes: number;
  files: Array<{ path: string; size: number }>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

export function AppInstallCenter() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [openModal, setOpenModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [manifest, setManifest] = useState<SourceManifest | null>(null);
  const [showFiles, setShowFiles] = useState(false);

  useEffect(() => {
    if (!openModal || manifest) return;
    fetch('/api/download-source/manifest')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SourceManifest | null) => {
        if (data) setManifest(data);
      })
      .catch(() => {});
  }, [openModal, manifest]);

  const copyCommand = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleDownloadAllFiles = async () => {
    setDownloadingZip(true);
    try {
      const response = await fetch('/api/download-source');
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'qala-project-source.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally {
      setDownloadingZip(false);
    }
  };

  const exeCommands = `npm install
npm run build
npm install -D electron electron-builder
npx electron-builder --win nsis --config electron-builder.json`;

  const apkCommands = `npm install
npm run build
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap add android
npx cap sync android
cd android && ./gradlew assembleDebug`;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleDownloadAllFiles}
          disabled={downloadingZip}
          title="Скачать все файлы проекта (.ZIP)"
          className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/75 px-2.5 py-2 text-xs font-semibold text-slate-900 shadow-xs hover:bg-white disabled:opacity-60 whitespace-nowrap"
        >
          <FileArchive className="h-3.5 w-3.5 text-indigo-600" />
          <span className="hidden lg:inline">
            {downloadingZip ? 'Архивация…' : 'Скачать файлы'}
          </span>
          <span className="lg:hidden">ZIP</span>
        </button>

        <button
          type="button"
          onClick={async () => {
            if (isInstallable) {
              const ok = await install();
              if (!ok) setOpenModal(true);
            } else {
              setOpenModal(true);
            }
          }}
          className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 whitespace-nowrap"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">
            {isInstalled ? 'EXE / APK · ZIP' : 'Установить / EXE · APK'}
          </span>
          <span className="xl:hidden">App</span>
        </button>
      </div>

      {openModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          onClick={() => setOpenModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Установка и скачивание файлов QALA"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-900/10 pb-4">
              <div>
                <h2 className="font-display text-xl font-extrabold text-slate-900">
                  Скачать файлы и установить QALA
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Полный архив исходников проекта (.ZIP), мгновенная установка PWA и сборка .EXE / .APK
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="rounded-xl bg-white/70 p-2 text-slate-700 hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Download All Project Files (.ZIP) */}
            <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/75 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-display text-sm font-bold text-slate-900">
                    Скачать все файлы проекта (ZIP-архив)
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {manifest
                      ? `Файлов в архиве: ${manifest.count} · Исходный размер: ${formatBytes(manifest.totalBytes)}`
                      : 'Все модули src/, server.ts, иконки, Electron (.exe), Capacitor (.apk) и CI workflow'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadAllFiles}
                  disabled={downloadingZip}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 whitespace-nowrap"
                >
                  <FileArchive className="h-4 w-4" />
                  {downloadingZip ? 'Формирование ZIP…' : 'Скачать qala-project-source.zip'}
                </button>
              </div>

              {manifest && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowFiles((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {showFiles ? 'Скрыть список файлов' : `Показать все файлы (${manifest.count})`}
                  </button>

                  {showFiles && (
                    <div className="mt-2.5 max-h-44 overflow-y-auto rounded-xl border border-white/80 bg-white/85 p-2.5 font-mono text-[11px] text-slate-700 space-y-1">
                      {manifest.files.map((f) => (
                        <div key={f.path} className="flex items-center justify-between gap-3">
                          <span className="truncate">{f.path}</span>
                          <span className="shrink-0 text-slate-500">{formatBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instant Standalone Install */}
            <div className="rounded-2xl bg-white/75 p-4 space-y-3">
              <div className="font-display text-sm font-bold text-slate-900">
                1. Установить прямо сейчас (без компиляции)
              </div>
              {isInstallable ? (
                <button
                  type="button"
                  onClick={() => install()}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  <Download className="h-4 w-4" />
                  Установить отдельное окно QALA
                </button>
              ) : isIOS ? (
                <p className="text-xs text-slate-700 leading-relaxed">
                  На iPhone/iPad: нажмите <strong>Поделиться</strong> в Safari и выберите{' '}
                  <strong>На экран «Домой»</strong>.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs text-slate-700">
                  <div className="rounded-xl bg-white/80 p-3">
                    <div className="font-bold text-slate-900">Windows / macOS (Desktop)</div>
                    <p className="mt-1">
                      В Chrome или Edge откройте ссылку приложения (не внутри iframe) и нажмите
                      иконку установки в адресной строке → <strong>Установить QALA</strong>.
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3">
                    <div className="font-bold text-slate-900">Android (WebAPK)</div>
                    <p className="mt-1">
                      Откройте приложение в Chrome на Android → меню <strong>⋮</strong> →{' '}
                      <strong>Установить приложение</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Native .EXE & .APK Build Configs */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-white/75 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <Monitor className="h-4 w-4 text-sky-600" />
                    Windows (.EXE)
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">Electron</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Конфигурация добавлена в <code>electron/main.cjs</code> и{' '}
                  <code>electron-builder.json</code>. После скачивания архива выполните:
                </p>
                <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                  {exeCommands}
                </pre>
                <button
                  type="button"
                  onClick={() => copyCommand('exe', exeCommands)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  {copiedId === 'exe' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      Команды скопированы
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Скопировать команды для .EXE
                    </>
                  )}
                </button>
              </div>

              <div className="rounded-2xl bg-white/75 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-display text-sm font-bold text-slate-900">
                    <Smartphone className="h-4 w-4 text-emerald-600" />
                    Android (.APK)
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">Capacitor</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Конфигурация добавлена в <code>capacitor.config.ts</code> (<code>kz.qala.app</code>
                  ). После скачивания архива выполните:
                </p>
                <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-100">
                  {apkCommands}
                </pre>
                <button
                  type="button"
                  onClick={() => copyCommand('apk', apkCommands)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-800 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
                >
                  {copiedId === 'apk' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                      Команды скопированы
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Скопировать команды для .APK
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-sky-50/85 border border-sky-200/80 p-3.5 text-xs text-slate-700 leading-relaxed">
              <strong>Автосборка в облаке:</strong> добавлен файл{' '}
              <code>.github/workflows/build-native.yml</code> — при загрузке скачанного проекта на
              GitHub автоматически собираются оба артефакта (<code>QALA-Setup.exe</code> и{' '}
              <code>qala-android.apk</code>).
            </div>
          </div>
        </div>
      )}
    </>
  );
}
