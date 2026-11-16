import { useEffect, useState } from "react";
export default function TelegramButton({ className = "" }) {
  const [link, setLink] = useState(null);
  useEffect(() => { fetch("/api/telegram/bot").then((r) => r.ok ? r.json() : null).then((r) => setLink(r?.link || null)).catch(() => {}); }, []);
  return link ? <a className={`lp-btn light ${className}`} href={link} target="_blank" rel="noopener noreferrer">Chat on Telegram</a> : null;
}
