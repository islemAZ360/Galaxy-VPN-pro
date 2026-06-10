import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PLANS } from '@/lib/plans';
import { PlanCard } from '@/components/PlanCard';
import { FadeIn } from '@/components/FadeIn';
import { Zap, Lock, Globe, CheckCircle, ShieldCheck, ArrowRight, PlaySquare, Smartphone, Download, MapPin } from 'lucide-react';
import FloatingLines from '@/components/FloatingLines';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  return (
    <div className="flex flex-col gap-32 pt-16 pb-24 overflow-x-hidden relative">
      {/* Hero Section */}
      <section className="relative text-center mt-12 px-4">
        {/* FloatingLines Background - rounded rectangle behind hero */}
        <div className="absolute inset-0 -z-10 mx-auto max-w-6xl overflow-hidden rounded-3xl" style={{ top: '-2rem', bottom: '-2rem' }}>
          <FloatingLines
            enabledWaves={['top', 'middle', 'bottom']}
            lineCount={[10, 15, 20]}
            lineDistance={[8, 6, 4]}
            bendRadius={5.0}
            bendStrength={-0.5}
            interactive={true}
            parallax={true}
          />
        </div>

        <FadeIn direction="up">
          <div className="inline-flex items-center gap-2 rounded-full border border-galaxy-primary/30 bg-galaxy-primary/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-galaxy-primary uppercase shadow-[0_0_15px_rgba(34,211,238,0.15)] backdrop-blur-sm mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-galaxy-primary animate-pulse"></span>
            {t('heroPill')}
          </div>
          <h1 className="mx-auto max-w-4xl text-6xl font-bold leading-tight md:text-8xl tracking-tight text-white" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(0,0,0,0.5)' }}>
            {t('heroTitle')}
          </h1>
        </FadeIn>
        
        <FadeIn direction="up" delay={0.2}>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-white leading-relaxed" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 20px rgba(0,0,0,0.7)' }}>
            {t('heroSubtitle')}
          </p>
        </FadeIn>
        
        <FadeIn direction="up" delay={0.4}>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-xl bg-galaxy-primary px-8 py-3.5 font-bold text-black shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:bg-white hover:shadow-[0_0_25px_rgba(255,255,255,0.5)] hover:-translate-y-0.5"
            >
              Start Now / Login <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#why"
              className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-8 py-3.5 font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              Learn More
            </Link>
          </div>
        </FadeIn>

        <FadeIn direction="up" delay={0.6}>
          <div className="mt-12 flex flex-wrap justify-center gap-8 text-sm font-medium text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9)' }}>
            <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-galaxy-primary" /> {t('heroBottom1')}</div>
            <div className="flex items-center gap-2"><Zap className="w-4 h-4 text-galaxy-primary" /> {t('heroBottom2')}</div>
            <div className="flex items-center gap-2"><Lock className="w-4 h-4 text-galaxy-primary" /> {t('heroBottom3')}</div>
          </div>
        </FadeIn>
      </section>

      {/* Why GalaxyVPN */}
      <section id="why" className="px-4 max-w-6xl mx-auto w-full scroll-mt-24">
        <FadeIn direction="up" className="text-center mb-12">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('whyLabel')}</p>
          <h2 className="text-3xl md:text-5xl font-bold">{t('whyTitle')}</h2>
          <p className="mt-4 text-white/60 max-w-2xl mx-auto">{t('whySubtitle')}</p>
        </FadeIn>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Zap, title: 'whyLightning', desc: 'whyLightningDesc' },
            { icon: Lock, title: 'whySecurity', desc: 'whySecurityDesc' },
            { icon: Globe, title: 'whyDevices', desc: 'whyDevicesDesc' }
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.1} direction="up" className="h-full">
              <div className="glass p-8 h-full flex flex-col rounded-2xl hover:border-galaxy-primary/30 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-galaxy-primary/10 flex items-center justify-center text-galaxy-primary mb-6 group-hover:scale-110 transition-transform">
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{t(item.title)}</h3>
                <p className="text-white/60 leading-relaxed flex-grow">{t(item.desc)}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 max-w-5xl mx-auto w-full">
        <FadeIn direction="up" className="text-center mb-12">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('stepsLabel')}</p>
          <h2 className="text-3xl md:text-5xl font-bold">{t('stepsTitle')}</h2>
          <p className="mt-4 text-white/60">{t('stepsSubtitle')}</p>
        </FadeIn>

        <div className="grid gap-6 md:grid-cols-3 relative">
          {[
            { num: '1', title: 'step1', desc: 'step1Desc' },
            { num: '2', title: 'step2', desc: 'step2Desc' },
            { num: '3', title: 'step3', desc: 'step3Desc' }
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15} direction="up" className="h-full relative z-10">
              <div className="glass p-8 h-full flex flex-col rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-galaxy-primary/5 rounded-bl-full -z-10 group-hover:bg-galaxy-primary/10 transition-colors"></div>
                <div className="w-10 h-10 rounded-full bg-galaxy-primary/20 text-galaxy-primary font-bold flex items-center justify-center mb-6">
                  {item.num}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{t(item.title)}</h3>
                <p className="text-white/60 leading-relaxed">{t(item.desc)}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Specialized Servers */}
      <section className="px-4 max-w-6xl mx-auto w-full">
        <FadeIn direction="up" className="text-center mb-12">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('serversLabel')}</p>
          <h2 className="text-3xl md:text-5xl font-bold">{t('serversTitle')}</h2>
          <p className="mt-4 text-white/60 max-w-2xl mx-auto">{t('serversSubtitle')}</p>
        </FadeIn>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: PlaySquare, title: 'serverYoutube', desc: 'serverYoutubeDesc', color: 'text-red-400', border: 'hover:border-red-400/50' },
            { icon: Zap, title: 'serverGemini', desc: 'serverGeminiDesc', color: 'text-blue-400', border: 'hover:border-blue-400/50' },
            { icon: Smartphone, title: 'serverLTE', desc: 'serverLTEDesc', color: 'text-orange-400', border: 'hover:border-orange-400/50' },
            { icon: ShieldCheck, title: 'serverRussia', desc: 'serverRussiaDesc', color: 'text-red-500', border: 'hover:border-red-500/50' },
            { icon: Download, title: 'serverTorrent', desc: 'serverTorrentDesc', color: 'text-emerald-400', border: 'hover:border-emerald-400/50' }
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.1} direction="up" className="h-full">
              <div className={`glass p-6 h-full flex flex-col rounded-2xl transition-all ${item.border}`}>
                <div className="flex items-center gap-3 mb-4">
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                  <h3 className="text-lg font-bold text-white">{t(item.title)}</h3>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">{t(item.desc)}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* No More Blocks */}
      <section className="px-4 max-w-4xl mx-auto w-full text-center">
        <FadeIn direction="up">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('blocksLabel')}</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-8">{t('blocksTitle')}</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {['Spotify', 'ChatGPT', 'Gemini', 'Claude', 'Discord', 'Instagram', 'Telegram', 'YouTube'].map((app, i) => (
              <div key={app} className="glass px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium hover:bg-white/5 transition-colors">
                <CheckCircle className="w-4 h-4 text-galaxy-primary" /> {app}
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* Global Network */}
      <section className="px-4 max-w-5xl mx-auto w-full text-center">
        <FadeIn direction="up">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('networkLabel')}</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-8">{t('networkTitle')}</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {['Netherlands', 'Turkey', 'Russia', 'Finland', 'Germany', 'France', 'USA'].map((country, i) => (
              <div key={country} className="glass px-6 py-3 rounded-full flex items-center gap-2 text-sm font-medium hover:border-galaxy-primary/30 transition-colors">
                <MapPin className="w-4 h-4 text-galaxy-primary" /> {country}
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* Plans Section */}
      <section id="plans" className="scroll-mt-24 px-4 max-w-6xl mx-auto w-full">
        <FadeIn direction="up">
          <PlansHeader />
        </FadeIn>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p, i) => (
            <FadeIn key={p.id} delay={i * 0.15} direction="up" className="h-full">
              <PlanCard plan={p} featured={p.id === 3} href="/login" />
            </FadeIn>
          ))}
        </div>
      </section>
    </div>
  );
}

async function PlansHeader() {
  const t = await getTranslations('plans');
  return (
    <div className="text-center">
      <h2 className="text-3xl font-bold">{t('title')}</h2>
      <p className="mt-3 text-white/70">{t('subtitle')}</p>
    </div>
  );
}
