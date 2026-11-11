import XCTest
@testable import GameNightCore

/// The JSON in Fixtures/ was recorded from the real Game Night server (a scripted
/// game played over WebSockets), except lobby-teams, no-game-chosen and other-game,
/// which are hand-made. If the server's views change, record new ones.
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
        XCTAssertGreaterThan(names.count, 20)
        for name in names {
            XCTAssertNoThrow(try Fixture.state(name), "\(name) should decode")
        }
    }

    func testServerMessageEnvelope() throws {
        let view = try String(decoding: Fixture.data("board"), as: UTF8.self)
        let json = Data(#"{"t":"state","view":\#(view)}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(ServerMessageKind.self, from: json).t, "state")
        let message = try JSONDecoder().decode(StateMessage.self, from: json)
        XCTAssertEqual(message.view.jeopardy?.status, .board)
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

    // MARK: Lobby and room

    func testLobbyWithPlayers() throws {
        let state = try Fixture.state("lobby-players")
        XCTAssertFalse(state.room.inProgress)
        XCTAssertEqual(state.room.units.map(\.name), ["Leo", "Maya", "Dad", "Grandma"])
        XCTAssertEqual(state.room.units.first?.color, "#14b8a6")
        XCTAssertEqual(state.jeopardy?.lobbyTitle, "Family Night Sampler")
        XCTAssertEqual(state.jeopardy?.status, .lobby)
    }

    func testTeamLobby() throws {
        let room = try Fixture.state("lobby-teams").room
        XCTAssertTrue(room.isTeamMode)
        XCTAssertEqual(room.units.map(\.members), [3, 2])
        XCTAssertEqual(room.units.map(\.connected), [true, false])
        XCTAssertEqual(room.unit("t2")?.name, "Team 2")
        XCTAssertNil(room.unit("nobody"))
        XCTAssertNil(room.unit(nil))
    }

    // MARK: Team play (recorded from the server with six players)

    func testAutoTeamsLobby() throws {
        let room = try Fixture.state("teams-lobby").room
        XCTAssertTrue(room.isTeamMode)
        XCTAssertEqual(room.units.map(\.name), ["Red", "Blue"])
        XCTAssertEqual(room.units.map(\.color), ["#ef4444", "#3b82f6"])
        XCTAssertEqual(room.units.map(\.members), [3, 3])
        XCTAssertEqual(room.units.flatMap { $0.memberNames ?? [] }.sorted(), ["Ann", "Ben", "Cat", "Dev", "Eli", "Fay"])
        XCTAssertEqual(room.settings.sound, true)
    }

    func testFourTeams() throws {
        let room = try Fixture.state("teams-lobby-four").room
        XCTAssertEqual(room.units.map(\.name), ["Red", "Blue", "Green", "Yellow"])
        XCTAssertEqual(room.units.map(\.color), ["#ef4444", "#3b82f6", "#22c55e", "#eab308"])
        XCTAssertEqual(room.units.map(\.members).sorted(), [1, 1, 2, 2])
        for unit in room.units { XCTAssertEqual(unit.memberNames?.count, unit.members) }
    }

    func testIndividualPlayHasNoMemberList() throws {
        XCTAssertNil(try Fixture.state("lobby-players").room.units.first?.memberNames)
    }

    func testTeamsPlayAGame() throws {
        let answering = try XCTUnwrap(try Fixture.jeopardy("teams-clue-answering").clue)
        let room = try Fixture.state("teams-clue-answering").room
        XCTAssertNotNil(room.unit(answering.buzzedBy), "buzzedBy is a team")
        XCTAssertNotEqual(answering.buzzedBy, answering.buzzedPlayer, "the player who pressed is not the team")
        let revealed = try Fixture.state("teams-board-after-clue")
        XCTAssertEqual(revealed.room.units.map(\.score).sorted(), [0, 400])
        XCTAssertNotNil(revealed.jeopardy?.control)
    }

    func testFinalWagerListsEveryoneButOnlyQualifiedTeamsPlay() throws {
        let state = try Fixture.state("teams-final-wager")
        let round = try XCTUnwrap(state.jeopardy?.finalRound)
        XCTAssertEqual(round.step, .wager)
        XCTAssertEqual(state.room.units.count, 2, "everyone's score is in the state the TV and phones receive")
        XCTAssertEqual(round.finalists.count, 1, "only the team with points plays the final round")
        let finalist = try XCTUnwrap(state.room.unit(round.finalists[0].id))
        XCTAssertEqual(finalist.score, 400)
        XCTAssertEqual(state.room.units.filter { $0.id != finalist.id }.map(\.score), [0])
    }

    func testNoGameChosen() throws {
        let state = try Fixture.state("no-game-chosen")
        XCTAssertEqual(state.game, .noGame)
        XCTAssertNil(state.room.gameId)
    }

    func testUnknownGameIsUnsupportedNotAnError() throws {
        XCTAssertEqual(try Fixture.state("other-game").game, .unsupported(id: "bingo"))
    }

    // MARK: Board and clues

    func testBoardShape() throws {
        let game = try Fixture.jeopardy("board")
        XCTAssertEqual(game.status, .board)
        XCTAssertEqual(game.categories.count, 6)
        XCTAssertEqual(game.categories.first, "Around the World")
        XCTAssertEqual(game.board.count, 6)
        XCTAssertEqual(game.board[0].map(\.value), [200, 400, 600, 800, 1000])
        XCTAssertTrue(game.board.joined().allSatisfy { !$0.used })
    }

    func testBoardAfterAClueMarksItUsedAndGivesControl() throws {
        let game = try Fixture.jeopardy("board-after-clue")
        XCTAssertTrue(game.board[0][1].used)
        XCTAssertFalse(game.board[0][0].used)
        XCTAssertEqual(game.control, "p1")
        XCTAssertNil(game.clue)
    }

    func testClueSteps() throws {
        XCTAssertEqual(try Fixture.jeopardy("clue-reading").clue?.step, .reading)
        XCTAssertNil(try Fixture.jeopardy("clue-reading").clue?.timer)

        let open = try XCTUnwrap(try Fixture.jeopardy("clue-open").clue)
        XCTAssertEqual(open.step, .open)
        XCTAssertEqual(open.category, "Around the World")
        XCTAssertEqual(open.value, 400)
        XCTAssertEqual(open.text, "The capital of Australia, and it is not Sydney.")
        XCTAssertNil(open.answer)
        XCTAssertEqual(open.timer, TimerState(kind: "buzz", totalMs: 10000, leftMs: 10000, timedOut: false))

        let answering = try XCTUnwrap(try Fixture.jeopardy("clue-answering").clue)
        XCTAssertEqual(answering.step, .answering)
        XCTAssertEqual(answering.buzzedBy, "p2")
        XCTAssertEqual(answering.timer?.kind, "answer")

        let afterWrong = try XCTUnwrap(try Fixture.jeopardy("clue-open-after-wrong").clue)
        XCTAssertEqual(afterWrong.step, .open)
        XCTAssertEqual(afterWrong.lockedOut, ["p2"])

        let revealed = try XCTUnwrap(try Fixture.jeopardy("clue-revealed-correct").clue)
        XCTAssertEqual(revealed.step, .revealed)
        XCTAssertEqual(revealed.answer, "Canberra")
        XCTAssertEqual(revealed.correct, "p1")
        XCTAssertNil(revealed.timer)

        let nobody = try XCTUnwrap(try Fixture.jeopardy("clue-revealed-nobody").clue)
        XCTAssertNil(nobody.correct)
        XCTAssertNotNil(nobody.answer)
    }

    func testDailyDouble() throws {
        let pick = try XCTUnwrap(try Fixture.jeopardy("dd-pick-player").clue)
        XCTAssertTrue(pick.dd)
        XCTAssertEqual(pick.step, .wager)
        XCTAssertNil(pick.text, "the clue stays hidden until the wager is set")

        let answering = try XCTUnwrap(try Fixture.jeopardy("dd-answering").clue)
        XCTAssertEqual(answering.wager, 400)
        XCTAssertEqual(answering.ddUnit, "p3")
        XCTAssertNotNil(answering.text)
    }

    func testLeaderboardView() throws {
        let game = try Fixture.jeopardy("leaderboard")
        XCTAssertEqual(game.view, "leaderboard")
        XCTAssertEqual(game.status, .board)
    }

    // MARK: Final Jeopardy

    func testFinalJeopardySteps() throws {
        let wager = try XCTUnwrap(try Fixture.jeopardy("final-wager").finalRound)
        XCTAssertEqual(wager.step, .wager)
        XCTAssertNil(wager.text)
        XCTAssertEqual(wager.finalists.map(\.wagered), [false, false])

        let locked = try XCTUnwrap(try Fixture.jeopardy("final-wager-locked").finalRound)
        XCTAssertEqual(locked.finalists.map(\.wagered), [true, true])
        XCTAssertNil(locked.finalists[0].wager, "wagers stay hidden until judged")

        let clue = try XCTUnwrap(try Fixture.jeopardy("final-clue").finalRound)
        XCTAssertEqual(clue.step, .clue)
        XCTAssertEqual(clue.timer?.kind, "final")
        XCTAssertEqual(clue.timer?.totalMs, 30000)
        XCTAssertNotNil(clue.text)

        let answered = try XCTUnwrap(try Fixture.jeopardy("final-clue-answered").finalRound)
        XCTAssertEqual(answered.finalists.map(\.answered), [true, true])

        XCTAssertEqual(try Fixture.jeopardy("final-judge").finalRound?.step, .judge)
    }

    func testFinalJeopardyResults() throws {
        let results = try XCTUnwrap(try Fixture.jeopardy("final-results").finalRound)
        XCTAssertEqual(results.step, .results)
        XCTAssertEqual(results.answer, "John Adams")
        XCTAssertEqual(results.finalists[0].result, true)
        XCTAssertEqual(results.finalists[0].answer, "John Adams")
        XCTAssertEqual(results.finalists[0].wager, 200)
        XCTAssertEqual(results.finalists[1].result, false)
        XCTAssertTrue(results.finalists.allSatisfy(\.judged))
    }

    func testDone() throws {
        let state = try Fixture.state("done")
        XCTAssertEqual(state.jeopardy?.status, .done)
        XCTAssertEqual(state.room.units.map(\.score), [600, -400, 200, 0])
    }

    // MARK: Rounds

    func testTwoRoundGameCarriesTheRound() throws {
        let first = try Fixture.jeopardy("rounds-board-1")
        XCTAssertEqual(first.round, 1)
        XCTAssertEqual(first.rounds, 2)
        XCTAssertEqual(first.roundTitle, "Jeopardy!")
        let second = try Fixture.jeopardy("rounds-board-2")
        XCTAssertEqual(second.round, 2)
        XCTAssertEqual(second.roundTitle, "Double Jeopardy!")
        XCTAssertEqual(second.board[0][0].value, 400, "round two is worth double")
    }

    func testSidebarNamesTheRoundOnlyInTwoRoundGames() throws {
        XCTAssertEqual(try Fixture.jeopardy("rounds-board-1").sidebarTitle, "Jeopardy!")
        XCTAssertEqual(try Fixture.jeopardy("rounds-board-2").sidebarTitle, "Double Jeopardy!")
        // Recorded before rounds existed: no round fields, so it is one round and shows the set's name.
        let old = try Fixture.jeopardy("board")
        XCTAssertNil(old.rounds)
        XCTAssertFalse(old.isTwoRounds)
        XCTAssertEqual(old.sidebarTitle, "Family Night Sampler")
    }

    // MARK: Leniency

    func testUnknownValuesDoNotBreakDecoding() throws {
        var text = try String(decoding: Fixture.data("clue-open"), as: UTF8.self)
        text = text.replacingOccurrences(of: "\"step\": \"open\"", with: "\"step\": \"something-new\"")
        let state = try JSONDecoder().decode(ServerState.self, from: Data(text.utf8))
        XCTAssertEqual(state.jeopardy?.clue?.step, .unknown)
    }

    func testExtraFieldsAreIgnored() throws {
        var text = try String(decoding: Fixture.data("board"), as: UTF8.self)
        text = text.replacingOccurrences(of: "\"status\": \"board\"", with: "\"status\": \"board\", \"brandNewField\": [1, 2, 3]")
        XCTAssertNoThrow(try JSONDecoder().decode(ServerState.self, from: Data(text.utf8)))
    }
}
