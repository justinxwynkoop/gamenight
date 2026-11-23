import XCTest
@testable import GameNightCore

/// Pie Chase: what the Apple TV reads from the engine (fixtures from scripts/record-tv-fixtures.mjs, with a loaded die).
final class PieChaseTests: XCTestCase {
    private func pc(_ name: String) throws -> PieChaseState {
        try XCTUnwrap(try Fixture.state("pc-\(name)").pieChase, "pc-\(name) is not a Pie Chase state")
    }

    func testLobbyUsesTheSharedLobbyScreen() throws {
        let state = try Fixture.state("pc-lobby")
        XCTAssertEqual(DisplayScreen.screen(for: state), .lobby)
        XCTAssertEqual(state.lobbyTitle, "Pie Chase")
        let game = try pc("lobby")
        XCTAssertEqual(game.phase, .lobby)
        XCTAssertEqual(game.units.count, 3)
        XCTAssertEqual(game.minUnits, 2)
        XCTAssertEqual(game.maxUnits, 6)
        XCTAssertEqual(game.settings.wedgesToWin, 6)
    }

    func testTheBoardIsTheClassicWheel() throws {
        let game = try pc("lobby")
        XCTAssertEqual(game.board.count, 73)
        XCTAssertEqual(game.board.filter { $0.kind == "hq" }.count, 6)
        XCTAssertEqual(game.board.filter { $0.kind == "again" }.count, 12)
        XCTAssertEqual(game.board.filter { $0.kind == "hub" }.count, 1)
        XCTAssertEqual(game.board.filter { $0.isRing }.count, 42)
        XCTAssertEqual(game.board.compactMap(\.ringIndex).sorted(), Array(0..<42))
        XCTAssertEqual(game.categories.count, 6)
        XCTAssertEqual(game.categories.map(\.name), ["Geography", "Entertainment", "History", "Arts & Literature", "Science & Nature", "Sports & Leisure"])
        for space in game.board {
            XCTAssertLessThanOrEqual(abs(space.x), 1.0001)
            XCTAssertLessThanOrEqual(abs(space.y), 1.0001)
        }
        XCTAssertTrue(game.units.allSatisfy { $0.pos == "H" && $0.wedges.isEmpty }, "everyone starts in the hub")
    }

    func testTheRollForWhoGoesFirst() throws {
        let state = try Fixture.state("pc-rolloff")
        XCTAssertEqual(DisplayScreen.screen(for: state), .pieChase)
        let start = try pc("rolloff")
        XCTAssertEqual(start.phase, .rolloff)
        XCTAssertEqual(start.rolloff?.contenders.count, 3)
        XCTAssertNil(start.rolloff?.starter)
        let tie = try pc("rolloff-tie")
        XCTAssertEqual(tie.rolloff?.round, 2, "a tie for highest rolls again")
        XCTAssertEqual(tie.rolloff?.contenders.count, 2)
        let done = try pc("rolloff-done")
        let starter = try XCTUnwrap(done.rolloff?.starter)
        XCTAssertEqual(done.name(starter), "Dad")
    }

    func testAMoveOffersEveryPlaceTheRollReaches() throws {
        let game = try pc("move")
        XCTAssertEqual(game.phase, .move)
        XCTAssertEqual(game.die?.value, 6)
        let options = try XCTUnwrap(game.options)
        XCTAssertEqual(options.count, 6, "a 6 from the hub reaches each headquarters")
        XCTAssertTrue(options.allSatisfy { game.space($0)?.kind == "hq" })
    }

    func testTheAnswerOnlyReachesTheTVOnceItIsJudged() throws {
        let asked = try pc("question-hq")
        XCTAssertEqual(asked.phase, .question)
        let question = try XCTUnwrap(asked.question)
        XCTAssertTrue(question.hq)
        XCTAssertFalse(question.text.isEmpty)
        XCTAssertNil(question.answer, "the TV never shows the answer while it is being answered")
        XCTAssertNotNil(asked.unit(asked.readerId), "the next player reads")
        XCTAssertEqual(asked.spaceName(asked.unit(asked.turn)?.pos), "History headquarters")
        let judged = try pc("result-wedge")
        XCTAssertEqual(judged.phase, .result)
        XCTAssertEqual(judged.question?.answer, "George Washington")
    }

    func testARightAnswerOnAHeadquartersWinsTheWedge() throws {
        let game = try pc("result-wedge")
        XCTAssertTrue(game.wedgeWon)
        XCTAssertEqual(game.result?.wedge, 2)
        XCTAssertEqual(game.unit(game.turn)?.wedges, [2])
        let after = try pc("roll-again")
        XCTAssertEqual(after.phase, .roll)
        XCTAssertEqual(after.turn, game.turn, "a right answer rolls again")
        XCTAssertEqual(after.again, "correct")
    }

    func testAWrongAnswerPassesThePlayOn() throws {
        let game = try pc("result-wrong")
        XCTAssertEqual(game.result?.correct, false)
        XCTAssertFalse(game.wedgeWon)
        XCTAssertNotNil(game.question?.answer)
    }

    func testTheOthersPickTheWinningCategory() throws {
        let choose = try pc("choose-final")
        XCTAssertEqual(choose.phase, .choose)
        XCTAssertEqual(choose.chooser, "opponents")
        XCTAssertEqual(choose.unit(choose.turn)?.pos, "H")
        XCTAssertEqual(choose.unit(choose.turn)?.wedges.count, 6)
        let final = try pc("question-final")
        XCTAssertEqual(final.question?.final, true)
        XCTAssertEqual(final.question?.cat, 5)
        XCTAssertNil(final.question?.answer)
        let win = try pc("result-win")
        XCTAssertEqual(win.result?.win, true)
    }

    func testTheEnd() throws {
        let game = try pc("gameover")
        XCTAssertEqual(game.phase, .gameover)
        XCTAssertEqual(game.winners?.count, 1)
        XCTAssertEqual(game.name(game.winners?.first), "Dad")
    }

    func testAnUnknownPhaseDoesNotBlankTheScreen() throws {
        var text = try String(decoding: Fixture.data("pc-roll"), as: UTF8.self)
        text = text.replacingOccurrences(of: #""phase": "roll""#, with: #""phase": "something-new""#)
        let state = try JSONDecoder().decode(ServerState.self, from: Data(text.utf8))
        XCTAssertEqual(state.pieChase?.phase, .unknown)
        XCTAssertEqual(DisplayScreen.screen(for: state), .pieChase)
    }
}

/// Pie Chase's sounds: borrowed from Jeopardy's recordings, each meaning a moment of its own in this game.
final class PieChaseSoundTests: XCTestCase {
    private func cues(_ from: String, _ to: String) throws -> [SoundCue] {
        SoundPlanner.plan(from: try Fixture.state(from), to: try Fixture.state(to)).cues
    }

    func testTheGameMomentsEachHaveASound() throws {
        XCTAssertEqual(try cues("pc-lobby", "pc-rolloff"), [.roundstart])               // the game begins
        XCTAssertEqual(try cues("pc-rolloff-tie", "pc-rolloff-done"), [.pick])          // a die is rolled
        XCTAssertEqual(try cues("pc-roll", "pc-move"), [.pick])
        XCTAssertEqual(try cues("pc-move", "pc-question-hq"), [.open])                  // a question comes up
        XCTAssertEqual(try cues("pc-question-hq", "pc-result-wedge"), [.dd])            // a wedge is won
        XCTAssertEqual(try cues("pc-question", "pc-result-wrong"), [.wrong])
        XCTAssertEqual(try cues("pc-choose-final", "pc-question-final"), [.finalSting]) // the winning question
        XCTAssertEqual(try cues("pc-question-final", "pc-result-win"), [.fanfare])
        XCTAssertEqual(try cues("pc-result-win", "pc-gameover"), [.applause])
    }

    func testPieChaseBorrowsJeopardysSoundsAndKeepsItsOwn() {
        XCTAssertEqual(BundledSounds.parse(stem: "piechase__open")?.game, "piechase")
        XCTAssertTrue(CustomSoundStore.games.contains("piechase"))
    }
}
