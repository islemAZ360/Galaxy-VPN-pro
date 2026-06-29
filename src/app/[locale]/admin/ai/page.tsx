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
    hyperTrain: t('hyperTrain', { target: 95 }),
    workerOffline: t('workerOffline', { fallback: 'Worker Offline — Cannot Train' }),
  };

  return <AIEngineClient t={translations} mlMetrics={mlMetrics || []} />;
}
