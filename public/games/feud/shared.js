// Bits the TV and phone pages of Family Feud share: the stylesheet with its fonts, and the art.
import { h } from '../../common.js';

/** When a question set's questions feel from (keep in step with ERAS in games/feud/game.js). A set with no era is timeless. */
export const ERA_LABELS = { timeless: 'Any time', throwback: 'Throwback (80s to 2000s)', today: 'Today' };

/** Loads the Family Feud stylesheet (and its fonts) once. */
export function loadStyles() {
  if (document.getElementById('fd-css')) return;
  document.head.append(h('link', { id: 'fd-css', rel: 'stylesheet', href: '/games/feud/feud.css' }));
  const FONTS = 'https://fonts.googleapis.com/css2?family=Bungee&family=Outfit:wght@400;600;800;900&display=swap';
  if (!document.querySelector(`link[href="${FONTS}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: FONTS }));
}

/** One of the pictures in art/ (trophy, money-bag, stopwatch, clipboard, microphone). */
export const art = (name, cls = '') => h('img', { class: `fd-art ${cls}`, src: `/games/feud/art/${name}.png`, alt: '', draggable: 'false' });
