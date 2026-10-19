/* ============================================================
   Ace — images.js · image intake: button, Ctrl+V paste, drag&drop
   Files are downscaled client-side (≤1024px, JPEG q0.85) so
   payloads stay small for Firestore + the vision API.
   ============================================================ */
"use strict";
window.Ace = window.Ace || {};
(function () {
  const I = { pending: [] };

  const $ = (id) => document.getElementById(id);

  function loadImage(src) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  }

  async function compact(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const MAX = Ace.IMG_MAX_DIM;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); // flatten transparency
      ctx.drawImage(img, 0, 0, w, h);
      const keepPng = file.type === "image/png" && c.toDataURL("image/png").length < 320000;
      return { dataUrl: c.toDataURL(keepPng ? "image/png" : "image/jpeg", 0.85), name: file.name || "image", w, h };
    } finally { URL.revokeObjectURL(url); }
  }

  async function attach(fileList) {
    const files = Array.from(fileList || []).filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    const room = Ace.MAX_IMAGES - I.pending.length;
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        const im = await compact(f);
        I.pending.push(im);
      } catch (e) { console.warn("image failed", e); }
    }
    if (files.length > room) Ace.UI.toast(`Max ${Ace.MAX_IMAGES} images per message`, "warn");
    renderChips();
    Ace.UI.resizeInput && Ace.UI.resizeInput();
  }

  function renderChips() {
    const row = $("attachRow");
    if (!row) return;
    row.innerHTML = "";
    row.classList.toggle("hidden", I.pending.length === 0);
    I.pending.forEach((im, i) => {
      const chip = Ace.el("div", "imgchip",
        `<img src="${im.dataUrl}" alt="${Ace.esc(im.name)}"><button class="imgchip-x" title="Remove">${Ace.ICON("close", 12)}</button>`);
      chip.querySelector(".imgchip-x").onclick = () => { I.pending.splice(i, 1); renderChips(); };
      chip.onclick = (e) => { if (!e.target.closest(".imgchip-x")) lightbox(im.dataUrl); };
      row.append(chip);
    });
  }

  function lightbox(dataUrl) {
    let lb = document.getElementById("lightbox");
    if (!lb) {
      lb = Ace.el("div", "lightbox"); lb.id = "lightbox";
      lb.innerHTML = `<img alt="preview"><button class="lightbox-x">${Ace.ICON("close", 20)}</button>`;
      lb.onclick = () => lb.classList.remove("show");
      document.body.append(lb);
    }
    lb.querySelector("img").src = dataUrl;
    lb.classList.add("show");
  }

  function init() {
    const input = $("fileInput"), btn = $("btnAttach");
    if (input) input.onchange = () => { attach(input.files); input.value = ""; };
    if (btn) btn.onclick = () => input && input.click();

    // Ctrl+V paste (works anywhere in the app when no modal is open)
    document.addEventListener("paste", (e) => {
      if (document.querySelector(".modal.show")) return;
      const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
      const imgs = items.filter(it => it.kind === "file" && /^image\//.test(it.type)).map(it => it.getAsFile());
      if (imgs.length) { e.preventDefault(); attach(imgs); }
    });

    // drag & drop overlay
    const ov = $("dropOverlay");
    let dragDepth = 0;
    window.addEventListener("dragenter", (e) => {
      if (!Array.from(e.dataTransfer.types || []).includes("Files")) return;
      dragDepth++; ov && ov.classList.add("show");
    });
    window.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) ov && ov.classList.remove("show");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault(); dragDepth = 0; ov && ov.classList.remove("show");
      if (document.querySelector(".modal.show")) return;
      attach(e.dataTransfer.files);
    });
  }

  I.attach = attach;
  I.renderChips = renderChips;
  I.lightbox = lightbox;
  I.init = init;
  Ace.Images = I;
})();
