import { useEffect, useState } from "react";
import { api } from "../services/api.js";

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api.settings.get()
      .then(setCfg)
      .catch((e) => setErr(e.message));
  }, []);
  if (err) return <div style={{ padding: 24 }}>Error: {err}</div>;
  if (!cfg) return <div style={{ padding: 24 }}>Loading…</div>;
  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h2>Settings / Model</h2>
      <p>VLM adapter: <b>{cfg.vlm_adapter}</b></p>
      <p>Provider: <b>{cfg.vlm_provider}</b></p>
      <p>Image input mode: <b>{cfg.image_input_mode}</b></p>
      <h3 style={{ marginTop: 16 }}>Models</h3>
      <ul>
        <li>Gemini: {cfg.gemini_model} {cfg.providers_configured.gemini ? "✅" : "❌"}</li>
        <li>OpenAI: {cfg.openai_model} {cfg.providers_configured.openai ? "✅" : "❌"}</li>
        <li>Anthropic: {cfg.anthropic_model} {cfg.providers_configured.anthropic ? "✅" : "❌"}</li>
        <li>Grok: {cfg.grok_model} {cfg.providers_configured.grok ? "✅" : "❌"}</li>
      </ul>
      <p style={{ marginTop: 16, color: "#7e828f", fontSize: 13 }}>
        API keys are configured server-side via environment variables (OMNISIGHT_*_API_KEY). They are never exposed to the browser.
      </p>
    </div>
  );
}
