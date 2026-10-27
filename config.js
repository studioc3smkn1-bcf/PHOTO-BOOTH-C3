/* ===================== PENGATURAN (isi sekali di sini) =====================
   Dipakai oleh galeri.html, qr.html, dan editor.html.
   Nilainya sama dengan yang dipakai website tiket Studio C3 (satu proyek Supabase). */
window.C3 = {
  SUPABASE_URL: "https://qswzamffenpwslpzvypa.supabase.co",   // contoh: https://abcdefghij.supabase.co  (tambahan seperti /rest/v1/ otomatis dibuang)
  SUPABASE_KEY: "sb_publishable_QX3ZNgzic5gASzHK2KYk4g_X320_k8n"    // Publishable key (diawali sb_publishable_). JANGAN pakai Secret key.
};
/* ================= Bagian di bawah ini tidak perlu diubah ================= */
(function () {
  var C = window.C3;
  C.base = function () {
    var m = String(C.SUPABASE_URL || "").trim().match(/^https?:\/\/[^\/\s]+/i);
    return m ? m[0] : "";
  };
  C.ready = function () { return !!(C.base() && String(C.SUPABASE_KEY || "").trim()); };
  C.key = function () { return String(C.SUPABASE_KEY || "").trim(); };

  // Panggil fungsi database. "token" hanya untuk editor yang sudah masuk.
  C.rpc = function (fn, args, token) {
    if (!C.ready()) return Promise.reject(new Error("NOT_CONFIGURED"));
    var h = { "Content-Type": "application/json", apikey: C.key() };
    if (token) h.Authorization = "Bearer " + token;
    return fetch(C.base() + "/rest/v1/rpc/" + fn, { method: "POST", headers: h, body: JSON.stringify(args || {}) })
      .then(function (r) { return r.json(); });
  };

  // Alamat publik sebuah foto di penyimpanan
  C.publicUrl = function (path) {
    return C.base() + "/storage/v1/object/public/softfile/" + String(path).split("/").map(encodeURIComponent).join("/");
  };

  C.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  };
  C.fmtSize = function (n) {
    n = Number(n) || 0;
    return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
  };
  C.fmtDate = function (iso) {   // "2026-11-26" -> "26 November 2026"
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  };
  C.safeName = function (name, fallback) {
    var n = String(name || "").replace(/[\\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
    return n || fallback || "foto.jpg";
  };
})();
