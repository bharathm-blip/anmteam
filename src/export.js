

// ── CSV / Excel export ───────────────────────────────────────────────────────
export function exportCSV(title, columns, rows, rangeLabel, COMPANY = {}) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [];
  lines.push([COMPANY.name||"M/s A Narasimha Murthy & Co."].map(esc).join(","));
  lines.push([title + " — " + rangeLabel].map(esc).join(","));
  lines.push("");
  lines.push(columns.map(esc).join(","));
  rows.forEach((r) => lines.push(r.map(esc).join(",")));
  const csv = lines.join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/\s+/g, "_")}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF export (via print window — no external library needed) ───────────────
export function exportPDF(title, columns, rows, rangeLabel, COMPANY = {}) {
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow popups to export PDF."); return; }

  const tableHead = columns.map((c) => `<th>${c}</th>`).join("");
  const tableBody = rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell, j) => {
            let val = String(cell ?? "");
            if (columns[j] === "Amount") val = "₹" + Number(cell).toLocaleString("en-IN");
            return `<td>${val}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  win.document.write(`
    <!doctype html><html><head><title>${title}</title>
    <style>
      * { font-family: 'Segoe UI', Arial, sans-serif; }
      body { padding: 32px; color: #1C1A16; }
      .head { border-bottom: 3px solid #B8851E; padding-bottom: 14px; margin-bottom: 20px; }
      .logo { display:inline-block; background:#B8851E; color:#fff; font-weight:900; padding:8px 12px; border-radius:8px; font-family:Georgia,serif; margin-right:12px; }
      h1 { font-size: 18px; margin: 0; display:inline-block; vertical-align:middle; }
      .sub { color:#7A7060; font-size:13px; margin-top:6px; }
      .meta { color:#7A7060; font-size:13px; margin:10px 0 20px; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th { background:#1A2240; color:#fff; padding:8px 10px; text-align:left; }
      td { padding:7px 10px; border-bottom:1px solid #E2DDD4; }
      tr:nth-child(even) td { background:#F5F4F0; }
      .footer { margin-top:24px; padding-top:12px; border-top:1px solid #E2DDD4; font-size:11px; color:#7A7060; display:flex; justify-content:space-between; }
      @media print { .noprint { display:none; } }
    </style></head><body>
      <div class="head">
        <span class="logo">ANM</span><h1>${COMPANY.name}</h1>
        <div class="sub">${COMPANY.tagline || ""}</div>
      </div>
      <h2 style="font-size:16px;margin:0 0 4px;">${title}</h2>
      <div class="meta">Period: ${rangeLabel} &nbsp;·&nbsp; ${rows.length} record(s) &nbsp;·&nbsp; Generated: ${new Date().toLocaleString("en-IN")}</div>
      <table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody || `<tr><td colspan="${columns.length}" style="text-align:center;padding:20px;">No records</td></tr>`}</tbody></table>
      <div class="footer"><span>${COMPANY.address || ""}</span><span>${COMPANY.phone || ""}</span></div>
      <div class="noprint" style="margin-top:24px;text-align:center;">
        <button onclick="window.print()" style="background:#B8851E;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">🖨 Print / Save as PDF</button>
      </div>
      <script>setTimeout(()=>window.print(),400);</script>
    </body></html>
  `);
  win.document.close();
}
