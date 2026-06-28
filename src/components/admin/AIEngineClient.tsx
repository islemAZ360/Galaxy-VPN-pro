'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getGlobalLimits, updateGlobalLimits, requestSync, getAITrainingStatus } from '@/lib/admin-actions';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Zap, RefreshCw, StopCircle, PlayCircle, Trophy } from 'lucide-react';

interface AIEngineClientProps {
  t: Record<string, string>;
  mlMetrics: any[];
}

export default function AIEngineClient({ t, mlMetrics }: AIEngineClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [aiEnabled, setAiEnabled] = useState(false);
  
  // Hyper-Training State
  const [hyperStatus, setHyperStatus] = useState<'idle' | 'running' | 'reached_goal'>('idle');
  const [targetAccuracy, setTargetAccuracy] = useState(0.95);
  const [currentAcc, setCurrentAcc] = useState(mlMetrics && mlMetrics.length > 0 ? mlMetrics[0].accuracy : 0);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    getGlobalLimits().then(res => setAiEnabled(res.ai_filtering));
  }, []);

  const toggleAi = () => {
    const newVal = !aiEnabled;
    setAiEnabled(newVal); // Optimistic
    startTransition(async () => {
      await updateGlobalLimits({ ai_filtering: newVal });
    });
  };

  const startHyperTraining = () => {
    setHyperStatus('running');
  };

  const stopHyperTraining = () => {
    setHyperStatus('idle');
    if (pollInterval.current) clearInterval(pollInterval.current);
  };

  useEffect(() => {
    if (hyperStatus !== 'running') {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
        pollInterval.current = null;
      }
      return;
    }

    const checkAndTrigger = async () => {
      try {
        const { isBusy, accuracy } = await getAITrainingStatus();
        setCurrentAcc(accuracy);
        
        // Refresh UI data
        router.refresh();

        if (accuracy >= targetAccuracy) {
          setHyperStatus('reached_goal');
          return;
        }

        if (!isBusy) {
          // Trigger new scan
          await requestSync('wifi', 100, 100);
        }
      } catch (err) {
        console.error('Hyper-Training Error:', err);
      }
    };

    // Initial check immediately
    checkAndTrigger();

    // Poll every 10 seconds
    pollInterval.current = setInterval(checkAndTrigger, 10000);

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [hyperStatus, targetAccuracy, router]);

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

              {hyperStatus === 'idle' ? (
                <button 
                  onClick={startHyperTraining}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30"
                >
                  <PlayCircle className="h-4 w-4" />
                  Hyper-Train AI (Loop to {targetAccuracy * 100}%)
                </button>
              ) : hyperStatus === 'running' ? (
                <button 
                  onClick={stopHyperTraining}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                >
                  <StopCircle className="h-4 w-4" />
                  Stop Hyper-Training (Auto-Scanning...)
                  <RefreshCw className="h-4 w-4 animate-spin ml-2" />
                </button>
              ) : null}
            </div>
          </div>
          {mlMetrics && mlMetrics.length > 0 ? (
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-[0.65rem] uppercase tracking-wider text-white/40">{t.accuracy || 'Model Accuracy'}</div>
                <div className="text-xl font-bold text-yellow-400">
                  {Math.round(mlMetrics[0].accuracy * 100)}%
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

      {hyperStatus === 'reached_goal' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f172a] border border-green-500/40 rounded-xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="mx-auto bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Goal Reached!</h2>
            <p className="text-white/70 mb-8">
              The AI Engine has successfully reached <strong>{Math.round(currentAcc * 100)}%</strong> accuracy!
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setTargetAccuracy(0.99); // Increase target to 99%
                  setHyperStatus('running');
                }}
                className="w-full px-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
              >
                Continue Training to 99%
              </button>
              <button
                onClick={stopHyperTraining}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg font-medium transition-colors border border-white/10"
              >
                Complete Series (Stop)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
