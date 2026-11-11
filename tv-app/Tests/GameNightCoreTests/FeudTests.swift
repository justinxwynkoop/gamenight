import XCTest
@testable import GameNightCore

/// Family Feud, against states recorded from the real Game Night server (Tools/record-feud-fixtures.mjs).
/// The expected sounds were produced by running the web TV's own `onChange()` (public/games/feud/tv.js)
/// over the same pairs of states, so the two displays are held to the same behaviour.
extension Fixture {
    static func feud(_ name: String) throws -> FeudState {
        let state = try state(name)
        return try XCTUnwrap(state.feud, "\(name) is not a Family Feud state")
    }
}

final class FeudDecodingTests: XCTestCase {
    func testLobby() throws {
        let state = try Fixture.state("feud-lobby")
        let game = try XCTUnwrap(state.feud)
        XCTAssertEqual(game.status, .lobby)
        XCTAssertEqual(game.rounds, 5)
        XCTAssertTrue(game.hasFastMoney)
        XCTAssertEqual(state.lobbyTitle, "Family Night Basics")
        XCTAssertEqual(state.room.units.count, 2, "Family Feud is always two teams")
        XCTAssertTrue(state.room.isTeamMode)
    }

    func testFaceoffHidesTheAnswers() throws {
        let round = try XCTUnwrap(try Fixture.feud("feud-faceoff-open").round)
        XCTAssertEqual(round.step, .faceoff)
        XCTAssertTrue(round.faceoff.open)
        XCTAssertEqual(round.faceoff.reps.count, 2)
        XCTAssertEqual(round.answers.count, 6)
        XCTAssertTrue(round.answers.allSatisfy { $0.text == nil && $0.points == nil && !$0.revealed })
        XCTAssertEqual(round.multiplier, 1)
        XCTAssertEqual(round.maxStrikes, 3)
    }

    func testRevealedAnswersAndThePot() throws {
        let round = try XCTUnwrap(try Fixture.feud("feud-play-answer").round)
        XCTAssertEqual(round.step, .play)
        XCTAssertEqual(round.answers.filter(\.revealed).map(\.n), [1, 2, 3])
        XCTAssertEqual(round.pot, 71)
        XCTAssertEqual(round.answers[0].text, "Brush teeth")
        XCTAssertEqual(round.answers[0].points, 30)
        XCTAssertNil(round.answers[3].text)
    }

    func testStrikesAndTheSteal() throws {
        XCTAssertEqual(try XCTUnwrap(try Fixture.feud("feud-strike-1").round).strikes, 1)
        let steal = try XCTUnwrap(try Fixture.feud("feud-steal").round)
        XCTAssertEqual(steal.step, .steal)
        XCTAssertEqual(steal.strikes, 3)
        XCTAssertNotNil(steal.stealFrom)
        XCTAssertNotNil(steal.control)
        XCTAssertNotEqual(steal.control, steal.stealFrom, "the other team is stealing")
    }

    func testRoundEnd() throws {
        let end = try XCTUnwrap(try Fixture.feud("feud-roundend").round)
        XCTAssertEqual(end.step, .roundEnd)
        XCTAssertEqual(end.pot, 83)
        XCTAssertEqual(end.result?.awarded, 83)
        XCTAssertEqual(end.result?.winner, end.control)
        let all = try XCTUnwrap(try Fixture.feud("feud-roundend-all").round)
        XCTAssertEqual(all.answers.filter(\.late).count, 2)
        XCTAssertEqual(all.answers.filter(\.revealed).count, 4)
        XCTAssertTrue(all.answers.allSatisfy { $0.text != nil })
    }

    func testLaterRoundsAreWorthMore() throws {
        let round = try XCTUnwrap(try Fixture.feud("feud-round4").round)
        XCTAssertEqual(round.number, 4)
        XCTAssertEqual(round.multiplier, 2)
    }

    func testFastMoneyWhileAnswering() throws {
        let fm = try XCTUnwrap(try Fixture.feud("feud-fm-p1").fm)
        XCTAssertEqual(fm.step, .p1)
        XCTAssertEqual(fm.timer?.totalMs, 20000)
        XCTAssertEqual(fm.players.count, 2)
        XCTAssertEqual(fm.rows.count, 5)
        XCTAssertTrue(fm.rows.allSatisfy { $0.question != nil })
        XCTAssertTrue(fm.rows.allSatisfy { !$0.p1.judged && $0.p1.typed == nil && !$0.p2.judged && $0.p2.typed == nil })
        XCTAssertEqual(fm.goal, 200)
    }

    func testFastMoneyReveal() throws {
        let fm = try XCTUnwrap(try Fixture.feud("feud-fm-partial").fm)
        XCTAssertEqual(fm.step, .reveal)
        XCTAssertEqual(fm.rows[0].p1.points, 34)
        XCTAssertEqual(fm.rows[0].p1.label, "Apple")
        XCTAssertEqual(fm.rows[0].p2.points, 30)
        XCTAssertEqual(fm.rows[0].p2.label, "Banana")
        XCTAssertEqual(fm.rows[1].p1.points, 46)
        XCTAssertFalse(fm.rows[1].p2.judged)
        XCTAssertNil(fm.won)
    }

    func testFastMoneyResultsAndTheEnd() throws {
        let fm = try XCTUnwrap(try Fixture.feud("feud-fm-results").fm)
        XCTAssertEqual(fm.step, .results)
        XCTAssertEqual(fm.totals.p1, 162)
        XCTAssertEqual(fm.totals.p2, 124)
        XCTAssertEqual(fm.totals.total, 286)
        XCTAssertEqual(fm.won, true)
        let done = try Fixture.state("feud-done")
        XCTAssertEqual(done.feud?.status, .done)
        XCTAssertEqual(done.feud?.result?.fastMoney?.total, 286)
        XCTAssertEqual(done.feud?.result?.fastMoney?.won, true)
        XCTAssertEqual(done.feud?.result?.fastMoney?.played, true)
        XCTAssertEqual(Standings.winners(done.room.units).map(\.name), ["Red"])
    }

    func testABlankAnswerIsAZeroInOneStep() throws {
        let fm = try XCTUnwrap(try Fixture.feud("feud-fm-blanks").fm)
        XCTAssertEqual(fm.step, .reveal)
        // The host revealed player 1's blank answer to question 2: it goes straight to its 0.
        let blank = fm.rows[1].p1
        XCTAssertEqual(blank.shown, 2)
        XCTAssertTrue(blank.judged)
        XCTAssertEqual(blank.points, 0)
        XCTAssertEqual(blank.label, "No answer")
        XCTAssertEqual(blank.typed, "")
        XCTAssertEqual(FastMoneyCell.shownText(blank), "NO ANSWER")
        // Nothing else is up yet, so nothing is given away.
        XCTAssertEqual(fm.rows[0].p1.shown, 0)
        XCTAssertNil(fm.rows[0].p1.typed)
        XCTAssertTrue(fm.rows.allSatisfy { $0.p2.shown == 0 && $0.p2.typed == nil })
        XCTAssertEqual(fm.totals.total, 0)
    }

    func testAnswerThenPoints() throws {
        let said = try XCTUnwrap(try Fixture.feud("feud-fm-said").fm).rows[0].p1
        XCTAssertEqual(said.shown, 1, "what they said is up, the points are not")
        XCTAssertEqual(said.typed, "apple")
        XCTAssertFalse(said.judged)
        XCTAssertNil(said.points)
        XCTAssertEqual(FastMoneyCell.shownText(said), "APPLE")
        XCTAssertEqual(try XCTUnwrap(try Fixture.feud("feud-fm-said").fm).totals.total, 0)
        let partial = try XCTUnwrap(try Fixture.feud("feud-fm-partial").fm)
        XCTAssertEqual(partial.rows[0].p1.shown, 2)
        XCTAssertEqual(partial.rows[0].p1.points, 34)
        XCTAssertEqual(partial.totals.total, 110, "only points that are up count")
    }

    func testUnknownValuesDoNotBreakDecoding() throws {
        var text = try String(decoding: Fixture.data("feud-play"), as: UTF8.self)
        text = text.replacingOccurrences(of: "\"step\": \"play\"", with: "\"step\": \"something-new\"")
        let state = try JSONDecoder().decode(ServerState.self, from: Data(text.utf8))
        XCTAssertEqual(state.feud?.round?.step, .unknown)
    }
}

final class FeudScreenTests: XCTestCase {
    private func screen(_ name: String) throws -> DisplayScreen {
        DisplayScreen.screen(for: try Fixture.state(name))
    }

    func testScreens() throws {
        XCTAssertEqual(try screen("feud-lobby"), .lobby)
        for name in ["feud-faceoff", "feud-faceoff-open", "feud-choose", "feud-play", "feud-steal", "feud-roundend", "feud-round4"] {
            XCTAssertEqual(try screen(name), .feudRound, name)
        }
        for name in ["feud-fm-pick", "feud-fm-p1", "feud-fm-p2", "feud-fm-reveal", "feud-fm-results"] {
            XCTAssertEqual(try screen(name), .feudFastMoney, name)
        }
        XCTAssertEqual(try screen("feud-done"), .feudWinner)
    }
}

final class FeudSoundTests: XCTestCase {
    private func cues(_ from: String, _ to: String) throws -> [SoundCue] {
        SoundPlanner.plan(from: try Fixture.state(from), to: try Fixture.state(to)).cues
    }

    func testTheFaceoff() throws {
        XCTAssertEqual(try cues("feud-lobby", "feud-faceoff"), [.roundstart])
        XCTAssertEqual(try cues("feud-faceoff", "feud-faceoff-open"), [.open])
        XCTAssertEqual(try cues("feud-faceoff-open", "feud-faceoff-turn"), [.faceoff])
        XCTAssertEqual(try cues("feud-faceoff-turn", "feud-faceoff-second"), [.ding])
        XCTAssertEqual(try cues("feud-faceoff-second", "feud-choose"), [.ding])
        XCTAssertEqual(try cues("feud-choose", "feud-play"), [])
    }

    func testAnswersStrikesAndTheEndOfARound() throws {
        XCTAssertEqual(try cues("feud-play", "feud-play-answer"), [.ding])
        XCTAssertEqual(try cues("feud-play-answer", "feud-strike-1"), [.strike])
        XCTAssertEqual(try cues("feud-strike-1", "feud-steal"), [.strikeout], "the third strike")
        XCTAssertEqual(try cues("feud-steal", "feud-roundend"), [.ding, .correct])
        XCTAssertEqual(try cues("feud-roundend", "feud-roundend-all"), [])
        XCTAssertEqual(try cues("feud-roundend-all", "feud-round2-done"), [.roundstart])
    }

    func testFastMoney() throws {
        XCTAssertEqual(try cues("feud-round4-done", "feud-fm-pick"), [.fastmoney])
        XCTAssertEqual(try cues("feud-fm-pick", "feud-fm-p1"), [])
        XCTAssertEqual(try cues("feud-fm-p1", "feud-fm-p2"), [])
        XCTAssertEqual(try cues("feud-fm-reveal", "feud-fm-said"), [], "what they said makes no sound; the points do")
        XCTAssertEqual(try cues("feud-fm-said", "feud-fm-partial"), [.fmpoints])
        XCTAssertEqual(try cues("feud-fm-partial", "feud-fm-results"), [.fmpoints, .winner])
        XCTAssertEqual(try cues("feud-fm-results", "feud-done"), [.winner])
    }

    func testTheFirstStateMakesNoSound() throws {
        XCTAssertEqual(SoundPlanner.plan(from: nil, to: try Fixture.state("feud-play")).cues, [])
    }

    func testOnlyTheFastMoneyCountdownTicks() throws {
        XCTAssertNotNil(SoundPlanner.activeTimer(in: try Fixture.state("feud-fm-p1")))
        XCTAssertNotNil(SoundPlanner.activeTimer(in: try Fixture.state("feud-fm-p2")))
        for name in ["feud-lobby", "feud-faceoff-open", "feud-play", "feud-fm-pick", "feud-fm-reveal", "feud-done"] {
            XCTAssertNil(SoundPlanner.activeTimer(in: try Fixture.state(name)), name)
        }
    }

    func testLobbyMusicOnlyBeforeTheGame() throws {
        XCTAssertTrue(SoundPlanner.wantsLobbyMusic(try Fixture.state("feud-lobby")))
        XCTAssertFalse(SoundPlanner.wantsLobbyMusic(try Fixture.state("feud-play")))
    }

    func testTheNewSoundsHaveTheWebRecipes() {
        func seconds(_ cue: SoundCue) -> Double { Double(SoundSynth.render(cue).count) / Double(SoundSynth.sampleRate) }
        XCTAssertEqual(seconds(.ding), 0.9 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.strike), 0.8 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.strikeout), 1.25 + 0.5 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.faceoff), 0.07 + 0.35 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.roundstart), 0.33 + 0.6 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.winner), 1.06 + 0.9 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.zero), 0.6 + 0.5 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.fmpoints), 0.1 + 0.55 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.fastmoney), 0.62 + 0.8 + 0.05, accuracy: 0.001)
    }

    func testSomeSoundsBorrowTheStrikeBuzzerFile() {
        XCTAssertEqual(SoundCue.strikeout.fallbackFile, "strike")
        XCTAssertEqual(SoundCue.zero.fallbackFile, "strike")
        XCTAssertNil(SoundCue.ding.fallbackFile)
        XCTAssertNil(SoundCue.strike.fallbackFile)
    }
}
