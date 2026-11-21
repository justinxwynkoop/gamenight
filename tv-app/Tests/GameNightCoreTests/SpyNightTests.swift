import XCTest
@testable import GameNightCore

/// Spy Night: what the Apple TV reads from the engine (fixtures from scripts/record-tv-fixtures.mjs).
final class SpyNightTests: XCTestCase {
    private func spy(_ name: String) throws -> SpyNightState {
        try XCTUnwrap(try Fixture.state("spy-\(name)").spyNight, "spy-\(name) is not a Spy Night state")
    }

    func testLobbyUsesTheSharedLobbyScreen() throws {
        let state = try Fixture.state("spy-lobby")
        XCTAssertEqual(DisplayScreen.screen(for: state), .lobby)
        XCTAssertEqual(state.lobbyTitle, "Spy Night")
        let game = try spy("lobby")
        XCTAssertEqual(game.phase, .lobby)
        XCTAssertEqual(game.players.count, 5)
        XCTAssertEqual(game.minPlayers, 5)
        XCTAssertEqual(game.maxPlayers, 10)
    }

    func testRolesAreDealtButNeverSentToTheTV() throws {
        let state = try Fixture.state("spy-roles")
        XCTAssertEqual(DisplayScreen.screen(for: state), .spyNight)
        let game = try spy("roles")
        XCTAssertEqual(game.phase, .roles)
        XCTAssertEqual(game.spyCount, 2)
        XCTAssertEqual(game.resistanceCount, 3)
        XCTAssertNil(game.roles, "nobody's role is on the TV while the game is running")
        XCTAssertEqual(try spy("roles-partial").readyIds?.count, 3)
    }

    func testPickingATeam() throws {
        let game = try spy("team")
        XCTAssertEqual(game.phase, .team)
        XCTAssertNotNil(game.player(game.leaderId))
        XCTAssertEqual(game.teamSize, 2)
        XCTAssertEqual(game.track.count, 5)
        XCTAssertEqual(game.track.map { $0.size }, [2, 3, 2, 3, 3])
        XCTAssertTrue(game.track[0].current)
        XCTAssertEqual(try spy("team-picked").team.count, 2)
    }

    func testVotesAreSecretUntilEveryoneHasVoted() throws {
        let during = try spy("vote")
        XCTAssertEqual(during.phase, .vote)
        XCTAssertEqual(during.votedIds?.count, 3)
        XCTAssertNil(during.votes, "how people voted is not shown until all are in")
        let after = try spy("vote-result")
        XCTAssertEqual(after.phase, .voteResult)
        XCTAssertEqual(after.votes?.count, 5)
        XCTAssertNotNil(after.approved)
    }

    func testAMissionShowsHowManyFailsButNotWho() throws {
        let playing = try spy("mission")
        XCTAssertEqual(playing.phase, .mission)
        XCTAssertNil(playing.roles)
        let done = try spy("mission-result")
        XCTAssertEqual(done.phase, .missionResult)
        let result = try XCTUnwrap(done.result)
        XCTAssertEqual(result.fails, 1)
        XCTAssertFalse(result.success)
        XCTAssertTrue(done.track[0].failed)
    }

    func testTheEndRevealsEveryRole() throws {
        let game = try spy("gameover")
        XCTAssertEqual(game.phase, .gameover)
        XCTAssertTrue(game.spiesWon)
        XCTAssertEqual(game.roles?.values.filter { $0 == "spy" }.count, 2)
        XCTAssertEqual(game.roles?.count, 5)
        XCTAssertEqual(game.track.filter { $0.failed }.count, 3)
    }

    func testAnUnknownPhaseDoesNotBlankTheScreen() throws {
        let json = #"{"room":{"mode":"players","teams":[],"units":[],"gameId":"spynight","inProgress":true,"settings":{"sound":true,"volume":70,"ping":0}},"game":{"game":"spynight","lobbyTitle":"Spy Night","phase":"something-new","minPlayers":5,"maxPlayers":10,"players":[],"mission":0,"track":[],"rejects":0,"maxRejects":5,"team":[],"line":{"text":"x","next":"y"}}}"#
        let state = try JSONDecoder().decode(ServerState.self, from: Data(json.utf8))
        XCTAssertEqual(state.spyNight?.phase, .unknown)
    }
}
