// The house question packs that come with the game: categories of five clues and some Final Jeopardy clues each.
// They come from the Buzzworthy game (github.com/JasonWynkoop1/buzzworthy) and are bundled into the app.
import easy from './easy.json' with { type: 'json' };
import classic from './default.json' with { type: 'json' };
import general from './general.json' with { type: 'json' };
import movies from './movies.json' with { type: 'json' };
import nineties from './nineties.json' with { type: 'json' };
import sports from './sports.json' with { type: 'json' };
import media from './media.json' with { type: 'json' };

export const HOUSE_PACKS = [
  ['easy', easy], ['classic', classic], ['general', general], ['movies', movies], ['nineties', nineties], ['sports', sports], ['media', media],
].map(([id, data]) => ({ id: `house-${id}`, data }));
