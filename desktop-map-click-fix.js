// Desktop mouse adapter for the 2D Japan/US maps.
// The touch gesture layer intentionally captures pointers for iPad stability.
// On desktop that capture can suppress the SVG group's native click, so we
// resolve a short mouse press/release explicitly without changing touch logic.
(() => {
  function install(frame, selector, select, suppress) {
    if (!frame) return;
    let press = null;

    frame.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      const group = event.target.closest?.(selector);
      press = group ? {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        value: group.dataset.value || group.dataset.name || ''
      } : null;
    }, true);

    frame.addEventListener('pointerup', event => {
      if (!press || event.pointerType !== 'mouse' || event.pointerId !== press.id) {
        press = null;
        return;
      }
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      const value = press.value;
      press = null;
      if (!value || dx * dx + dy * dy > 49) return;

      // Prevent the later synthetic/native click handler from selecting twice.
      suppress();
      select(value);
    }, true);

    frame.addEventListener('pointercancel', () => { press = null; }, true);
  }

  install(
    document.querySelector('#japanOverlay .japan-map-frame'),
    '.jp-pref',
    value => { if (typeof choosePrefecture === 'function') choosePrefecture(value); },
    () => { if (typeof japanOverlay !== 'undefined') japanOverlay.suppressClickUntil = performance.now() + 250; }
  );

  install(
    document.querySelector('#usOverlay .us-map-frame'),
    '.us-state',
    value => { if (typeof chooseUSState === 'function') chooseUSState(value); },
    () => { if (typeof usOverlayState !== 'undefined') usOverlayState.suppressClickUntil = performance.now() + 250; }
  );
})();
