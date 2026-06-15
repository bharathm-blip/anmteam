import { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { theme, COMPANY } from "./theme";
import { ANMLogo, Button, Input } from "./ui";

export function LoginScreen() {
  const { login, sendResetEmail } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState(false);
  const [mode, setMode]         = useState("login"); // login | forgot
  const [msg, setMsg]           = useState("");

  const handleLogin = async () => {
    setErr(""); setBusy(true);
    const { error } = await login(email.trim(), password);
    setBusy(false);
    if (error) setErr(error.message || "Login failed. Check your credentials.");
  };

  const handleForgot = async () => {
    setErr(""); setMsg(""); setBusy(true);
    const { error } = await sendResetEmail(email.trim());
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Password reset link sent! Check your email inbox.");
  };

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg, ${theme.navy} 0%, ${theme.navyMid} 100%)`, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Brand */}
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}><ANMLogo size={56} /></div>
          <div style={{ fontWeight:800, fontSize:20, color:"#fff", letterSpacing:-0.3 }}>{COMPANY.name}</div>
          <div style={{ fontSize:12, color:"#9AA3BF", marginTop:4 }}>{COMPANY.tagline}</div>
        </div>

        {/* Card */}
        <div style={{ background:"#fff", borderRadius:18, padding:32, boxShadow:"0 24px 60px #00000033" }}>
          <div style={{ fontWeight:700, fontSize:18, color:theme.text, marginBottom:4 }}>
            {mode === "login" ? "Sign in to your account" : "Reset your password"}
          </div>
          <div style={{ fontSize:13, color:theme.muted, marginBottom:24 }}>
            {mode === "login" ? "Leave & Expense Portal" : "We'll email you a reset link"}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="you@anmoffice.in" />
            {mode === "login" && (
              <Input label="Password" type="password" value={password} onChange={setPassword} placeholder="Enter your password" />
            )}

            {err && <div style={{ fontSize:13, color:theme.red, background:theme.redBg, padding:"8px 12px", borderRadius:8 }}>{err}</div>}
            {msg && <div style={{ fontSize:13, color:theme.green, background:theme.greenBg, padding:"8px 12px", borderRadius:8 }}>{msg}</div>}

            {mode === "login" ? (
              <>
                <Button onClick={handleLogin} disabled={busy || !email || !password} style={{ width:"100%", padding:"12px" }}>
                  {busy ? "Signing in…" : "Sign In"}
                </Button>
                <button onClick={() => { setMode("forgot"); setErr(""); }} style={{ background:"none", border:"none", color:theme.accent, fontSize:13, cursor:"pointer", fontWeight:600 }}>
                  Forgot password?
                </button>
              </>
            ) : (
              <>
                <Button onClick={handleForgot} disabled={busy || !email} style={{ width:"100%", padding:"12px" }}>
                  {busy ? "Sending…" : "Send Reset Link"}
                </Button>
                <button onClick={() => { setMode("login"); setErr(""); setMsg(""); }} style={{ background:"none", border:"none", color:theme.muted, fontSize:13, cursor:"pointer", fontWeight:600 }}>
                  ← Back to sign in
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:"#6B7599" }}>
          © 2026 {COMPANY.name} · {COMPANY.credits}
        </div>
      </div>
    </div>
  );
}

// First-login / forced password reset
export function PasswordResetScreen() {
  const { resetPassword, logout, profile } = useAuth();
  const [pw, setPw]       = useState("");
  const [pw2, setPw2]     = useState("");
  const [err, setErr]     = useState("");
  const [busy, setBusy]   = useState(false);

  const handle = async () => {
    setErr("");
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw !== pw2)    { setErr("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await resetPassword(pw);
    setBusy(false);
    if (error) setErr(error.message);
  };

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg, ${theme.navy}, ${theme.navyMid})`, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}><ANMLogo size={48} /></div>
          <div style={{ fontWeight:800, fontSize:18, color:"#fff" }}>Welcome, {profile?.name?.split(" ")[0]} 👋</div>
        </div>
        <div style={{ background:"#fff", borderRadius:18, padding:32, boxShadow:"0 24px 60px #00000033" }}>
          <div style={{ fontWeight:700, fontSize:17, color:theme.text, marginBottom:4 }}>Set a new password</div>
          <div style={{ fontSize:13, color:theme.muted, marginBottom:24 }}>For security, please change your default password before continuing.</div>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <Input label="New Password" type="password" value={pw} onChange={setPw} placeholder="At least 6 characters" />
            <Input label="Confirm Password" type="password" value={pw2} onChange={setPw2} placeholder="Re-enter password" />
            {err && <div style={{ fontSize:13, color:theme.red, background:theme.redBg, padding:"8px 12px", borderRadius:8 }}>{err}</div>}
            <Button onClick={handle} disabled={busy || !pw || !pw2} style={{ width:"100%", padding:"12px" }}>
              {busy ? "Saving…" : "Set Password & Continue"}
            </Button>
            <button onClick={logout} style={{ background:"none", border:"none", color:theme.muted, fontSize:13, cursor:"pointer" }}>Sign out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
