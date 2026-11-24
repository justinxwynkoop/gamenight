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
        XCTAssertEqual(game.length, 20)
        XCTAssertEqual(game.step, 2)
        XCTAssertEqual(game.lightningAt, [5, 10, 15])
        XCTAssertEqual(game.lengthText, "Standard game · 20 spaces")
    }

    func testTheCoinTossAndTheFirstQuestion() throws {
        let state = try Fixture.state("gvg-toss")
        XCTAssertEqual(DisplayScreen.screen(for: state), .guysVsGals)
        XCTAssertEqual(try gvg("toss").phase, .toss)
        XCTAssertEqual(try gvg("toss").turn, "guys")
        let game = try gvg("question")
        let q = try XCTUnwrap(game.question)
        XCTAssertEqual(q.about, "gals", "the Guys answer about gal stuff")
        XCTAssertEqual(q.choices.count, 4)
        XCTAssertNil(q.answer, "the TV never gets the answer before it is revealed")
        XCTAssertFalse(q.locked)
        XCTAssertEqual(game.timer?.kind, "answer")
        XCTAssertNotNil(SoundPlanner.activeTimer(in: try Fixture.state("gvg-question")))
    }

    func testVotesThenTheReveal() throws {
        let voted = try gvg("question-voted")
        XCTAssertEqual(voted.question?.voters.count, 1)
        XCTAssertEqual(voted.question?.counts.reduce(0, +), 1)
        let locked = try gvg("question-locked")
        XCTAssertEqual(locked.question?.locked, true)
        XCTAssertNotNil(locked.question?.pick)
        XCTAssertNil(locked.question?.answer)
        XCTAssertNil(SoundPlanner.activeTimer(in: try Fixture.state("gvg-question-locked")), "no ticking once the answer is locked in")
        let right = try gvg("reveal-right")
        XCTAssertEqual(right.result?.correct, true)
        XCTAssertEqual(right.question?.answer, right.question?.pick)
        XCTAssertEqual(right.team("guys")?.pos, 2)
        XCTAssertEqual(right.lastMove?.to, 2)
        let wrong = try gvg("reveal-wrong")
        XCTAssertEqual(wrong.turn, "gals")
        XCTAssertEqual(wrong.result?.correct, false)
        XCTAssertNotEqual(wrong.question?.answer, wrong.question?.pick)
        XCTAssertEqual(wrong.team("gals")?.pos, 0)
    }

    func testTheLightningRound() throws {
        let intro = try gvg("lightning-intro")
        XCTAssertEqual(intro.phase, .lightningIntro)
        XCTAssertEqual(intro.lightning?.side, "guys")
        XCTAssertEqual(intro.lightning?.total, 5)
        let round = try gvg("lightning")
        XCTAssertNotNil(round.lightning?.current)
        XCTAssertEqual(round.timer?.kind, "lightning")
        let flash = try gvg("lightning-flash")
        XCTAssertEqual(flash.lightning?.flash?.correct, true)
        XCTAssertEqual(flash.lightning?.done.count, 1)
        let done = try gvg("lightning-done")
        XCTAssertEqual(done.phase, .lightningDone)
        XCTAssertEqual(done.lightning?.rights, 5)
        XCTAssertEqual(done.team("guys")?.pos, 11)
        XCTAssertEqual(done.team("guys")?.used, [5, 10], "a Lightning Round never starts another")
    }

    func testTheEnd() throws {
        let last = try gvg("last-chance")
        XCTAssertEqual(last.lastChance, true)
        XCTAssertEqual(last.turn, "gals")
        let game = try gvg("gameover")
        XCTAssertEqual(game.phase, .gameover)
        XCTAssertEqual(game.winners, ["guys"])
        XCTAssertEqual(game.name(game.winners?.first), "Guys")
    }

    func testAnUnknownPhaseDoesNotBlankTheScreen() throws {
        var text = try String(decoding: Fixture.data("gvg-question"), as: UTF8.self)
        text = text.replacingOccurrences(of: #""phase": "question""#, with: #""phase": "something-new""#)
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
        XCTAssertEqual(try plan("gvg-lobby", "gvg-toss").cues, [.roundstart])            // the coin toss
        XCTAssertEqual(try plan("gvg-toss", "gvg-question").cues, [.open])               // a question
        XCTAssertEqual(try plan("gvg-question", "gvg-question-voted").cues, [])          // a vote is quiet
        XCTAssertEqual(try plan("gvg-question-voted", "gvg-question-locked").cues, [.lock])
        XCTAssertEqual(try plan("gvg-question-locked", "gvg-reveal-right").cues, [.pick, .correct])
        XCTAssertEqual(try plan("gvg-lightning", "gvg-lightning-flash").cues, [.ding])   // a right true-or-false
        let end = try plan("gvg-last-chance", "gvg-gameover").cues
        XCTAssertTrue(end.contains(.fanfare) && end.contains(.applause))
    }

    func testTheLightningRoundHasMusic() throws {
        XCTAssertEqual(try plan("gvg-lightning-intro", "gvg-lightning").playMusic, true)
        XCTAssertEqual(try plan("gvg-lightning-flash", "gvg-lightning-done").playMusic, false)
        XCTAssertEqual(try plan("gvg-lightning-intro", "gvg-lightning").cues, [])
    }

    func testGuysVsGalsHasItsOwnSounds() {
        XCTAssertEqual(BundledSounds.parse(stem: "guysvsgals__open")?.game, "guysvsgals")
        XCTAssertTrue(CustomSoundStore.games.contains("guysvsgals"))
        XCTAssertNil(SoundPlanner.borrowedSounds["guysvsgals"])
    }
}
