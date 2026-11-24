import XCTest
@testable import GameNightCore

/// Guys vs Gals: what the Apple TV reads from the engine (fixtures from scripts/record-tv-fixtures.mjs).
final class GuysVsGalsTests: XCTestCase {
    private func gvg(_ name: String) throws -> GuysVsGalsState {
        try XCTUnwrap(try Fixture.state("gvg-\(name)").guysVsGals, "gvg-\(name) is not a Guys vs Gals state")
    }

    func testLobbyUsesTheSharedLobbyScreen() throws {
        let state = try Fixture.state("gvg-lobby")
        XCTAssertEqual(DisplayScreen.screen(for: state), .lobby)
        XCTAssertEqual(state.lobbyTitle, "Guys vs Gals")
        let game = try gvg("lobby")
        XCTAssertEqual(game.phase, .lobby)
        XCTAssertEqual(game.teams.map(\.side), ["guys", "gals"])
        XCTAssertEqual(game.teams.map(\.name), ["Guys", "Gals"])
        XCTAssertEqual(game.teams.map { $0.members.map(\.name) }, [["Dad", "Leo"], ["Mom", "Maya"]])
        XCTAssertTrue(game.teams.allSatisfy { $0.members.allSatisfy(\.picked) })
        XCTAssertEqual(game.teams.map(\.challenges), [3, 3])
        XCTAssertEqual(game.target, 3)
        XCTAssertEqual(game.green, 5)
        XCTAssertEqual(game.decks.map(\.id), ["facts", "stuff", "pics", "lives", "moves"])
        XCTAssertEqual(game.spaceDeck(0).name, "Our Facts")
        XCTAssertEqual(game.spaceDeck(-3).id, "lives", "the spaces count the same either side of START")
        XCTAssertEqual(game.spaceDeck(5).id, "any")
    }

    func testTheGalsGoFirstAndAGuyReads() throws {
        let state = try Fixture.state("gvg-card")
        XCTAssertEqual(DisplayScreen.screen(for: state), .guysVsGals)
        let game = try gvg("card")
        XCTAssertEqual(game.phase, .card)
        XCTAssertEqual(game.turn, "gals")
        XCTAssertEqual(game.pos, 0)
        let c = try XCTUnwrap(game.card)
        XCTAssertEqual(c.deck, "facts")
        XCTAssertEqual(c.about, "guys", "the Gals answer about guy stuff")
        XCTAssertEqual(c.reader.name, "Dad")
        XCTAssertNotNil(c.text)
        XCTAssertNil(c.answer, "the TV never gets the answer before it is judged")
        XCTAssertNil(SoundPlanner.activeTimer(in: state), "no clock on a spoken card")
    }

    func testRightPullsTheTrophyWrongPassesTheTurn() throws {
        let right = try gvg("result-right")
        XCTAssertEqual(right.phase, .result)
        XCTAssertEqual(right.result?.right, true)
        XCTAssertEqual(right.result?.moved, "gals")
        XCTAssertEqual(right.result?.next, "gals")
        XCTAssertEqual(right.pos, 1)
        XCTAssertNotNil(right.card?.answer)
        XCTAssertEqual(right.lastMove?.to, 1)
        let wrong = try gvg("result-wrong")
        XCTAssertEqual(wrong.result?.right, false)
        XCTAssertNil(wrong.result?.moved)
        XCTAssertEqual(wrong.result?.next, "guys")
        XCTAssertEqual(wrong.pos, 1)
    }

    func testAChallenge() throws {
        let game = try gvg("card-challenged")
        XCTAssertEqual(game.turn, "guys")
        XCTAssertEqual(game.card?.challenged, true)
        XCTAssertEqual(game.team("guys")?.challenges, 2)
    }

    func testTheOtherDecks() throws {
        let pics = try gvg("pics")
        XCTAssertEqual(pics.card?.deck, "pics")
        XCTAssertNotNil(pics.card?.img)
        let secret = try gvg("lives-secret")
        XCTAssertEqual(secret.card?.stage, "secret")
        XCTAssertEqual(secret.card?.choices?.count, 3)
        let guess = try gvg("lives-guess")
        XCTAssertEqual(guess.card?.stage, "guess")
        XCTAssertEqual(guess.card?.voters?.count, 1)
        XCTAssertEqual(guess.card?.guessers?.count, 2)
        let pick = try gvg("moves-pick")
        XCTAssertEqual(pick.card?.stage, "pick")
        XCTAssertNil(pick.card?.text, "the TV never says what is acted out")
        let act = try gvg("moves-act")
        XCTAssertEqual(act.card?.actor?.name, "Leo")
        XCTAssertEqual(act.timer?.kind, "moves")
        XCTAssertNotNil(SoundPlanner.activeTimer(in: try Fixture.state("gvg-moves-act")))
        let stolen = try gvg("moves-stolen")
        XCTAssertEqual(stolen.result?.stolen, true)
        XCTAssertEqual(stolen.result?.moved, "gals")
        XCTAssertNotNil(stolen.card?.answer, "what was acted out, once it is over")
    }

    func testTrophiesAndTheEnd() throws {
        let win = try gvg("result-trophy")
        XCTAssertEqual(win.result?.trophy, "gals")
        XCTAssertEqual(win.lastMove?.trophy, true)
        let trophy = try gvg("trophy")
        XCTAssertEqual(trophy.phase, .trophy)
        XCTAssertEqual(trophy.trophyWon, "gals")
        XCTAssertEqual(trophy.team("gals")?.trophies, 1)
        let next = try gvg("new-trophy")
        XCTAssertEqual(next.pos, 0)
        XCTAssertEqual(next.turn, "guys", "the team that didn't win the last trophy starts the next")
        XCTAssertEqual(next.trophy, 2)
        let game = try gvg("gameover")
        XCTAssertEqual(game.phase, .gameover)
        XCTAssertEqual(game.winners, ["gals"])
        XCTAssertEqual(game.name(game.winners?.first), "Gals")
    }

    func testAnUnknownPhaseDoesNotBlankTheScreen() throws {
        var text = try String(decoding: Fixture.data("gvg-card"), as: UTF8.self)
        text = text.replacingOccurrences(of: #""phase": "card""#, with: #""phase": "something-new""#)
        let state = try JSONDecoder().decode(ServerState.self, from: Data(text.utf8))
        XCTAssertEqual(state.guysVsGals?.phase, .unknown)
        XCTAssertEqual(DisplayScreen.screen(for: state), .guysVsGals)
    }
}

/// Guys vs Gals' sounds: its own CC0 recordings, each meaning a moment of this game.
final class GuysVsGalsSoundTests: XCTestCase {
    private func plan(_ from: String, _ to: String) throws -> SoundPlan {
        SoundPlanner.plan(from: try Fixture.state(from), to: try Fixture.state(to))
    }

    func testTheGameMomentsEachHaveASound() throws {
        XCTAssertEqual(try plan("gvg-lobby", "gvg-card").cues, [.open, .roundstart])      // the first card
        XCTAssertEqual(try plan("gvg-card", "gvg-result-right").cues, [.pick, .correct])  // right: the trophy moves
        XCTAssertEqual(try plan("gvg-card-challenged", "gvg-pics").cues, [.pick, .open]) // the challenge missed, the next card
        XCTAssertEqual(try plan("gvg-lives-secret", "gvg-lives-guess").cues, [.lock])
        XCTAssertEqual(try plan("gvg-moves-act", "gvg-moves-stolen").cues, [.pick, .correct])
        XCTAssertEqual(try plan("gvg-result-trophy", "gvg-trophy").cues, [.ding, .applause])
        let end = try plan("gvg-trophy", "gvg-gameover").cues
        XCTAssertTrue(end.contains(.fanfare) && end.contains(.applause))
    }

    func testACharadeHasMusic() throws {
        XCTAssertEqual(try plan("gvg-moves-pick", "gvg-moves-act").playMusic, true)
        XCTAssertEqual(try plan("gvg-moves-pick", "gvg-moves-act").cues, [.lock])
        XCTAssertEqual(try plan("gvg-moves-act", "gvg-moves-stolen").playMusic, false)
    }

    func testGuysVsGalsHasItsOwnSounds() {
        XCTAssertEqual(BundledSounds.parse(stem: "guysvsgals__open")?.game, "guysvsgals")
        XCTAssertTrue(CustomSoundStore.games.contains("guysvsgals"))
        XCTAssertNil(SoundPlanner.borrowedSounds["guysvsgals"])
    }
}
