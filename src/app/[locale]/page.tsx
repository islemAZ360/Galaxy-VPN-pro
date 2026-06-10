import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { PLANS } from '@/lib/plans';
import { COUNTRIES } from '@/lib/countries';
import { PlanCard } from '@/components/PlanCard';
import Image from 'next/image';
import { FadeIn } from '@/components/FadeIn';
import { Zap, Lock, Globe, CheckCircle, ShieldCheck, ArrowRight, PlaySquare, Smartphone, Download, MapPin, HelpCircle } from 'lucide-react';
import FloatingLines from '@/components/FloatingLines';
import Marquee from '@/components/Marquee';
import { FAQ } from '@/components/FAQ';

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
        <div className="absolute inset-0 z-0">
          <FloatingLines
            enabledWaves={['top', 'middle', 'bottom']}
            lineCount={[10, 15, 20]}
            lineDistance={[8, 6, 4]}
            bendRadius={5.0}
            bendStrength={-0.5}
            interactive={true}
            parallax={true}
          />
          {/* Original gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a1a]/80 via-transparent to-[#0a0a1a]" />
        </div>

        <div className="relative z-10">
          <FadeIn direction="up">
            <div className="inline-flex items-center gap-2 rounded-full border border-galaxy-primary/30 bg-galaxy-primary/10 px-4 py-2 text-sm font-medium text-galaxy-primary shadow-[0_0_15px_rgba(34,211,238,0.2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-galaxy-primary animate-pulse"></span>
              {t('heroPill')}
            </div>
            <h1 className="mx-auto max-w-4xl text-6xl font-bold leading-tight md:text-8xl tracking-tight text-white" style={{ textShadow: '1px 1px 0 #0f172a, -1px -1px 0 #0f172a, 1px -1px 0 #0f172a, -1px 1px 0 #0f172a, 0 4px 30px rgba(0,0,0,0.8)' }}>
              {t('heroTitle')}
            </h1>
          </FadeIn>
          
          <FadeIn direction="up" delay={0.2}>
            <p className="mx-auto mt-8 max-w-2xl text-lg text-white font-medium leading-relaxed" style={{ textShadow: '1px 1px 0 #0f172a, -1px -1px 0 #0f172a, 1px -1px 0 #0f172a, -1px 1px 0 #0f172a, 0 2px 20px rgba(0,0,0,0.8)' }}>
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
        </div>
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
      <section className="w-full text-center overflow-hidden">
        <FadeIn direction="up">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('blocksLabel')}</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-10">{t('blocksTitle')}</h2>
        </FadeIn>

        <FadeIn direction="up" delay={0.2}>
          <Marquee speed={40} direction="left">
            {[
              { name: 'Instagram', icon: 'instagram', color: '#E4405F' },
              { name: 'Facebook', icon: 'facebook', color: '#1877F2' },
              { name: 'X (Twitter)', icon: 'x', color: '#ffffff' },
              { name: 'LinkedIn', icon: 'linkedin', color: '#0A66C2' },
              { name: 'YouTube', icon: 'youtube', color: '#FF0000' },
              { name: 'Spotify', icon: 'spotify', color: '#1DB954' },
              { name: 'Discord', icon: 'discord', color: '#5865F2' },
              { name: 'ChatGPT', icon: 'openai', color: '#412991' },
              { name: 'Gemini', icon: 'googlegemini', color: '#8E75B2' },
              { name: 'Claude', icon: 'anthropic', color: '#D4A574' },
              { name: 'Netflix', icon: 'netflix', color: '#E50914' },
              { name: 'Telegram', icon: 'telegram', color: '#26A5E4' },
              { name: 'WhatsApp', icon: 'whatsapp', color: '#25D366' },
              { name: 'TikTok', icon: 'tiktok', color: '#ffffff' },
            ].map((app) => (
              <div key={app.name} className="glass px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors shrink-0">
                <img src={`https://cdn.simpleicons.org/${app.icon}/${app.color.replace('#', '')}`} alt={app.name} width="20" height="20" loading="eager" decoding="async" />
                {app.name}
              </div>
            ))}
          </Marquee>
        </FadeIn>

        <div className="h-4" />

        <FadeIn direction="up" delay={0.3}>
          <Marquee speed={45} direction="right">
            {[
              { name: 'Twitch', icon: 'twitch', color: '#9146FF' },
              { name: 'Reddit', icon: 'reddit', color: '#FF4500' },
              { name: 'Snapchat', icon: 'snapchat', color: '#FFFC00' },
              { name: 'Pinterest', icon: 'pinterest', color: '#BD081C' },
              { name: 'Signal', icon: 'signal', color: '#3A76F0' },
              { name: 'Steam', icon: 'steam', color: '#ffffff' },
              { name: 'Hulu', icon: 'hulu', color: '#1CE783' },
              { name: 'Disney+', icon: 'disneyplus', color: '#113CCF' },
              { name: 'Amazon', icon: 'amazon', color: '#FF9900' },
              { name: 'Slack', icon: 'slack', color: '#4A154B' },
              { name: 'GitHub', icon: 'github', color: '#ffffff' },
              { name: 'Google', icon: 'google', color: '#4285F4' },
              { name: 'Zoom', icon: 'zoom', color: '#0B5CFF' },
              { name: 'Viber', icon: 'viber', color: '#7360F2' },
            ].map((app) => (
              <div key={app.name} className="glass px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors shrink-0">
                <img src={`https://cdn.simpleicons.org/${app.icon}/${app.color.replace('#', '')}`} alt={app.name} width="20" height="20" loading="eager" decoding="async" />
                {app.name}
              </div>
            ))}
          </Marquee>
        </FadeIn>
      </section>

      {/* Global Network */}
      <section className="w-full text-center overflow-hidden">
        <FadeIn direction="up">
          <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">{t('networkLabel')}</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-10">{t('networkTitle')}</h2>
        </FadeIn>

        <FadeIn direction="up" delay={0.2}>
          <Marquee speed={350} direction="left">
            {COUNTRIES.slice(0, Math.ceil(COUNTRIES.length / 2)).map((c) => (
              <div key={c.code} className="glass px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors shrink-0">
                <img src={`https://flagcdn.com/${c.code}.svg`} alt={c.name} width="20" height="15" className="rounded-[2px]" loading="eager" decoding="async" />
                {c.name}
              </div>
            ))}
          </Marquee>
        </FadeIn>

        <div className="h-4" />

        <FadeIn direction="up" delay={0.3}>
          <Marquee speed={400} direction="right">
            {COUNTRIES.slice(Math.ceil(COUNTRIES.length / 2)).map((c) => (
              <div key={c.code} className="glass px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors shrink-0">
                <img src={`https://flagcdn.com/${c.code}.svg`} alt={c.name} width="20" height="15" className="rounded-[2px]" loading="eager" decoding="async" />
                {c.name}
              </div>
            ))}
          </Marquee>
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

      {/* FAQ Section */}
      <section id="faq" className="scroll-mt-24 px-4 max-w-6xl mx-auto w-full">
        <FadeIn direction="up">
          <FAQHeader />
        </FadeIn>
        <FadeIn direction="up" delay={0.2}>
          <FAQ />
        </FadeIn>
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

async function FAQHeader() {
  const t = await getTranslations('faq');
  return (
    <div className="text-center mb-10">
      <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">FAQ</p>
      <h2 className="text-3xl md:text-4xl font-bold">{t('title')}</h2>
      <p className="mt-3 text-white/70">{t('subtitle')}</p>
    </div>
  );
}
