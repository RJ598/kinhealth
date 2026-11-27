import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  FileArchive,
  HeartPulse,
  Info,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import {
  parseAppleHealthFile,
  parseHealthJsonPayload,
} from '../utils/appleHealthImport';
import type { AppleHealthParseResult } from '../utils/appleHealthImport';

interface AppleHealthSyncModalProps {
  isOpen: boolean;
  initialPendingSync: AppleHealthParseResult | null;
  onClose: () => void;
  onImport: (
    parsed: AppleHealthParseResult,
    options: { includeWeights: boolean }
  ) => Promise<{
    activitiesImported: number;
    workoutsImported: number;
    weightsImported: number;
  }>;
}

type SyncTab = 'export' | 'shortcut';

export const AppleHealthSyncModal: React.FC<AppleHealthSyncModalProps> = ({
  isOpen,
  initialPendingSync,
  onClose,
  onImport,
}) => {
  const [tab, setTab] = useState<SyncTab>('export');
  const [lookbackDays, setLookbackDays] = useState<7 | 30 | 90>(30);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<AppleHealthParseResult | null>(
    initialPendingSync
  );
  const [includeWeights, setIncludeWeights] = useState(true);
  const [jsonInput, setJsonInput] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialPendingSync) {
      setParsed(initialPendingSync);
      setTab('shortcut');
    } else {
      setParsed(null);
    }
    setParseError(null);
    setImportSummary(null);
  }, [isOpen, initialPendingSync]);

  if (!isOpen) return null;

  const shortcutTemplateUrl = `${window.location.origin}/?healthSync=`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setImportSummary(null);
    setParsing(true);
    try {
      const result = await parseAppleHealthFile(file, lookbackDays);
      setParsed(result);
    } catch (err) {
      setParsed(null);
      setParseError(
        err instanceof Error ? err.message : 'Failed to parse Apple Health file.'
      );
    } finally {
      setParsing(false);
    }
  };

  const handleParseJson = () => {
    if (!jsonInput.trim()) return;
    setParseError(null);
    setImportSummary(null);
    try {
      const result = parseHealthJsonPayload(jsonInput, 'apple_shortcut');
      setParsed(result);
    } catch (err) {
      setParsed(null);
      setParseError(
        err instanceof Error ? err.message : 'Invalid JSON payload.'
      );
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed) return;
    setImporting(true);
    setParseError(null);
    try {
      const counts = await onImport(parsed, { includeWeights });
      setImportSummary(
        `Synced ${counts.activitiesImported} activity ${
          counts.activitiesImported === 1 ? 'day' : 'days'
        }, ${counts.workoutsImported} new ${
          counts.workoutsImported === 1 ? 'workout' : 'workouts'
        }${
          counts.weightsImported > 0
            ? `, and ${counts.weightsImported} weigh-in${counts.weightsImported === 1 ? '' : 's'}`
            : ''
        }.`
      );
      setParsed(null);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to save synced health data.'
      );
    } finally {
      setImporting(false);
    }
  };

  const copyShortcutUrl = async () => {
    try {
      await navigator.clipboard.writeText(shortcutTemplateUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <HeartPulse className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Apple Health &amp; Watch Sync
              </h2>
              <p className="text-xs text-slate-500">
                Import Steps, Active Calories, Workouts &amp; Body Weight
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Browser HealthKit Limitation Note */}
        <div className="mx-6 mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2.5 text-xs text-slate-600">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            Web apps &amp; iOS PWAs cannot query Apple HealthKit directly. Sync cleanly using
            Apple Health&apos;s built-in <strong>export.zip / export.xml</strong>,{' '}
            <strong>Health Auto Export JSON</strong>, or a one-tap{' '}
            <strong>iPhone Apple Shortcut</strong> link.
          </span>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTab('export')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                tab === 'export'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileArchive className="w-3.5 h-3.5" />
              Export File (.zip / .xml / .json)
            </button>
            <button
              type="button"
              onClick={() => setTab('shortcut')}
              className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                tab === 'shortcut'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              iPhone Shortcut &amp; JSON
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {tab === 'export' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600">
                  On iPhone: <strong>Health app → Profile → Export All Health Data</strong>
                </div>
                <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                  {([7, 30, 90] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setLookbackDays(days)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${
                        lookbackDays === days
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/60 hover:bg-slate-50 hover:border-emerald-500 transition-colors cursor-pointer text-center">
                <Upload className="w-6 h-6 text-emerald-700" />
                <div className="text-xs font-semibold text-slate-900">
                  {parsing
                    ? 'Scanning Apple Health data locally in browser…'
                    : 'Choose Apple Health export.zip, export.xml, or JSON'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Processed 100% locally in your browser · skips overlapping Watch/iPhone step double-counts
                </div>
                <input
                  type="file"
                  accept=".zip,.xml,.json,application/zip,text/xml,application/json"
                  onChange={(e) => void handleFileChange(e)}
                  disabled={parsing}
                  className="sr-only"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    One-Tap iPhone Shortcut Bridge
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyShortcutUrl()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50"
                  >
                    {copiedUrl ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        Copied URL
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy Base URL
                      </>
                    )}
                  </button>
                </div>
                <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>
                    In iOS <strong>Shortcuts</strong>, add <strong>Find Health Samples</strong>{' '}
                    for today&apos;s Steps &amp; Active Energy (plus Workouts if desired).
                  </li>
                  <li>
                    Build a JSON Dictionary:{' '}
                    <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">
                      {`{"steps": ..., "activeCalories": ..., "distanceKm": ...}`}
                    </code>
                  </li>
                  <li>
                    URL-encode it and run <strong>Open URLs</strong> with{' '}
                    <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200 break-all">
                      {shortcutTemplateUrl}[Encoded JSON]
                    </code>
                  </li>
                </ol>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  Or paste JSON from Shortcuts / Health Auto Export
                </label>
                <textarea
                  rows={4}
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  placeholder={`{\n  "date": "${new Date().toISOString().slice(0, 10)}",\n  "steps": 9420,\n  "activeCalories": 430,\n  "distanceKm": 6.8,\n  "workouts": [{ "type": "strength", "title": "Upper Body", "durationMin": 45, "caloriesBurned": 290 }]\n}`}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParseJson}
                    disabled={!jsonInput.trim()}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                  >
                    Preview JSON Payload
                  </button>
                </div>
              </div>
            </div>
          )}

          {parseError && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {parseError}
            </div>
          )}

          {importSummary && (
            <div className="p-3.5 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0 text-emerald-700" />
              <span>{importSummary}</span>
            </div>
          )}

          {parsed && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-900">
                  Ready to Sync
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {parsed.detectedFormat.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-lg font-mono font-semibold text-slate-900">
                    {parsed.activities.length}
                  </div>
                  <div className="text-[11px] text-slate-500">Activity Days</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-lg font-mono font-semibold text-emerald-700">
                    {parsed.workouts.length}
                  </div>
                  <div className="text-[11px] text-slate-500">Workouts</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-lg font-mono font-semibold text-slate-900">
                    {parsed.weights.length}
                  </div>
                  <div className="text-[11px] text-slate-500">Weigh-ins</div>
                </div>
              </div>

              {parsed.activities.length > 0 && (
                <div className="text-[11px] font-mono text-slate-600 space-y-1 max-h-28 overflow-y-auto">
                  {parsed.activities.slice(0, 5).map((a) => (
                    <div key={a.date} className="flex items-center justify-between">
                      <span>{a.date}</span>
                      <span>
                        {a.steps.toLocaleString()} steps · {a.activeCalories} kcal · {a.distanceKm} km
                      </span>
                    </div>
                  ))}
                  {parsed.activities.length > 5 && (
                    <div className="text-slate-400">
                      +{parsed.activities.length - 5} earlier days
                    </div>
                  )}
                </div>
              )}

              {parsed.weights.length > 0 && (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={includeWeights}
                    onChange={(e) => setIncludeWeights(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span>
                    Import Apple Health body weight entries for dates without weigh-ins
                  </span>
                </label>
              )}

              {parsed.warnings.map((w, idx) => (
                <p key={idx} className="text-[11px] text-amber-700">
                  {w}
                </p>
              ))}

              <div className="pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setParsed(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={
                    importing ||
                    (parsed.activities.length === 0 &&
                      parsed.workouts.length === 0 &&
                      (!includeWeights || parsed.weights.length === 0))
                  }
                  onClick={() => void handleConfirmImport()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {importing ? 'Importing…' : 'Import to KinHealth'}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
