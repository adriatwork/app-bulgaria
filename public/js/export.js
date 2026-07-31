/* Bulgària 2026 · Exportació de documents
   PDF: obre una finestra amb estils d'impressió i deixa que el navegador
        el guardi com a PDF (funciona a mòbil i escriptori, sense llibreries).
   Word: genera un fitxer .doc amb HTML (Word i Google Docs l'obren bé). */

(function () {
  const esc = (s) => String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const DOC_CSS = `
    body { font-family: Georgia, "Times New Roman", serif; color: #22201c; line-height: 1.6;
           max-width: 780px; margin: 0 auto; padding: 32px 28px; }
    h1 { font-size: 26pt; margin: 0 0 4px; color: #1f5c45; }
    h2 { font-size: 15pt; margin: 26px 0 8px; color: #1f5c45;
         border-bottom: 1.5px solid #d8cfbe; padding-bottom: 4px; }
    h3 { font-size: 12pt; margin: 16px 0 4px; }
    .sub { color: #6b6357; font-size: 10pt; margin-bottom: 18px; }
    .entry { margin: 0 0 18px; padding: 12px 14px; background: #fbf7f0;
             border-left: 3px solid #c9932c; page-break-inside: avoid; }
    .meta { font-size: 9pt; color: #8a8175; margin-bottom: 6px; }
    .txt { white-space: pre-wrap; font-size: 11pt; }
    .imgs { margin-top: 10px; }
    .imgs img { max-width: 320px; max-height: 240px; margin: 6px 8px 0 0; border-radius: 4px; }
    table { border-collapse: collapse; width: 100%; font-size: 10pt; margin-top: 8px; }
    th, td { border: 1px solid #d8cfbe; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #e4efe7; }
    .stars { color: #c9932c; letter-spacing: 1px; }
    .foot { margin-top: 30px; font-size: 9pt; color: #9a9184; text-align: center; }
    @page { margin: 18mm; }
    @media print { .noprint { display: none !important; } }
  `;

  function buildHtml(title, subtitle, bodyHtml) {
    return `<!DOCTYPE html><html lang="ca"><head><meta charset="UTF-8" />
<title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>
<h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div>
${bodyHtml}
<div class="foot">Generat des de l'app Bulgària 2026 🌹</div>
</body></html>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function toWord(title, subtitle, bodyHtml, filename) {
    const html = buildHtml(title, subtitle, bodyHtml);
    // El prefix MS Office fa que Word l'obri amb el format correcte.
    const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
${html.replace(/^<!DOCTYPE html>/, "").replace(/^<html[^>]*>/, "")}`;
    downloadBlob(new Blob(["\ufeff" + doc], { type: "application/msword;charset=utf-8" }), filename);
  }

  function toPdf(title, subtitle, bodyHtml) {
    const html = buildHtml(title, subtitle, bodyHtml);
    const win = window.open("", "_blank");
    if (!win) {
      alert("El navegador ha bloquejat la finestra. Permet les finestres emergents per descarregar el PDF.");
      return;
    }
    win.document.write(html + `<script>
      window.onload = function () { setTimeout(function () { window.print(); }, 400); };
    <\/script>`);
    win.document.close();
  }

  function toHtmlFile(title, subtitle, bodyHtml, filename) {
    downloadBlob(new Blob([buildHtml(title, subtitle, bodyHtml)], { type: "text/html;charset=utf-8" }), filename);
  }

  /* ---------------- cossos de document ---------------- */

  function diaryBody(days, entriesByDay, userLabel, fmtWhen) {
    const parts = [];
    let count = 0;
    days.forEach((d) => {
      const list = entriesByDay[d.day] || [];
      if (!list.length) return;
      parts.push(`<h2>Dia ${d.day} · ${esc(d.title)}</h2>`);
      parts.push(`<div class="meta">${esc(d.dateLabel)} · ${esc(d.area)}</div>`);
      list.forEach((e) => {
        count++;
        const imgs = (e.images || []).map((src) => `<img src="${src}" />`).join("");
        parts.push(`<div class="entry">
          <div class="meta">${esc(fmtWhen(e.createdAt))}${e.edited ? " · editat" : ""}</div>
          <div class="txt">${esc(e.text)}</div>
          ${imgs ? `<div class="imgs">${imgs}</div>` : ""}
        </div>`);
      });
    });
    if (!count) parts.push(`<p><i>Encara no hi ha cap nota al diari.</i></p>`);
    return `<div class="sub">Diari de ${esc(userLabel)} · ${count} ${count === 1 ? "nota" : "notes"}</div>` + parts.join("\n");
  }

  function itineraryBody(trip, days) {
    const parts = [];
    days.forEach((d) => {
      parts.push(`<h2>Dia ${d.day} · ${esc(d.title)}</h2>`);
      parts.push(`<div class="meta">${esc(d.dateLabel)} · 📍 ${esc(d.area)}</div>`);
      if (d.summary) parts.push(`<p class="txt">${esc(d.summary)}</p>`);
      if (d.schedule?.length) {
        parts.push(`<table><tr><th style="width:90px">Moment</th><th>Pla</th><th>Detalls</th></tr>` +
          d.schedule.map((s) => `<tr><td>${esc(s.moment)}</td><td>${esc(s.plan)}</td><td>${esc(s.details || "")}</td></tr>`).join("") +
          `</table>`);
      }
      if (d.hotel?.name) parts.push(`<h3>On dormim</h3><p class="txt">${esc(d.hotel.name)}${d.hotel.address ? " — " + esc(d.hotel.address) : ""}</p>`);
      if (d.activities?.length) {
        parts.push(`<h3>Activitats</h3><ul>` + d.activities.map((a) => `<li>${esc(a.text)}</li>`).join("") + `</ul>`);
      }
    });
    return `<div class="sub">${esc(trip.subtitle || "")}</div>` + parts.join("\n");
  }

  function foodBody(items, foodState, userLabel, typeLabels) {
    const tasted = items.filter((i) => foodState[i.id]?.tasted);
    const rows = tasted.map((i) => {
      const st = foodState[i.id] || {};
      const stars = "★".repeat(st.stars || 0) + "☆".repeat(5 - (st.stars || 0));
      return `<tr><td><b>${esc(i.name)}</b><br /><span class="meta">${esc(i.nameBg)}</span></td>
        <td>${esc(typeLabels[i.type] || i.type)}</td><td>${esc(i.region)}</td>
        <td class="stars">${stars}</td><td>${esc(st.notes || "")}</td></tr>`;
    }).join("");
    const avg = tasted.length
      ? (tasted.reduce((s, i) => s + (foodState[i.id]?.stars || 0), 0) / tasted.length).toFixed(1)
      : "—";
    const best = [...tasted].sort((a, b) => (foodState[b.id]?.stars || 0) - (foodState[a.id]?.stars || 0))[0];
    return `<div class="sub">Passaport de ${esc(userLabel)} · ${tasted.length} de ${items.length} tastats · nota mitjana ${avg}/5</div>
      ${best ? `<p class="txt"><b>🏆 Plat preferit:</b> ${esc(best.name)} (${"★".repeat(foodState[best.id]?.stars || 0)})</p>` : ""}
      ${tasted.length ? `<h2>Tot el que hem tastat</h2>
      <table><tr><th>Plat</th><th>Tipus</th><th>Regió</th><th>Nota</th><th>Comentaris</th></tr>${rows}</table>`
        : `<p><i>Encara no has marcat cap plat com a tastat.</i></p>`}`;
  }

  window.TripExport = { toPdf, toWord, toHtmlFile, diaryBody, itineraryBody, foodBody, esc };
})();
