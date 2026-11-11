import SwiftUI

/// Placeholder for the Jeopardy screen. This will connect to the Game Night
/// server (github.com/justinxwynkoop/gamenight) as its TV display and draw the
/// board; see the roadmap in the README.
struct JeopardyRootView: View {
    let onExit: () -> Void

    var body: some View {
        VStack(spacing: 50) {
            Text("Jeopardy")
                .font(.system(size: 96, weight: .bold))
            Text("Coming soon. This screen will connect to your Game Night server and show the board.")
                .font(.title3)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 1100)
            Button("Back to games", action: onExit)
        }
        .onExitCommand(perform: onExit)
    }
}
