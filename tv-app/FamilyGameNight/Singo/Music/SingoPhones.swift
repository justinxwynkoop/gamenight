import Foundation
import Observation

/// Singo Night's bingo cards on the phones. Runs the Game Night engine on this Apple TV with the "singo" game (the
/// same engine and online relay Jeopardy and Family Feud use), so phones join with the room code or QR code. The
/// round here tells it which songs can be on the cards and which have played; the engine deals the cards, keeps what
/// each phone marked, and checks every "SINGO!" against the songs that have actually played.
@MainActor
@Observable
final class SingoPhones {
    let client = GameNightClient()
    /// The number of the newest claim the TV has already shown, so each one is announced once.
    private(set) var shownClaim = 0
    /// A claim to show on the round screen now, until it is dismissed.
    private(set) var announcement: SingoClaim?

    var joinURL: URL? { client.joinURL }
    var roomCode: String? { client.roomCode }
    var isConnected: Bool { client.relayUp }
    var state: SingoPhoneState? { client.singo }
    /// Who has joined on a phone, and whether they are here now.
    var players: [ScoreUnit] { client.state?.room.units ?? [] }
    var playersHere: Int { players.filter(\.connected).count }

    func start() {
        guard !client.isLocal else { return }
        client.startLocal(game: "singo")
    }

    func stop() {
        client.act("endRound")
        client.disconnect()
    }

    /// A new round: every phone gets a fresh card made from these songs.
    func deal(_ songs: [SongInfo], playlist: String) {
        start()
        let list: [[String: Any]] = songs.map { ["id": $0.id, "title": $0.title, "artist": $0.artistName] }
        client.act("deal", ["songs": list, "playlist": playlist])
        shownClaim = state?.claims.last?.n ?? shownClaim
        announcement = nil
    }

    /// A song's music started: it can now count toward a Singo.
    func called(_ song: SongInfo) {
        client.act("call", ["id": song.id])
    }

    func endRound() {
        client.act("endRound")
    }

    /// Looks for a claim the TV has not shown yet. Returns it once (the round screen pauses for a good one).
    func takeNewClaim() -> SingoClaim? {
        guard let claim = state?.claim(after: shownClaim) else { return nil }
        shownClaim = claim.n
        announcement = claim
        return claim
    }

    func dismissAnnouncement() { announcement = nil }
}
