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
            <div className="inline-flex items-center gap-2 rounded-full border border-galaxy-primary/40 bg-galaxy-primary/10 px-4 py-2 text-sm font-medium text-violet-300 shadow-[0_0_18px_rgba(124,58,237,0.35)] backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse"></span>
              {t('heroPill')}
            </div>
            <h1 className="text-hero mx-auto mt-6 max-w-4xl text-5xl sm:text-6xl font-extrabold leading-[1.05] md:text-8xl tracking-tight pb-2">
              {t('heroTitle')}
            </h1>
          </FadeIn>

          <FadeIn direction="up" delay={0.2}>
            <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-white/85 font-medium leading-relaxed" style={{ textShadow: '0 2px 16px rgba(0,0,0,0.8)' }}>
              {t('heroSubtitle')}
            </p>
          </FadeIn>

          <FadeIn direction="up" delay={0.4}>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login" className="btn-primary">
                Start Now / Login <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                href="#why"
                className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/[0.07] px-8 py-3.5 font-medium text-white backdrop-blur-sm transition-all hover:bg-white/15 hover:border-white/30"
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
          <h2 className="text-gradient text-3xl md:text-5xl font-bold">{t('whyTitle')}</h2>
          <p className="mt-4 text-white/60 max-w-2xl mx-auto">{t('whySubtitle')}</p>
        </FadeIn>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            { icon: Zap, title: 'whyLightning', desc: 'whyLightningDesc' },
            { icon: Lock, title: 'whySecurity', desc: 'whySecurityDesc' },
            { icon: Globe, title: 'whyDevices', desc: 'whyDevicesDesc' }
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.1} direction="up" className="h-full">
              <div className="glass card-lift p-8 h-full flex flex-col rounded-2xl group">
                <div className="w-12 h-12 rounded-xl bg-galaxy-primary/15 ring-1 ring-galaxy-primary/30 flex items-center justify-center text-violet-300 mb-6 group-hover:scale-110 group-hover:ring-galaxy-primary/60 transition-all">
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
          <h2 className="text-gradient text-3xl md:text-5xl font-bold">{t('stepsTitle')}</h2>
          <p className="mt-4 text-white/60">{t('stepsSubtitle')}</p>
        </FadeIn>

        <div className="grid gap-6 md:grid-cols-3 relative">
          {[
            { num: '1', title: 'step1', desc: 'step1Desc' },
            { num: '2', title: 'step2', desc: 'step2Desc' },
            { num: '3', title: 'step3', desc: 'step3Desc' }
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 0.15} direction="up" className="h-full relative z-10">
              <div className="glass card-lift p-8 h-full flex flex-col rounded-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-galaxy-primary/5 rounded-bl-full -z-10 group-hover:bg-galaxy-primary/10 transition-colors"></div>
                <span className="pointer-events-none absolute -top-3 end-2 text-[90px] font-extrabold leading-none text-white/[0.04] select-none">{item.num}</span>
                <div className="w-10 h-10 rounded-full bg-galaxy-primary/20 ring-1 ring-galaxy-primary/40 text-violet-300 font-bold flex items-center justify-center mb-6">
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
          <h2 className="text-gradient text-3xl md:text-5xl font-bold">{t('serversTitle')}</h2>
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
              <div className={`glass card-lift p-6 h-full flex flex-col rounded-2xl transition-all ${item.border}`}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10">
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </span>
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
          <h2 className="text-gradient text-3xl md:text-4xl font-bold mb-10">{t('blocksTitle')}</h2>
        </FadeIn>

        <FadeIn direction="up" delay={0.2}>
          <Marquee speed={40} direction="left">
            {[
              { name: 'Instagram', domain: 'instagram.com' },
              { name: 'Facebook', domain: 'facebook.com' },
              { name: 'X (Twitter)', domain: 'x.com' },
              { name: 'LinkedIn', domain: 'linkedin.com' },
              { name: 'YouTube', domain: 'youtube.com' },
              { name: 'Spotify', domain: 'spotify.com' },
              { name: 'Discord', domain: 'discord.com' },
              { name: 'ChatGPT', domain: 'chatgpt.com' },
              { name: 'Gemini', domain: 'gemini.google.com' },
              { name: 'Claude', domain: 'claude.ai' },
              { name: 'Netflix', domain: 'netflix.com' },
              { name: 'Telegram', domain: 'web.telegram.org' },
              { name: 'WhatsApp', domain: 'whatsapp.com' },
              { name: 'TikTok', domain: 'tiktok.com' },
            ].map((app) => (
              <div key={app.name} className="glass px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors shrink-0">
                <img src={`https://www.google.com/s2/favicons?domain=${app.domain}&sz=64`} alt={app.name} width="20" height="20" loading="eager" decoding="async" className="rounded-sm" />
                {app.name}
              </div>
            ))}
          </Marquee>
        </FadeIn>

        <div className="h-4" />

        <FadeIn direction="up" delay={0.3}>
          <Marquee speed={45} direction="right">
            {[
              { name: 'Twitch', domain: 'twitch.tv' },
              { name: 'Reddit', domain: 'reddit.com' },
              { name: 'Snapchat', domain: 'snapchat.com' },
              { name: 'Pinterest', domain: 'pinterest.com' },
              { name: 'Signal', domain: 'signal.org' },
              { name: 'Steam', domain: 'steampowered.com' },
              { name: 'Hulu', domain: 'hulu.com' },
              { name: 'Disney+', domain: 'disneyplus.com' },
              { name: 'Amazon', domain: 'amazon.com' },
              { name: 'Slack', domain: 'slack.com' },
              { name: 'GitHub', domain: 'github.com' },
              { name: 'Google', domain: 'google.com' },
              { name: 'Zoom', domain: 'zoom.us' },
              { name: 'Viber', domain: 'viber.com' },
            ].map((app) => (
              <div key={app.name} className="glass px-5 py-3 rounded-full flex items-center gap-3 text-sm font-medium whitespace-nowrap hover:bg-white/10 transition-colors shrink-0">
                <img src={`https://www.google.com/s2/favicons?domain=${app.domain}&sz=64`} alt={app.name} width="20" height="20" loading="eager" decoding="async" className="rounded-sm" />
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
          <h2 className="text-gradient text-3xl md:text-4xl font-bold mb-10">{t('networkTitle')}</h2>
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
      <section id="plans" className="scroll-mt-24 px-4 max-w-5xl mx-auto w-full">
        <FadeIn direction="up">
          <PlansHeader />
        </FadeIn>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {PLANS.map((p, i) => (
            <FadeIn key={p.id} delay={i * 0.15} direction="up" className="h-full">
              <PlanCard plan={p} featured={p.id === 3} />
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
      <h2 className="text-gradient text-3xl md:text-5xl font-bold">{t('title')}</h2>
      <p className="mt-4 text-white/60 max-w-2xl mx-auto">{t('subtitle')}</p>
    </div>
  );
}

async function FAQHeader() {
  const t = await getTranslations('faq');
  return (
    <div className="text-center mb-10">
      <p className="text-sm font-bold tracking-widest text-galaxy-primary uppercase mb-3">FAQ</p>
      <h2 className="text-gradient text-3xl md:text-4xl font-bold">{t('title')}</h2>
      <p className="mt-3 text-white/70">{t('subtitle')}</p>
    </div>
  );
}
