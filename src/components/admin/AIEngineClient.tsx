'use client';

import { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getGlobalLimits, updateGlobalLimits, requestSync, getAITrainingStatus } from '@/lib/admin-actions';
import { useWorkerPresence } from '@/hooks/useWorkerPresence';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap, RefreshCw, StopCircle, PlayCircle, Trophy, WifiOff, Loader2 } from 'lucide-react';

interface AIEngineClientProps {
  t: Record<string, string>;
  mlMetrics: any[];
}

type HyperPhase =
  | 'idle'
  | 'sending_scan'      // Sending scan request to worker
  | 'waiting_worker'    // Waiting for worker to pick up & complete scan + training
  | 'reading_accuracy'  // Reading new accuracy after training finished
  | 'reached_goal';     // Target accuracy achieved

export default function AIEngineClient({ t, mlMetrics }: AIEngineClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [aiEnabled, setAiEnabled] = useState(false);
  const { pcOnline: workerOnline } = useWorkerPresence();
  
  // Hyper-Training State
  const [hyperPhase, setHyperPhase] = useState<HyperPhase>('idle');
  const [targetLoops, setTargetLoops] = useState(1);
  const [currentAcc, setCurrentAcc] = useState(mlMetrics && mlMetrics.length > 0 ? mlMetrics[0].accuracy : 0);
  const [iteration, setIteration] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef(false);
  // Track accuracy timestamp to detect new training results
  const lastAccuracyTimestamp = useRef<string | null>(null);

  useEffect(() => {
    getGlobalLimits().then(res => setAiEnabled(res.ai_filtering));
  }, []);

  const toggleAi = () => {
    const newVal = !aiEnabled;
    setAiEnabled(newVal);
    startTransition(async () => {
      await updateGlobalLimits({ ai_filtering: newVal });
    });
  };

  const stopHyperTraining = useCallback(() => {
    abortRef.current = true;
    setHyperPhase('idle');
    setStatusMsg('');
    setIteration(0);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startHyperTraining = useCallback(async () => {
    // Double-check worker is online before starting
    try {
      const status = await getAITrainingStatus();
      if (!status.workerOnline) {
        alert('⚠️ Worker غير متصل! قم بتشغيل Worker على حاسوبك أولاً.');
        return;
      }
      // Save current accuracy timestamp so we can detect new training
      lastAccuracyTimestamp.current = status.accuracyUpdatedAt;
    } catch {
      alert('⚠️ فشل الاتصال بالسيرفر. حاول مرة أخرى.');
      return;
    }

    abortRef.current = false;
    setIteration(0);
    setHyperPhase('sending_scan');
    
    // Start the loop
    runHyperLoop(0);
  }, []);

  const runHyperLoop = useCallback(async (currentIteration: number) => {
    if (abortRef.current) return;

    const iter = currentIteration + 1;
    setIteration(iter);

    // --- Phase 1: Send scan request ---
    setHyperPhase('sending_scan');
    setStatusMsg(`الدورة ${iter}: جاري إرسال أمر الفحص...`);
    try {
      await requestSync('wifi', 100, 100);
    } catch (err) {
      setStatusMsg(`خطأ في إرسال أمر الفحص: ${err}`);
      setHyperPhase('idle');
      return;
    }

    if (abortRef.current) return;

    // --- Phase 2: Wait for worker to finish scan + training ---
    setHyperPhase('waiting_worker');
    setStatusMsg(`الدورة ${iter}: جاري الفحص والتدريب... (قد يستغرق عدة دقائق)`);

    // Poll until worker is done AND a new accuracy is available
    const waitForCompletion = (): Promise<{ accuracy: number; accuracyUpdatedAt: string | null }> => {
      return new Promise((resolve, reject) => {
        let seenSyncing = false;

        const check = async () => {
          if (abortRef.current) {
            reject(new Error('aborted'));
            return;
          }

          try {
            const status = await getAITrainingStatus();

            if (!status.workerOnline) {
              setStatusMsg(t.workerDisconnected?.replace('{iter}', iter.toString()) || `Cycle ${iter}: ⚠️ Worker disconnected! Please restart it...`);
              // Don't reject, keep polling — worker might come back
            } else if (status.workerState === 'syncing' || status.isBusy) {
              seenSyncing = true;
              setStatusMsg(t.workerWorking?.replace('{iter}', iter.toString()).replace('{state}', status.workerState) || `Cycle ${iter}: ⚙️ Worker is running (${status.workerState})...`);
            } else if (seenSyncing && !status.isBusy) {
              // Worker went from syncing → idle. Check if a NEW accuracy was written.
              if (status.accuracyUpdatedAt && status.accuracyUpdatedAt !== lastAccuracyTimestamp.current) {
                // New training result available!
                lastAccuracyTimestamp.current = status.accuracyUpdatedAt;
                setCurrentAcc(status.accuracy);
                resolve({ accuracy: status.accuracy, accuracyUpdatedAt: status.accuracyUpdatedAt });
                return;
              } else {
                setStatusMsg(t.workerWaitingTrain?.replace('{iter}', iter.toString()) || `Cycle ${iter}: ⏳ Waiting for training to complete...`);
              }
            } else if (!seenSyncing && !status.isBusy) {
              // Worker hasn't picked up the request yet
              setStatusMsg(t.workerWaitingPick?.replace('{iter}', iter.toString()) || `Cycle ${iter}: 📡 Waiting for Worker to pick up command...`);
            }
          } catch (err) {
            setStatusMsg(t.workerError?.replace('{iter}', iter.toString()) || `Cycle ${iter}: Connection error, retrying...`);
          }
        };

        // Check immediately, then every 15s
        check();
        pollRef.current = setInterval(check, 15_000);

        // Safety: also set up a completion checker that resolves when accuracy changes
        const completionChecker = setInterval(async () => {
          if (abortRef.current) {
            clearInterval(completionChecker);
            reject(new Error('aborted'));
            return;
          }
          try {
            const status = await getAITrainingStatus();
            if (status.accuracyUpdatedAt && status.accuracyUpdatedAt !== lastAccuracyTimestamp.current && !status.isBusy) {
              clearInterval(completionChecker);
              if (pollRef.current) clearInterval(pollRef.current);
              lastAccuracyTimestamp.current = status.accuracyUpdatedAt;
              setCurrentAcc(status.accuracy);
              resolve({ accuracy: status.accuracy, accuracyUpdatedAt: status.accuracyUpdatedAt });
            }
          } catch { /* ignore */ }
        }, 30_000); // Check every 30s as backup

        // Timeout after 20 minutes
        setTimeout(() => {
          clearInterval(completionChecker);
          if (pollRef.current) clearInterval(pollRef.current);
          reject(new Error('timeout'));
        }, 20 * 60 * 1000);
      });
    };

    try {
      const result = await waitForCompletion();
      if (abortRef.current) return;
      
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }

      // --- Phase 3: Read accuracy ---
      setHyperPhase('reading_accuracy');
      setStatusMsg(t.newAccuracyMsg?.replace('{iter}', iter.toString()).replace('{acc}', Math.round(result.accuracy * 100).toString()) || `Cycle ${iter}: New accuracy ${Math.round(result.accuracy * 100)}%`);
      router.refresh();

      // Check if goal reached
      if (iter >= targetLoops) {
        setHyperPhase('reached_goal');
        setStatusMsg(t.goalReachedMsg?.replace('{iter}', iter.toString()) || `🎉 Completed ${iter} training cycles!`);
        return;
      }

      // Next loop
      // Small delay before starting next scan
      setTimeout(() => runHyperLoop(iter), 3000);
    } catch (err: any) {
      if (err.message === 'aborted') return;
      if (err.message === 'timeout') {
        setStatusMsg(`الدورة ${iter}: ⏰ انتهى الوقت (20 دقيقة). يرجى المحاولة مرة أخرى.`);
      } else {
        setStatusMsg(`خطأ: ${err.message}`);
      }
      setHyperPhase('idle');
    }
  }, [targetLoops, router]);

  const isRunning = hyperPhase !== 'idle' && hyperPhase !== 'reached_goal';

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="admin-panel p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" /> {t.aiEngineStats || 'AI Engine Analytics'}
            </h3>
            <p className="text-sm text-white/40 mt-1 mb-4">{t.aiDesc || 'Continuous learning performance tracking for predictive filtering.'}</p>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={toggleAi}
                disabled={isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${aiEnabled ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}
              >
                <div className={`h-2 w-2 rounded-full ${aiEnabled ? 'bg-yellow-400 animate-pulse' : 'bg-white/40'}`} />
                {aiEnabled ? (t.aiActive || 'AI Filtering is ACTIVE') : (t.aiInactive || 'Enable AI Filtering')}
              </button>

              {hyperPhase === 'idle' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={targetLoops}
                    onChange={(e) => setTargetLoops(Math.max(1, parseInt(e.target.value) || 1))}
                    disabled={!workerOnline || isPending}
                    className="w-16 px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-center focus:outline-none focus:border-indigo-500"
                    title={t.loopsInputTitle || 'Number of training cycles'}
                  />
                  <button 
                    onClick={startHyperTraining}
                    disabled={!workerOnline}
                    title={!workerOnline ? (t.workerOffline || 'Worker Offline') : ''}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      workerOnline 
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 cursor-pointer' 
                        : 'bg-white/5 text-white/20 border border-white/10 cursor-not-allowed'
                    }`}
                  >
                    {workerOnline ? (
                      <PlayCircle className="h-4 w-4" />
                    ) : (
                      <WifiOff className="h-4 w-4" />
                    )}
                    {workerOnline 
                      ? (t.hyperTrain?.replace('{target}', targetLoops.toString()) || `Train ${targetLoops} Times`)
                      : (t.workerOffline || 'Worker Offline — Cannot Train')}
                  </button>
                </div>
              ) : isRunning ? (
                <button 
                  onClick={stopHyperTraining}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                >
                  <StopCircle className="h-4 w-4" />
                  {t.stopTraining?.replace('{iter}', iteration.toString()) || `Stop training (Cycle ${iteration})`}
                  <Loader2 className="h-4 w-4 animate-spin ml-1" />
                </button>
              ) : null}
            </div>
            
            {/* Live status message */}
            {statusMsg && (
              <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-mono ${
                hyperPhase === 'reached_goal' 
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                  : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
              }`}>
                {isRunning && <Loader2 className="h-3 w-3 animate-spin inline mr-2" />}
                {statusMsg}
              </div>
            )}
          </div>
          {mlMetrics && mlMetrics.length > 0 ? (
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-[0.65rem] uppercase tracking-wider text-white/40">{t.accuracy || 'Model Accuracy'}</div>
                <div className="text-xl font-bold text-yellow-400">
                  {Math.round((isRunning ? currentAcc : mlMetrics[0].accuracy) * 100)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-[0.65rem] uppercase tracking-wider text-white/40">{t.datasetSize || 'Training Dataset'}</div>
                <div className="text-xl font-bold text-white/80">
                  {mlMetrics[0].dataset_size}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-right text-sm text-white/40">
              No training data yet. Run the worker to collect data.
            </div>
          )}
        </div>
        
        {mlMetrics && mlMetrics.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[...mlMetrics].reverse()} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#facc15" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#facc15" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis 
                  dataKey="created_at" 
                  stroke="#64748b" 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  tickFormatter={(val) => new Date(val).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                />
                <YAxis domain={[0, 1]} stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelFormatter={(val) => new Date(val).toLocaleString()}
                  formatter={(value: any) => [`${Math.round(value * 100)}%`, t.accuracy || 'Accuracy']}
                />
                <Area type="monotone" dataKey="accuracy" stroke="#facc15" strokeWidth={3} fillOpacity={1} fill="url(#colorAcc)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {hyperPhase === 'reached_goal' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f172a] border border-green-500/40 rounded-xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="mx-auto bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">{t.goalReached || 'Training Completed! 🎉'}</h2>
            <p className="text-white/70 mb-2">
              {t.goalReachedDesc?.replace('{iter}', targetLoops.toString()) || `Completed ${targetLoops} training cycles.`}
            </p>
            <p className="text-white/40 text-sm mb-8">
              {t.accuracy || 'Model Accuracy'}: <strong className="text-green-400">{Math.round(currentAcc * 100)}%</strong>
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setHyperPhase('idle');
                  setStatusMsg('');
                  // Small delay then restart
                  setTimeout(() => startHyperTraining(), 500);
                }}
                className="w-full px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
              >
                {t.trainAgain || 'Train Again'}
              </button>
              <button
                onClick={() => {
                  setHyperPhase('idle');
                  setStatusMsg('');
                  setIteration(0);
                }}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg font-medium transition-colors border border-white/10"
              >
                {t.finishTraining || 'Finish (Stop)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
