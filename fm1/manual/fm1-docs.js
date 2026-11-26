// nullwave fm1's guide and manual: the section you're reading marked in the contents (sidebar and sheet), the phone's
// contents sheet opened and closed (tools/site_look.py builds the markup; fm1-docs.css styles it).
(function () {
  'use strict';
  const heads = [...document.querySelectorAll('.nw-doc h2[id], .nw-doc h3[id]')];
  const links = id => document.querySelectorAll('.nw-toc a[href="#' + CSS.escape(id) + '"]');
  const here = document.querySelector('.nw-bar .here');
  let cur = null;
  function mark(h) {
    if (!h || h === cur) return;
    if (cur) links(cur.id).forEach(a => a.removeAttribute('aria-current'));
    cur = h;
    links(h.id).forEach(a => a.setAttribute('aria-current', 'true'));
    if (here) here.textContent = h.dataset.title || h.textContent.replace(/#$/, '').trim();
    const side = document.querySelector('.nw-docwrap > .nw-toc a[aria-current]');   // (kept in view in a long list)
    if (side && side.scrollIntoView) {
      const box = side.closest('.nw-toc').getBoundingClientRect(), r = side.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) side.scrollIntoView({ block: 'center' });
    }
  }
  function update() {                       // the last heading above a line a third down the window
    const y = innerHeight / 3;
    let h = heads[0];
    for (const x of heads) { if (x.getBoundingClientRect().top <= y) h = x; else break; }
    mark(h);
  }
  let busy = false;
  addEventListener('scroll', () => { if (!busy) { busy = true; requestAnimationFrame(() => { busy = false; update(); }); } }, { passive: true });
  update();
  const sheet = document.querySelector('dialog.nw-sheet');
  const open = document.querySelector('.nw-bar button');
  if (sheet && open) {
    open.addEventListener('click', () => {
      sheet.showModal();
      const a = sheet.querySelector('a[aria-current]') || sheet.querySelector('a');
      if (a) a.focus();
    });
    sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('a, .close')) sheet.close(); });
  }
})();
