import XCTest
@testable import GameNightCore

/// The JSON in Fixtures/ was recorded from the real game engine: jp-*.json by scripts/record-tv-fixtures.mjs in the
/// gamenight repo (a scripted Jeopardy game), feud-*.json from a scripted Family Feud game, and no-game-chosen and
/// other-game by hand. If the engine's views change, record new ones.
enum Fixture {
    static var directory: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Fixtures")
    }

    static func names() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(5)) }
            .sorted()
    }

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appendingPathComponent("\(name).json"))
    }

    static func state(_ name: String) throws -> ServerState {
        try JSONDecoder().decode(ServerState.self, from: data(name))
    }

    static func jeopardy(_ name: String) throws -> JeopardyState {
        let state = try state(name)
        return try XCTUnwrap(state.jeopardy, "\(name) is not a Jeopardy state")
    }
}

final class StateDecodingTests: XCTestCase {
    func testEveryRecordedStateDecodes() throws {
        let names = try Fixture.names()
        XCTAssertGreaterThan(names.count, 40)
        for name in names {
            XCTAssertNoThrow(try Fixture.state(name), "\(name) should decode")
        }
    }

    func testServerMessageEnvelope() throws {
        let view = try String(decoding: Fixture.data("jp-board"), as: UTF8.self)
        let json = Data(#"{"t":"state","view":\#(view)}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(ServerMessageKind.self, from: json).t, "state")
        let message = try JSONDecoder().decode(StateMessage.self, from: json)
        XCTAssertEqual(message.view.jeopardy?.phase, .board)
    }

    func testOtherMessagesAreNotStates() throws {
        let json = Data(#"{"t":"pong"}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(ServerMessageKind.self, from: json).t, "pong")
        XCTAssertThrowsError(try JSONDecoder().decode(StateMessage.self, from: json))
    }

    func testServerInfo() throws {
        let json = Data(#"{"joinUrl":"http://192.168.1.50:3000/","wifi":false}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(ServerInfo.self, from: json).joinUrl, "http://192.168.1.50:3000/")
    }

    func testNoGameChosen() throws {
        let state = try Fixture.state("no-game-chosen")
        XCTAssertEqual(state.game, .noGame)
        XCTAssertNil(state.room.gameId)
    }

    func testUnknownGameIsUnsupportedNotAnError() throws {
        XCTAssertEqual(try Fixture.state("other-game").game, .unsupported(id: "bingo"))
    }

    func testTimersWithoutTimedOutAreTimedOutOnlyAtZero() throws {
        let running = try JSONDecoder().decode(TimerState.self, from: Data(#"{"kind":"buzz","totalMs":7000,"leftMs":3000}"#.utf8))
        XCTAssertEqual(running, TimerState(kind: "buzz", totalMs: 7000, leftMs: 3000, timedOut: false))
        let done = try JSONDecoder().decode(TimerState.self, from: Data(#"{"kind":"buzz","totalMs":7000,"leftMs":0}"#.utf8))
        XCTAssertTrue(done.timedOut)
        let sent = try JSONDecoder().decode(TimerState.self, from: Data(#"{"kind":"fm","totalMs":30000,"leftMs":5000,"timedOut":true}"#.utf8))
        XCTAssertTrue(sent.timedOut, "Family Feud says so itself")
    }

    // MARK: Lobby

    func testLobby() throws {
        let state = try Fixture.state("jp-lobby")
        XCTAssertFalse(state.room.inProgress)
        XCTAssertEqual(state.room.mode, "players", "Jeopardy is always played by individuals")
        XCTAssertEqual(state.room.units.map(\.name), ["Leo", "Maya", "Dad"])
        let game = try XCTUnwrap(state.jeopardy)
        XCTAssertEqual(game.phase, .lobby)
        XCTAssertEqual(game.lobbyTitle, "Jeopardy")
        XCTAssertEqual(game.maxPlayers, 10, "rooms hold up to ten players")
        XCTAssertEqual(game.captainId, "p1", "the first to join is the captain")
        XCTAssertEqual(game.players.map(\.name), ["Leo", "Maya", "Dad"])
        XCTAssertFalse(game.hostJudges)
        XCTAssertNil(game.roundLabel)
    }

    func testLobbyPacks() throws {
        let game = try Fixture.jeopardy("jp-lobby")
        let packs = try XCTUnwrap(game.packs)
        let own = try XCTUnwrap(packs.first { $0.id == "own-family-night" })
        XCTAssertEqual(own.own, true, "your own boards are in the list")
        XCTAssertFalse(own.selected)
        XCTAssertTrue(packs.contains { $0.id == "house-classic" && $0.selected })
        XCTAssertEqual(game.categoryCount, 52)
        XCTAssertEqual(game.easyAvailable, true)
        XCTAssertEqual(game.easyMode, false)
    }

    func testQuestionChooserShelves() throws {
        let game = try Fixture.jeopardy("jp-lobby")
        let packs = try XCTUnwrap(game.packs)
        let own = try XCTUnwrap(packs.first { $0.id == "own-family-night" })
        XCTAssertEqual(own.shelf, .own)
        XCTAssertEqual(own.cats?.count, 6, "your games list their six categories")
        let classic = try XCTUnwrap(packs.first { $0.id == "house-classic" })
        XCTAssertEqual(classic.shelf, .house)
        XCTAssertEqual(classic.fresh, classic.count, "nothing has been shown on a new TV")
        XCTAssertEqual(game.freshCount, 52)
        XCTAssertEqual(game.seenCount, 0)
        let archive = try XCTUnwrap(Fixture.jeopardy("jp-lobby-archive").packs?.first { $0.archive == true })
        XCTAssertEqual(archive.shelf, .archive)
        let draft = try Fixture.jeopardy("jp-lobby-draft")
        XCTAssertEqual(draft.draftFresh?.map(\.count), [6, 6])
    }

    func testRealShowClues() throws {
        let loading = try Fixture.jeopardy("jp-lobby-loading")
        XCTAssertEqual(loading.hasArchive, true)
        XCTAssertEqual(loading.era, "classic")
        XCTAssertEqual(loading.archiveLoading, true)
        XCTAssertEqual(loading.eras, ["any", "classic", "2000s", "recent"])

        let loaded = try Fixture.jeopardy("jp-lobby-archive")
        XCTAssertEqual(loaded.archiveLoading, false)
        XCTAssertNotNil(loaded.archiveSeason)
        XCTAssertTrue(try XCTUnwrap(loaded.packs).contains { $0.archive == true })
        XCTAssertEqual(Seasons.label(12), "Season 12 (1995-96)")
        XCTAssertEqual(Seasons.label(42), "Season 42 (2025-26)")
        XCTAssertEqual(Seasons.label(nil), "")
    }

    func testBoardPreviewAndEasyMode() throws {
        let draft = try XCTUnwrap(try Fixture.jeopardy("jp-lobby-draft").draft)
        XCTAssertEqual(draft.map(\.count), [6, 6])
        XCTAssertEqual(try Fixture.jeopardy("jp-lobby-easy").easyMode, true)
    }

    // MARK: The status strip

    func testGuideSaysWhoseMomentItIsAndWhatComesNext() throws {
        let board = try Fixture.jeopardy("jp-board")
        XCTAssertEqual(board.guide?.pid, "p2")
        XCTAssertEqual(board.guide?.text, "Maya\u{2019}s pick")
        XCTAssertEqual(board.guide?.next, "Maya picks a clue on their phone")
        let roundEnd = try Fixture.jeopardy("jp-round-end")
        XCTAssertTrue(roundEnd.guide?.next?.contains("taps Continue") ?? false)
        // An older engine without the strip still decodes.
        var text = try String(decoding: Fixture.data("jp-board"), as: UTF8.self)
        text = text.replacingOccurrences(of: "\"guide\"", with: "\"guideOld\"")
        let old = try JSONDecoder().decode(ServerState.self, from: Data(text.utf8))
        XCTAssertNil(old.jeopardy?.guide)
    }

    // MARK: Board and clues

    func testBoardShape() throws {
        let game = try Fixture.jeopardy("jp-board")
        XCTAssertEqual(game.phase, .board)
        XCTAssertEqual(game.round, 1)
        XCTAssertEqual(game.rounds, 2)
        XCTAssertEqual(game.roundLabel, "Round 1")
        let board = try XCTUnwrap(game.board)
        XCTAssertEqual(board.count, 6)
        XCTAssertEqual(board[0].clues.map(\.value), [200, 400, 600, 800, 1000])
        XCTAssertTrue(board.flatMap(\.clues).allSatisfy { !$0.used })
        XCTAssertEqual(game.controllerId, "p2")
        XCTAssertEqual(game.player("p2")?.name, "Maya")
        XCTAssertEqual(game.name("nobody"), "Someone")
    }

    func testRoundTwoIsWorthDouble() throws {
        let game = try Fixture.jeopardy("jp-board-round-2")
        XCTAssertEqual(game.round, 2)
        XCTAssertEqual(game.roundLabel, "Round 2 · Double Up")
        XCTAssertEqual(game.board?[0].clues.map(\.value), [400, 800, 1200, 1600, 2000])
    }

    func testClueSteps() throws {
        let reading = try Fixture.jeopardy("jp-reading")
        XCTAssertEqual(reading.phase, .reading)
        XCTAssertEqual(reading.timer?.kind, "reading", "the bar that fills while the clue is read")
        XCTAssertEqual(reading.clue?.open, 0, "the buzzers have not opened yet")
        XCTAssertEqual(reading.clue?.q, "He came up with the theory of relativity.")
        XCTAssertNil(reading.clue?.answer, "the answer is never sent before the reveal")

        let open = try Fixture.jeopardy("jp-open")
        XCTAssertEqual(open.phase, .open)
        // The recording looks 10ms after the buzzers were due to open; they count from when they were due.
        XCTAssertEqual(open.timer, TimerState(kind: "buzz", totalMs: 7000, leftMs: 6990, timedOut: false))

        let answering = try Fixture.jeopardy("jp-answering")
        XCTAssertEqual(answering.phase, .answering)
        XCTAssertEqual(answering.clue?.buzzedId, "p2")
        XCTAssertEqual(answering.clue?.buzzMs, 310)
        XCTAssertEqual(answering.timer?.kind, "answer")
        XCTAssertEqual(answering.timer?.totalMs, 15000)
        let buzzes = try XCTUnwrap(answering.clue?.buzzes)
        XCTAssertEqual(buzzes.map(\.pid), ["p2", "p1"], "everyone's buzz is timed, fastest first")
        XCTAssertEqual(buzzes.map(\.ms), [310, 390])

        let wrong = try Fixture.jeopardy("jp-ruling-wrong")
        XCTAssertEqual(wrong.phase, .ruling)
        XCTAssertTrue(wrong.phase.isClue)
        XCTAssertEqual(wrong.lastResult?.answer, "definitely wrong")
        XCTAssertEqual(wrong.lastResult?.correct, false)
        XCTAssertEqual(wrong.lastResult?.timedOut, false)
        XCTAssertNil(wrong.clue?.answer, "the ruling comes before the answer")

        let afterWrong = try Fixture.jeopardy("jp-open-after-wrong")
        XCTAssertEqual(afterWrong.clue?.open, 2, "the buzzers open a second time")
        XCTAssertEqual(afterWrong.clue?.buzzes?.map(\.open), [1, 1])
        XCTAssertEqual(afterWrong.phase, .open)
        XCTAssertEqual(afterWrong.clue?.tried, ["p2"])
        XCTAssertEqual(afterWrong.lastResult?.correct, false)
        XCTAssertEqual(afterWrong.lastResult?.answer, "definitely wrong")
        XCTAssertEqual(afterWrong.timer?.totalMs, 6000)

        let right = try Fixture.jeopardy("jp-ruling-right")
        XCTAssertEqual(right.phase, .ruling)
        XCTAssertEqual(right.lastResult?.correct, true)

        let correct = try Fixture.jeopardy("jp-reveal-correct")
        XCTAssertEqual(correct.phase, .reveal)
        XCTAssertEqual(correct.clue?.answer, "Albert Einstein")
        XCTAssertEqual(correct.lastResult?.pid, "p3")
        XCTAssertEqual(correct.lastResult?.correct, true)
        XCTAssertEqual(correct.lastResult?.delta, 200)
        XCTAssertEqual(correct.controllerId, "p3", "whoever gets it right picks next")

        let nobody = try Fixture.jeopardy("jp-reveal-nobody")
        XCTAssertNil(nobody.lastResult)
        XCTAssertEqual(nobody.clue?.answer, "Isaac Newton")
    }

    func testRoundIntro() throws {
        let intro = try Fixture.jeopardy("jp-round-intro")
        XCTAssertEqual(intro.phase, .roundIntro)
        XCTAssertEqual(intro.round, 1)
        XCTAssertEqual(intro.timer?.kind, "intro")
        XCTAssertEqual(intro.board?.count, 6, "the categories are shown before the first pick")
        let second = try Fixture.jeopardy("jp-round-intro-2")
        XCTAssertEqual(second.phase, .roundIntro)
        XCTAssertEqual(second.round, 2)
    }

    func testHostJudging() throws {
        let reading = try Fixture.jeopardy("jp-host-reading")
        XCTAssertTrue(reading.hostJudges)
        XCTAssertEqual(reading.phase, .reading)
        let answering = try Fixture.jeopardy("jp-host-answering")
        XCTAssertEqual(answering.timer?.kind, "answer")
        XCTAssertEqual(answering.timer?.totalMs, 10000)
        XCTAssertEqual(answering.answerTime, 10)
    }

    func testDailyDouble() throws {
        let wager = try Fixture.jeopardy("jp-dd-wager")
        XCTAssertEqual(wager.phase, .ddWager)
        XCTAssertEqual(wager.clue?.dd, true)
        XCTAssertTrue((wager.clue?.q ?? "").isEmpty, "the clue stays hidden until the wager is set")

        let answer = try Fixture.jeopardy("jp-dd-answer")
        XCTAssertEqual(answer.phase, .ddAnswer)
        XCTAssertEqual(answer.clue?.wager, 300)
        XCTAssertNotNil(answer.clue?.q)
        XCTAssertEqual(answer.timer?.kind, "answer")
    }

    func testReactionsAndStreaks() throws {
        let game = try Fixture.jeopardy("jp-reaction")
        XCTAssertEqual(game.reactions, [JeoReaction(id: 1, pid: "p1", e: "\u{1F525}")])
        XCTAssertEqual(game.hotStreak, 3)
        XCTAssertEqual(game.player("p3")?.streak, 1)
    }

    func testRoundEnd() throws {
        let game = try Fixture.jeopardy("jp-round-end")
        XCTAssertEqual(game.phase, .roundEnd)
        XCTAssertEqual(game.round, 1)
    }

    // MARK: Final Jeopardy

    func testFinalJeopardySteps() throws {
        let wager = try Fixture.jeopardy("jp-final-wager")
        XCTAssertEqual(wager.phase, .finalWager)
        XCTAssertEqual(wager.roundLabel, "Final Jeopardy")
        let final = try XCTUnwrap(wager.finalRound)
        XCTAssertEqual(final.eligible, ["p1", "p3"], "only players with points play the final round")
        XCTAssertNil(final.q)
        XCTAssertEqual(final.wagered, [])

        let answer = try Fixture.jeopardy("jp-final-answer")
        XCTAssertEqual(answer.finalRound?.wagered, ["p1", "p3"])
        XCTAssertNotNil(answer.finalRound?.q)
        XCTAssertEqual(answer.timer?.kind, "final")
        XCTAssertEqual(answer.timer?.totalMs, 35000)
    }

    func testFinalAnswersAreShownOneByOne() throws {
        let response = try XCTUnwrap(try Fixture.jeopardy("jp-final-reveal-answer").finalRound)
        XCTAssertEqual(response.stage, "answer")
        XCTAssertEqual(response.order, ["p3", "p1"], "lowest score first")
        XCTAssertEqual(response.reveals.count, 1)
        XCTAssertEqual(response.reveals[0].answer, "no idea")
        XCTAssertEqual(response.reveals[0].pending, true, "right or wrong is not shown with the response")
        XCTAssertEqual(response.reveals[0].wager, 0)
        XCTAssertNil(response.answer)

        let first = try XCTUnwrap(try Fixture.jeopardy("jp-final-reveal-first").finalRound)
        XCTAssertEqual(first.stage, "verdict")
        XCTAssertEqual(first.reveals.count, 1)
        XCTAssertEqual(first.reveals[0].id, "p3")
        XCTAssertFalse(first.reveals[0].correct)
        XCTAssertEqual(first.reveals[0].pending, false)
        XCTAssertEqual(first.reveals[0].wager, 100)
        let more = try XCTUnwrap(try Fixture.jeopardy("jp-final-reveal-more").finalRound)
        XCTAssertEqual(more.reveals.map(\.id), ["p3", "p1"])
        XCTAssertEqual(more.reveals.map(\.correct), [false, true])
        XCTAssertNil(more.answer, "the correct answer comes after everyone")
        let done = try XCTUnwrap(try Fixture.jeopardy("jp-final-reveal-done").finalRound)
        XCTAssertEqual(done.stage, "done")
        XCTAssertEqual(done.answerShown, true)
        XCTAssertEqual(done.answer, "Uranus")
    }

    func testGameOver() throws {
        let state = try Fixture.state("jp-gameover")
        let game = try XCTUnwrap(state.jeopardy)
        XCTAssertEqual(game.phase, .gameover)
        XCTAssertTrue(state.room.inProgress)
        XCTAssertEqual(game.awards?.map(\.id), ["fast", "brain", "hot", "roller"])
        XCTAssertEqual(game.awards?.first?.title, "Fastest Finger")
        XCTAssertEqual(state.room.units.map(\.score), [49310, -200, 400])
    }

    // MARK: Leniency

    func testUnknownValuesDoNotBreakDecoding() throws {
        var text = try String(decoding: Fixture.data("jp-open"), as: UTF8.self)
        text = text.replacingOccurrences(of: "\"phase\": \"open\"", with: "\"phase\": \"something-new\"")
        let state = try JSONDecoder().decode(ServerState.self, from: Data(text.utf8))
        XCTAssertEqual(state.jeopardy?.phase, .unknown)
        XCTAssertEqual(DisplayScreen.screen(for: state), .board, "an unknown step shows the board rather than nothing")
    }

    func testExtraFieldsAreIgnored() throws {
        var text = try String(decoding: Fixture.data("jp-board"), as: UTF8.self)
        text = text.replacingOccurrences(of: "\"phase\": \"board\"", with: "\"phase\": \"board\", \"brandNewField\": [1, 2, 3]")
        XCTAssertNoThrow(try JSONDecoder().decode(ServerState.self, from: Data(text.utf8)))
    }
}
