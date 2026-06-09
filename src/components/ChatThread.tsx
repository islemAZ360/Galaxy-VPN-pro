'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/image';

type Msg = {
  id: string;
  sender: 'user' | 'admin';
  body: string | null;
  image_base64: string | null;
  created_at: string;
};

export function ChatThread({
  threadUserId,
  sender,
}: {
  threadUserId: string;
  sender: 'user' | 'admin';
}) {
  const t = useTranslations('support');
  const supabase = useRef(createClient()).current;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('support_messages')
        .select('id, sender, body, image_base64, created_at')
        .eq('user_id', threadUserId)
        .order('created_at', { ascending: true });
      if (active && data) setMessages(data as Msg[]);
    })();

    const channel = supabase
      .channel(`support:${threadUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${threadUserId}` },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === (payload.new as Msg).id) ? prev : [...prev, payload.new as Msg],
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, threadUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setImage(await compressImage(file));
  }

  async function send() {
    if (!text.trim() && !image) return;
    setBusy(true);
    const { error } = await supabase.from('support_messages').insert({
      user_id: threadUserId,
      sender,
      body: text.trim() || null,
      image_base64: image,
    });
    if (!error) {
      setText('');
      setImage(null);
    }
    setBusy(false);
  }

  return (
    <div className="flex h-[70vh] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-1">
        {messages.length === 0 && <p className="mt-8 text-center text-sm text-white/50">{t('empty')}</p>}
        {messages.map((m) => {
          const mine = m.sender === sender;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-2 ${
                  mine ? 'bg-galaxy-primary' : 'bg-white/10'
                }`}
              >
                <div className="mb-1 text-[10px] uppercase tracking-wide text-white/50">
                  {m.sender === 'admin' ? t('agent') : t('you')}
                </div>
                {m.image_base64 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image_base64} alt="" className="mb-1 max-h-60 rounded-lg" />
                )}
                {m.body && <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {image && (
        <div className="px-1 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="max-h-24 rounded-lg border border-white/10" />
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-3">
        <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/5" title={t('attach')}>
          📎
          <input type="file" accept="image/*" className="hidden" onChange={onFile} />
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={t('placeholder')}
          className="flex-1 rounded-lg border border-white/15 bg-galaxy-surface px-3 py-2 text-sm"
        />
        <button
          onClick={send}
          disabled={busy}
          className="rounded-lg bg-galaxy-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {t('send')}
        </button>
      </div>
    </div>
  );
}
