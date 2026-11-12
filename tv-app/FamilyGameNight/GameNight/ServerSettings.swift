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

    /// True once the family chose to run the game on the Apple TV itself instead of on a server. Remembered.
    static var runsHere: Bool {
        get { UserDefaults.standard.bool(forKey: hereKey) }
        set { UserDefaults.standard.set(newValue, forKey: hereKey) }
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
