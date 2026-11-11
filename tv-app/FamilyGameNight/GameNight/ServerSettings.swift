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

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
