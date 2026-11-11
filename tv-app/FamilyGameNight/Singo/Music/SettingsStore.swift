import Foundation

/// Keeps the host's round settings between launches.
@Observable
final class SettingsStore {
    private static let key = "roundSettings"

    var settings: RoundSettings {
        didSet { save() }
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let saved = try? JSONDecoder().decode(RoundSettings.self, from: data) {
            settings = saved
        } else {
            settings = RoundSettings()
        }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }
}
