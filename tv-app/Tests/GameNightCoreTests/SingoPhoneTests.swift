import XCTest
@testable import GameNightCore

/// Singo Night's phone cards: what the Apple TV reads from the engine (fixtures from scripts/record-tv-fixtures.mjs).
final class SingoPhoneTests: XCTestCase {
    private func message(_ name: String) throws -> Data {
        let view = try String(decoding: Fixture.data(name), as: UTF8.self)
        return Data(#"{"t":"state","view":\#(view)}"#.utf8)
    }

    func testWaitingBeforeTheFirstDeal() throws {
        let state = try XCTUnwrap(SingoPhoneState.from(message("singo-waiting")))
        XCTAssertEqual(state.status, "waiting")
        XCTAssertNil(state.round)
        XCTAssertTrue(state.claims.isEmpty)
        // The shared decoder sees a game it has no screens for, and does not fail.
        XCTAssertEqual(try Fixture.state("singo-waiting").game, .unsupported(id: "singo"))
    }

    func testClaimsAndWinners() throws {
        let state = try XCTUnwrap(SingoPhoneState.from(message("singo-claim")))
        let round = try XCTUnwrap(state.round)
        XCTAssertEqual(round.size, 5)
        XCTAssertEqual(round.playlist, "Road Trip")
        XCTAssertEqual(round.calledCount, 5)
        XCTAssertEqual(state.claims.map(\.ok), [false, true])
        XCTAssertEqual(state.claims[0].name, "Maya")
        XCTAssertFalse(state.claims[0].missing.isEmpty, "a claim called too early says which songs have not played")
        XCTAssertEqual(state.claims[1].line.count, 5)
        XCTAssertEqual(state.winners.map(\.name), ["Leo"])
        // Each claim is announced once.
        XCTAssertEqual(state.claim(after: 0)?.name, "Leo")
        XCTAssertNil(state.claim(after: 2))
    }

    func testOtherGamesAreNotSingo() throws {
        XCTAssertNil(SingoPhoneState.from(try message("jp-board")))
        XCTAssertNil(SingoPhoneState.from(Data(#"{"t":"pong"}"#.utf8)))
    }
}
