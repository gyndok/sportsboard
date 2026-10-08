// Shared "send to the TV" menu for the scoreboard and the remote.
// Any element with data-watch="<broadcast>" or data-channel="<id>" opens a
// small menu of screens; picking one plays that game/channel on the wall.
(() => {
  const css = `.watch-chip{display:inline-block;margin-top:2px;padding:3px 7px;border:1px solid #2d5a50;background:#0c1a17;color:#9fe9d6;font:700 11px 'Courier New',monospace;text-transform:uppercase;cursor:pointer;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.watch-chip:hover,.watch-chip:focus-visible{border-color:#39f5cb;color:#39f5cb}
.watch-menu{position:fixed;z-index:50;min-width:210px;background:#0b1010;border:1px solid #39f5cb;box-shadow:0 10px 30px #000c;padding:8px;font:700 13px 'Courier New',monospace;text-transform:uppercase;color:#eef4f4}
.watch-menu p{margin:2px 4px 8px;color:#849a98;font-size:11px;letter-spacing:1px}
.watch-menu button{display:block;width:100%;text-align:left;margin:4px 0;padding:10px;background:#08090b;border:1px solid #233a35;color:#eef4f4;font:inherit;cursor:pointer}
.watch-menu button:hover{border-color:#39f5cb;color:#39f5cb}
.watch-menu small{color:#849a98;font-size:10px;margin-left:6px}
.watch-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;background:#0b1010;border:1px solid #ffcf70;color:#ffcf70;padding:12px 16px;font:700 12px 'Courier New',monospace;max-width:90vw;text-transform:none;line-height:1.4}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  let menu = null;
  const close = () => { menu?.remove(); menu = null; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  function toast(text) {
    const t = document.createElement('div'); t.className = 'watch-toast'; t.textContent = text; document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  async function open(anchor, payload, title) {
    close();
    let wall = null;
    try { wall = await (await fetch('/api/wall')).json(); } catch {}
    const names = Object.fromEntries((wall?.services || []).map(s => [s.id, s.name]));
    const slots = wall?.state?.slots || [];
    const live = wall?.state?.mode === 'grid' ? (wall.layouts?.[wall.state.layout]?.slots || 1) : 0;
    menu = document.createElement('div'); menu.className = 'watch-menu'; menu.setAttribute('role', 'menu');
    menu.innerHTML = `<p>Play ${esc(title)} on</p>` + [0, 1, 2, 3].map(i => {
      const s = slots[i], now = i < live && s ? (s.link ? 'game link' : names[s.service] || '') : 'off';
      return `<button role="menuitem" data-slot="${i}">Screen ${i + 1}<small>${esc(now)}</small></button>`;
    }).join('');
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect(), m = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - m.width - 8)) + 'px';
    menu.style.top = (r.bottom + m.height + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - m.height - 4)) + 'px';
    menu.querySelector('button').focus();
    menu.addEventListener('click', async e => {
      const b = e.target.closest('[data-slot]'); if (!b) return;
      close();
      try {
        const res = await fetch('/api/wall/watch', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...payload, slot: Number(b.dataset.slot)})});
        const d = await res.json();
        toast(res.ok ? `▶ ${d.label} on screen ${d.screen}` : d.error);
        document.dispatchEvent(new CustomEvent('wall-changed'));
      } catch { toast('The Mini didn’t respond.'); }
    });
  }

  // Capture phase so a chip inside a game row doesn't also open game details.
  document.addEventListener('click', e => {
    const chip = e.target.closest('[data-watch],[data-channel]');
    if (chip) {
      e.preventDefault(); e.stopPropagation();
      const payload = chip.dataset.channel ? {channel: chip.dataset.channel} : {broadcast: chip.dataset.watch};
      open(chip, payload, chip.dataset.title || chip.dataset.watch || chip.textContent.trim());
    } else if (menu && !e.target.closest('.watch-menu')) close();
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.wallWatch = {open, toast};
})();
