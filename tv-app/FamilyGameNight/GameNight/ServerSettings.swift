import Foundation

/// The Game Night server address, typed once on the Apple TV and remembered.
enum ServerSettings {
    private static let key = "gamenight.serverAddress"

    static func load() -> ServerAddress? {
        guard let text = UserDefaults.standard.string(forKey: key) else { return nil }
        return ServerAddress.parse(text)
    }

    static func save(_ address: ServerAddress) {
        UserDefaults.standard.set(address.text, forKey: key)
    }

    private static let hereKey = "gamenight.runsHere"

    /// Whether the game runs on the Apple TV itself (the normal way) instead of on a Game Night server. It does unless the
    /// family chose a server, so a fresh install goes straight to the game with nothing to type.
    static var runsHere: Bool {
        get { UserDefaults.standard.object(forKey: hereKey) as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: hereKey) }
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
