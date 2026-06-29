import { getTranslations } from 'next-intl/server';
import AIEngineClient from '@/components/admin/AIEngineClient';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AIEnginePage() {
  const t = await getTranslations('admin');
  const supabase = createAdminClient();

  // Fetch ML Metrics
  const { data: mlMetrics } = await supabase
    .from('ml_metrics')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  const translations = {
    aiEngineStats: t('aiEngineStats', { fallback: 'AI Engine Analytics' }),
    accuracy: t('accuracy', { fallback: 'Model Accuracy' }),
    datasetSize: t('datasetSize', { fallback: 'Training Dataset' }),
    aiDesc: t('aiDesc', { fallback: 'Continuous learning performance tracking for predictive filtering.' }),
    aiActive: t('aiActive', { fallback: 'AI Filtering is ACTIVE' }),
    aiInactive: t('aiInactive', { fallback: 'Enable AI Filtering' }),
    hyperTrain: t('hyperTrain', { target: 1 }), // It will be replaced dynamically
    workerOffline: t('workerOffline', { fallback: 'Worker Offline — Cannot Train' }),
    workerDisconnected: t('workerDisconnected', { iter: '{iter}', fallback: 'Cycle {iter}: ⚠️ Worker disconnected! Please restart it...' }),
    workerWorking: t('workerWorking', { iter: '{iter}', state: '{state}', fallback: 'Cycle {iter}: ⚙️ Worker is running ({state})...' }),
    workerWaitingTrain: t('workerWaitingTrain', { iter: '{iter}', fallback: 'Cycle {iter}: ⏳ Waiting for training to complete...' }),
    workerWaitingPick: t('workerWaitingPick', { iter: '{iter}', fallback: 'Cycle {iter}: 📡 Waiting for Worker to pick up command...' }),
    workerError: t('workerError', { iter: '{iter}', fallback: 'Cycle {iter}: Connection error, retrying...' }),
    stopTraining: t('stopTraining', { iter: '{iter}', fallback: 'Stop training (Cycle {iter})' }),
    goalReached: t('goalReached', { fallback: 'Training Completed! 🎉' }),
    goalReachedDesc: t('goalReachedDesc', { iter: '{iter}', fallback: 'Completed {iter} training cycles.' }),
    trainAgain: t('trainAgain', { fallback: 'Train Again' }),
    finishTraining: t('finishTraining', { fallback: 'Finish (Stop)' }),
  };

  return <AIEngineClient t={translations} mlMetrics={mlMetrics || []} />;
}
