import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DEMO_FARMS, demoReply } from "../demo.js";
import "./standalone-demo.css";

const KEY = "agrilink_standalone_demo_v1";
const OFFERS = [
  { id: "fairprice", buyer: "FairPrice Fresh", price: 5.2, tons: 20, grade: "A" },
  { id: "mustafa", buyer: "Mustafa Centre Imports", price: 4.8, tons: 12, grade: "A" },
  { id: "sheng", buyer: "Sheng Siong Wholesale", price: 3.6, tons: 15, grade: "B" },
];
const initial = { farm: DEMO_FARMS["9876543210"], offer: null, quantity: 1, signed: false, reviewed: false };
const STEPS = [["farm", "Your farm"], ["offers", "Buyer offers"], ["agreement", "Agreement"], ["quality", "Quality check"], ["complete", "Confirmation"]];

export default function StandaloneDemo() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [data, setData] = useState(() => { try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) || "null") }; } catch { return initial; } });
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* demo also works without storage */ } }, [data]);
  const update = (patch) => setData((old) => ({ ...old, ...patch }));
  const go = (step) => { setNotice(""); nav(`/demo/${step}`); };
  const enter = (farm = data.farm) => { update({ farm }); go("farm"); };
  const login = pathname === "/" || pathname.startsWith("/login");
  const step = STEPS.find(([key]) => pathname === `/demo/${key}`)?.[0] || "farm";
  const total = data.offer ? Number(data.quantity) * 1000 * data.offer.price : 0;
  const download = () => {
    const text = `AGRILINK DEMO AGREEMENT\nSample only - no real trade, payment or blockchain transaction.\nFarmer: ${data.farm.name}\nBuyer: ${data.offer.buyer}\nQuantity: ${data.quantity} tonnes\nPrice: USD ${data.offer.price}/kg\nValue: USD ${total}\nDemo signature: ${data.signed ? "Completed" : "Pending"}\nDemo quality review: ${data.reviewed ? "Approved" : "Pending"}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "AgriLink-demo-agreement.txt"; a.click(); URL.revokeObjectURL(url);
    setNotice("Sample agreement downloaded.");
  };
  if (login) return <div className="welcome">
    <div className="walk-welcome"><h1>AgriLink</h1><h2>From your orchard<br />to a trusted buyer.</h2><p>Explore a complete mango trading journey in a few clicks.</p><span>Interactive demo · No account needed</span></div>
    <section className="welcome-panel"><div className="auth-card">
      <h1>Try the AgriLink demo</h1><p className="sub">Choose a sample farmer to start. No OTP or connection to a server is needed.</p>
      <div className="demo-logins">{Object.entries(DEMO_FARMS).map(([id, farm]) => <button className="demo-user" key={id} onClick={() => enter(farm)}><span className="demo-avatar">{farm.name.split(" ").map((s) => s[0]).join("")}</span><span><b>{farm.name}</b><small>{farm.farm.village} · {farm.farm.acres} acres · {farm.farm.trees} trees</small></span><span>→</span></button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (!/^\d{10}$/.test(mobile)) return setNotice("Enter a 10-digit demo number, or choose a profile above."); if (otp !== "1234") return setNotice("Use 1234 for this demo."); enter(); }}>
        <label>Demo mobile number<input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Any 10-digit number" /></label>
        <label>Demo OTP<input inputMode="numeric" maxLength={4} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="1234" /></label>
        <p role="status">{notice}</p><button className="btn big">Open demo</button>
      </form>
    </div></section>
  </div>;
  return <div className="walk-app">
    <aside className="walk-sidebar"><h2>🌱 AgriLink</h2><p>Sample trade walkthrough</p><nav>{STEPS.map(([key, label], i) => <button key={key} className={`chip ${step === key ? "on" : ""}`} onClick={() => go(key)}>{i + 1}. {label}</button>)}</nav><p>{data.farm.name}<br />{data.farm.farm.village}</p><button className="btn alt" onClick={() => nav("/login/farmer")}>Change demo profile</button></aside>
    <main className="walk-main"><div className="demo-toolbar"><span><b>Interactive demo</b> · Sample data. No real payments, messages or registrations.</span><button className="chip" onClick={() => { setData(initial); setConsent(false); setName(""); go("farm"); }}>Restart demo</button></div>
      {notice && <p className="insight" role="status">{notice}</p>}
      {step === "farm" && <><h1>Your farm at a glance</h1><p className="sub">Welcome, {data.farm.name}. Your sample farm is ready to explore.</p><div className="grid two"><div className="card"><h3>Alphonso mango orchard</h3><p>{data.farm.farm.village}, {data.farm.farm.district}</p><p><b>{data.farm.farm.acres} acres</b> · {data.farm.farm.trees} trees · {data.farm.farm.irrigation} irrigation</p><p>Sample export-ready supply: <b>6 tonnes</b></p><p>Sample harvest window: April–May 2027</p><button className="btn" onClick={() => go("offers")}>Explore buyer offers</button></div><div className="card"><h3>Ask Mitra</h3><p>Get sample guidance for this walkthrough.</p><form onSubmit={(e) => { e.preventDefault(); setReply(demoReply(question)); }}><input aria-label="Ask Mitra" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should I do today?" /><button className="btn" style={{ marginTop: 12 }}>Ask Mitra</button></form>{reply && <p role="status">{reply}</p>}</div></div></>}
      {step === "offers" && <><h1>Buyer offers</h1><p className="sub">Compare sample offers from Singapore buyers. Choose one to draft your agreement.</p><div className="offers-grid">{OFFERS.map((offer) => <div className="card" key={offer.id}><h3>{offer.buyer}</h3><p>Grade {offer.grade} · {offer.tons} tonnes requested</p><div className="bigprice">${offer.price.toFixed(2)}<small>/kg</small></div><p>Sample delivery: 10 May 2027</p><span className="pill p-good">{offer.price >= 5 ? "Above sample forecast" : "Within sample market range"}</span><p>Packaging and cold-chain collection coordinated by your FPO.</p><button className="btn" onClick={() => { update({ offer, signed: false, reviewed: false }); setConsent(false); go("agreement"); }}>Choose this offer</button></div>)}</div></>}
      {step === "agreement" && <><h1>Review and sign</h1>{!data.offer ? <div className="card"><p>Choose a buyer offer to start your agreement.</p><button className="btn" onClick={() => go("offers")}>Choose an offer</button></div> : <div className="card"><h3>Demo agreement · AGL-DEMO-001</h3><p>{data.farm.name} → {data.offer.buyer}</p><p>Alphonso · Grade {data.offer.grade} · ${data.offer.price.toFixed(2)}/kg</p><label>Quantity (tonnes)<input type="number" min="0.1" max="6" step="0.1" value={data.quantity} disabled={data.signed} onChange={(e) => update({ quantity: e.target.value })} /></label><p>Total sample value: <b>${total.toLocaleString("en-US")}</b></p><p>Delivery: 10 May 2027. Sample payment terms: 30% advance, 70% after receipt. Buyer acceptance is simulated.</p>{data.signed ? <><p className="insight">✓ Demo signature saved. Your agreement is ready for a sample quality check.</p><button className="btn" onClick={() => go("quality")}>Continue to quality check</button><button className="btn alt" onClick={download}>Download sample agreement</button></> : <form onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !consent || !(Number(data.quantity) > 0 && Number(data.quantity) <= 6)) return setNotice("Enter your name, choose 0.1–6 tonnes and confirm the demo signature."); update({ signed: true, quantity: Number(data.quantity) }); setNotice("Demo agreement signed successfully. No real contract or blockchain transaction was created."); }}><label>Your name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder={data.farm.name} /></label><label><input style={{ width: "auto" }} type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} /> I confirm this is a sample signature for the demo.</label><button className="btn">Sign demo agreement</button></form>}</div>}</>}
      {step === "quality" && <><h1>Sample quality check</h1>{!data.signed ? <div className="card"><p>Sign the sample agreement first.</p><button className="btn" onClick={() => go("agreement")}>Review agreement</button></div> : <div className="card"><h3>Demo mango batch · LOT-DEMO-001</h3><img src="/img/demo-mango.jpg" alt="Synthetic mango image for the demo" style={{ width: "100%", maxWidth: 360, borderRadius: 16 }} /><p>Generated sample image · Illustrative results</p><p>Sample grade: <b>A</b> · Sample quality score: <b>94/100</b></p><p>Packaging: export cartons. Fruit appearance and collection records are ready for a simulated consultant review.</p>{data.reviewed ? <><p className="insight">✓ Demo consultant approved this sample batch.</p><button className="btn" onClick={() => go("complete")}>View confirmation</button></> : <button className="btn" onClick={() => { update({ reviewed: true }); setNotice("Sample review approved. Your demo certificate is ready."); }}>Simulate consultant approval</button>}</div>}</>}
      {step === "complete" && <><h1>{data.reviewed && data.signed ? "Your demo trade is ready!" : "Finish your sample trade"}</h1>{data.reviewed && data.signed && data.offer ? <div className="card"><h2>✓ Walkthrough complete</h2><p>You selected an offer, signed a sample agreement and approved the sample quality review.</p><p><b>{data.quantity} tonnes</b> of Alphonso mangoes → <b>{data.offer.buyer}</b></p><p>Sample value: <b>${total.toLocaleString("en-US")}</b></p><p>Demo certificate: <b>AGL-DEMO-CERT-001</b></p><p>This confirmation is illustrative. No real money moved and no document was registered on a blockchain.</p><button className="btn" onClick={download}>Download sample agreement</button><button className="btn alt" onClick={() => go("farm")}>Back to farm</button></div> : <div className="card"><p>Complete the agreement and quality check to see the confirmation.</p><button className="btn" onClick={() => go(data.signed ? "quality" : data.offer ? "agreement" : "offers")}>Continue walkthrough</button></div>}</>}
    </main>
  </div>;
}
