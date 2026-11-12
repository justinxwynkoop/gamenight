// Jeopardy's pages were written against one flat view. The server now sends
// { room, game }: the room (players, teams, scores) is shared by every game and
// game is Jeopardy's own state. This puts them back together for the pages.
export const flat = (view) => ({
  ...view.game,
  units: view.room.units,
  mode: view.room.mode,
  teams: view.room.teams,
  players: view.room.players,
  me: view.room.me,
});
