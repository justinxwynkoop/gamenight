# Using a Game Night server instead

Optional. Instead of the Apple TV running the game, it can be the TV *display* for a Game Night server (the
[`gamenight`](https://github.com/justinxwynkoop/gamenight) repo's server mode: Node.js on any computer on your network).
Phones then use the server's own pages on your Wi-Fi, and the server decides who buzzed first.

1. On a computer on your network: clone `gamenight`, then `npm install && HOST_PIN=1234 npm start`. It prints an
   address such as `192.168.1.50:3000`.
2. On the Apple TV open Jeopardy or Family Feud, press **Play/Pause**, and choose **Change server**. On the address screen type that address (typing is easiest with an
   iPhone nearby: the Apple TV offers its keyboard) and say Allow if it asks to find devices on your network. The address
   is remembered. (To switch back to hosting the game on the Apple TV, choose **Run on this Apple TV** on that screen.)
3. Scan the QR code on the TV to join. The host scans the small **Host** code on the lobby screen (also in the
   Play/Pause panel) to open the host page, and enters the PIN once (the phone remembers it). The PIN is deliberately
   not shown on the TV.

The TV draws whatever game the host has started on the server. If the server runs a game this app has no screens for,
the TV says so. Sounds can come from the server's `data/sounds` folders; see the `gamenight` repo's
[SERVER-MODE.md](https://github.com/justinxwynkoop/gamenight/blob/main/docs/SERVER-MODE.md).
