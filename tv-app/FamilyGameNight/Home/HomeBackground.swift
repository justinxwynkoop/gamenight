import SwiftUI

/// Dark backdrop with a soft glow in the highlighted game's colour.
struct HomeBackground: View {
    let accent: Color

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.03, blue: 0.10)
            RadialGradient(colors: [accent.opacity(0.55), .clear],
                           center: .center, startRadius: 40, endRadius: 1100)
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.5), value: accent)
    }
}
